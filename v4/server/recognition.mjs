import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";
import CONFIG from "../config.js";

const MP_VERSION = "0.10.32";
const TASKS_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const url = args.includes("--url");
  const imagePath = args.find((a) => !a.startsWith("--"));
  if (!imagePath) throw new Error("Usage: node recognition.mjs <imagePath> [--url]");
  return { imagePath, url };
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
      baseOptions: config.model.baseOptions,
      scoreThreshold: config.recognition.threshold,
      maxResults: config.recognition.maxResults || 10,
    };

    const result = await page.evaluate(async (payload) => {
      const { TASKS_MODULE, WASM_BASE, detectorOptions, dataUrl } = payload;

      try {
        const vision = await import(TASKS_MODULE);
        const { FilesetResolver, ObjectDetector } = vision;

        const loadImageData = async (src) => {
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = (e) => reject(e);
            i.src = src;
          });

          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);

          return { imageData, img };
        };

        const { imageData, img } = await loadImageData(dataUrl);

        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

        const detector = await ObjectDetector.createFromOptions(fileset, detectorOptions);

        const det = detector.detect(imageData);
        detector.close?.();

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

        const out = (det?.detections ?? []).map((d, i) => {
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

        return { ok: true, out };
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e), stack: String(e?.stack ?? "") };
      }
    }, { TASKS_MODULE, WASM_BASE, detectorOptions, dataUrl });

    if (!result?.ok) {
      throw new Error(`In-page error: ${result?.error}\n${result?.stack || ""}`);
    }

    return result.out;
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

main().catch((err) => {
  console.error("Error:", err?.stack ?? err);
  process.exit(1);
});
