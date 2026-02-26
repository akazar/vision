/**
 * Server-side object detection using Puppeteer and MediaPipe Tasks Vision.
 *
 * Logic:
 * - Image input is provided as a data URL (or, in CLI mode, read from disk or fetched from a URL).
 * - A headless browser is launched; the detection pipeline runs inside the page via page.evaluate()
 *   so that MediaPipe's browser-only APIs (Canvas, Image, WebAssembly) are available.
 * - In the page: the data URL is loaded into an Image, drawn to a canvas, and getImageData() is used
 *   to get pixel data for ObjectDetector. The detector runs, then results are normalized to a canonical
 *   shape (id, class, confidence, coordinates, size, optional cropped image data URL) and returned.
 * - The browser is closed and the array of detections is returned to the caller.
 *
 * Use cases:
 * - CLI: run detection on a local file or remote URL and print JSON (e.g. node server/recognition/mediapipe/detect-mediapipe.js ./image.jpg or node server/recognition/mediapipe/detect-mediapipe.js https://example.com/image.jpg --url).
 * - Programmatic: call recognize(dataUrl, config) from another server module (e.g. API or job queue) to get detections for a given image without a browser on the client.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import CONFIG from "../../../config.js";

const MP_VERSION = "0.10.32";
const TASKS_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const url = args.includes("--url");
  const imagePath = args.find((a) => !a.startsWith("--"));
  if (!imagePath) throw new Error("Usage: node detect-mediapipe.js <imagePath> [--url]");
  return { imagePath, url };
}

/**
 * Runs in browser context via page.evaluate. Loads image, runs MediaPipe object detection, returns canonical detections.
 * @param {{ TASKS_MODULE: string, WASM_BASE: string, detectorOptions: object, dataUrl: string }} payload
 * @returns {Promise<{ ok: boolean, out?: Array, error?: string, stack?: string }>}
 */
async function runDetectionInPage(payload) {
  const { TASKS_MODULE, WASM_BASE, detectorOptions, dataUrl } = payload;

  function processDetectionsToCanonical(det, img) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const generateId = () => {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    };
    const bestCategory = (cats) => {
      if (!Array.isArray(cats) || cats.length === 0)
        return { categoryName: "unknown", score: 0 };
      return cats.reduce((b, c) => (c.score > b.score ? c : b), cats[0]);
    };

    const cropToDataUrl = (bbox, mime = "image/jpeg") => {
      const x = clamp(Math.floor(bbox.originX || 0), 0, img.width);
      const y = clamp(Math.floor(bbox.originY || 0), 0, img.height);
      const w = clamp(Math.floor(bbox.width || 0), 0, img.width - x);
      const h = clamp(Math.floor(bbox.height || 0), 0, img.height - y);
      if (w <= 0 || h <= 0) return undefined;

      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return c.toDataURL(mime);
    };

    return (det?.detections ?? []).map((d) => {
      const cat = bestCategory(d.categories);
      const bbox = d.boundingBox;

      const item = {
        id: generateId(),
        class: cat.categoryName ?? "unknown",
        confidence: Number(cat.score ?? 0),
        coordinates: { x: Number(bbox.originX ?? 0), y: Number(bbox.originY ?? 0) },
        size: { width: Number(bbox.width ?? 0), height: Number(bbox.height ?? 0) },
      };

      const cropped = cropToDataUrl(bbox);
      if (cropped) item.image = cropped;

      return item;
    });
  }

  const vision = await import(TASKS_MODULE);
  const { FilesetResolver, ObjectDetector } = vision;

  const dataUrlToCanvas = async (src, documentObject) => {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = src;
    });

    const canvas = documentObject.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const sourceCanvas = ctx.getImageData(0, 0, img.width, img.height);

    return { sourceCanvas, img };
  };

  const { sourceCanvas, img } = await dataUrlToCanvas(dataUrl, document);

  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

  const detector = await ObjectDetector.createFromOptions(fileset, detectorOptions);

  const det = detector.detect(sourceCanvas);
  detector.close?.();

  const results = processDetectionsToCanonical(det, img);
  return results;
}

/**
 * Run object detection on an image.
 * @param {string} imagePath - Full path to the image file (e.g. "C:\\Users\\Artem_Kazarian\\Downloads\\image.jpg")
 * @param {{ crop?: boolean }} [options] - Optional: { crop: true } to include cropped detections as data URLs
 * @returns {Promise<Array>} Detected objects with id, class, confidence, x, y, width, height, and optionally image (crop)
 */
async function recognize(dataUrl, config) {
  const browser = await puppeteer.launch({ headless: "new" });

  try {
    const page = await browser.newPage();

    // Better error visibility
    page.on("console", (msg) => console.log("[page]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.error("[pageerror]", err?.stack ?? err));

    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`,
      { waitUntil: "domcontentloaded" }
    );

    const detectorOptions = {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
        delegate: "GPU",
        runningMode: "IMAGE",
      },
      scoreThreshold: config.serverRecognition.threshold,
      maxResults: config.serverRecognition.maxResults || 10,
    };

    const result = await page.evaluate(runDetectionInPage, {
      TASKS_MODULE,
      WASM_BASE,
      detectorOptions,
      dataUrl,
    });

    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const { imagePath, url } = parseArgs(process.argv);
  if (typeof imagePath !== "string" || !imagePath.trim()) {
    throw new Error("imagePath must be a non-empty string");
  }
  let dataUrl = null;

  if (url) {
    const response = await fetch(imagePath.trim());
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    dataUrl = `data:${blob.type};base64,${base64}`;
  } else {
    const absPath = path.resolve(imagePath.trim());
    const buf = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  }
  const out = await recognize(dataUrl, CONFIG);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

export { recognize };

// Run CLI only when this file is the entry point (e.g. node server/recognition/mediapipe/detect-mediapipe.js image.jpg), not when imported
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error("Error:", err?.stack ?? err);
    process.exit(1);
  });
}
