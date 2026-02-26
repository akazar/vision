import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import ort from "onnxruntime-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * COCO 80 class names (YOLOv8n default pretrained on COCO).
 */
const COCO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat","traffic light",
  "fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse","sheep","cow",
  "elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie","suitcase","frisbee",
  "skis","snowboard","sports ball","kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket","bottle",
  "wine glass","cup","fork","knife","spoon","bowl","banana","apple","sandwich","orange",
  "broccoli","carrot","hot dog","pizza","donut","cake","chair","couch","potted plant","bed",
  "dining table","toilet","tv","laptop","mouse","remote","keyboard","cell phone","microwave","oven",
  "toaster","sink","refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush"
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function iou(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;

  const interX1 = Math.max(a.x, b.x);
  const interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const iw = Math.max(0, interX2 - interX1);
  const ih = Math.max(0, interY2 - interY1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;

  return union <= 0 ? 0 : inter / union;
}

// Simple per-class NMS
function nms(dets, iouThreshold = 0.45) {
  const byClass = new Map();
  for (const d of dets) {
    const key = d.classId;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(d);
  }

  const out = [];
  for (const [, arr] of byClass) {
    arr.sort((a, b) => b.conf - a.conf);
    while (arr.length) {
      const best = arr.shift();
      out.push(best);
      for (let i = arr.length - 1; i >= 0; i--) {
        if (iou(best.bbox, arr[i].bbox) > iouThreshold) arr.splice(i, 1);
      }
    }
  }
  return out;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Normalize image input to a Buffer or path Sharp can read.
 * Accepts: file path (string), Buffer, or data URL (data:image/...;base64,...).
 */
function normalizeImageInput(image) {
  if (Buffer.isBuffer(image)) return image;
  if (typeof image === "string" && image.startsWith("data:")) {
    const base64 = image.replace(/^data:image\/[^;]+;base64,/, "");
    return Buffer.from(base64, "base64");
  }
  return image; // path string
}

/**
 * Loads an image (path string, Buffer, or data URL), performs YOLO-style letterbox resize to (inputSize x inputSize),
 * returns input tensor + mapping context to convert boxes back to original image coords.
 */
async function loadImageAsYoloInput(image, inputSize = 640) {
  const normalized = normalizeImageInput(image);
  const img = sharp(normalized);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read image dimensions.");

  const origW = meta.width;
  const origH = meta.height;

  // Letterbox resize
  const r = Math.min(inputSize / origW, inputSize / origH);
  const newW = Math.round(origW * r);
  const newH = Math.round(origH * r);

  const padX = inputSize - newW;
  const padY = inputSize - newH;
  const padLeft = Math.floor(padX / 2);
  const padTop = Math.floor(padY / 2);

  const resized = await img
    .resize(newW, newH, { fit: "fill" })
    .extend({
      top: padTop,
      bottom: padY - padTop,
      left: padLeft,
      right: padX - padLeft,
      background: { r: 0, g: 0, b: 0 }
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data } = resized; // RGBRGB...
  const area = inputSize * inputSize;
  const chw = new Float32Array(3 * area);

  // HWC uint8 -> CHW float32 normalized [0..1]
  for (let i = 0; i < area; i++) {
    const r8 = data[i * 3 + 0];
    const g8 = data[i * 3 + 1];
    const b8 = data[i * 3 + 2];
    chw[i] = r8 / 255.0;
    chw[i + area] = g8 / 255.0;
    chw[i + 2 * area] = b8 / 255.0;
  }

  return {
    tensor: new ort.Tensor("float32", chw, [1, 3, inputSize, inputSize]),
    origW,
    origH,
    r,
    padLeft,
    padTop,
    inputSize
  };
}

/**
 * Parses YOLOv11 raw ONNX output.
 * Expected output shapes:
 *   [1, 84, 8400] OR [1, 8400, 84]
 * Where 84 = 4 box + 80 class scores (COCO).
 */
function parseYolov11RawOutput(outputTensor, confThreshold = 0.5) {
  const data = outputTensor.data;
  const dims = outputTensor.dims;

  if (dims.length !== 3) {
    throw new Error(`Unexpected output dims: ${dims.join("x")}`);
  }

  let numPred, numAttr, attrFirst;
  if (dims[1] === 84) {
    attrFirst = true;
    numAttr = dims[1];
    numPred = dims[2];
  } else if (dims[2] === 84) {
    attrFirst = false;
    numPred = dims[1];
    numAttr = dims[2];
  } else {
    throw new Error(
      `Unsupported output shape: ${dims.join("x")} (expected attr=84 in dim1 or dim2).`
    );
  }

  const dets = [];
  for (let i = 0; i < numPred; i++) {
    let cx, cy, w, h;

    if (attrFirst) {
      cx = data[0 * numPred + i];
      cy = data[1 * numPred + i];
      w  = data[2 * numPred + i];
      h  = data[3 * numPred + i];
    } else {
      const base = i * numAttr;
      cx = data[base + 0];
      cy = data[base + 1];
      w  = data[base + 2];
      h  = data[base + 3];
    }

    // best class
    let bestClass = -1;
    let bestScore = -Infinity;

    for (let c = 0; c < 80; c++) {
      const score = attrFirst
        ? data[(4 + c) * numPred + i]
        : data[i * numAttr + (4 + c)];

      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }

    // scores can be probabilities or logits depending on export;
    // if outside [0..1], apply sigmoid to be safe
    let conf = bestScore;
    if (conf < 0 || conf > 1) conf = sigmoid(conf);

    if (conf < confThreshold) continue;

    const x = cx - w / 2;
    const y = cy - h / 2;

    dets.push({
      classId: bestClass,
      conf,
      bbox: { x, y, w, h }
    });
  }

  return dets;
}

/**
 * Map 640x640 letterboxed bbox back to original image coordinates.
 */
function mapBoxToOriginal(bbox, ctx) {
  const x1 = (bbox.x - ctx.padLeft) / ctx.r;
  const y1 = (bbox.y - ctx.padTop) / ctx.r;
  const x2 = (bbox.x + bbox.w - ctx.padLeft) / ctx.r;
  const y2 = (bbox.y + bbox.h - ctx.padTop) / ctx.r;

  const ox1 = clamp(x1, 0, ctx.origW);
  const oy1 = clamp(y1, 0, ctx.origH);
  const ox2 = clamp(x2, 0, ctx.origW);
  const oy2 = clamp(y2, 0, ctx.origH);

  const ow = Math.max(0, ox2 - ox1);
  const oh = Math.max(0, oy2 - oy1);

  return { x: ox1, y: oy1, w: ow, h: oh };
}

let _session = null;

async function getSession() {
  if (_session) return _session;
  const modelPath = path.join(__dirname, "models", "yolo11n.onnx");
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model not found: ${modelPath}`);
  }
  _session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"]
  });
  return _session;
}


function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Run YOLO detection on an image.
 * @param {string|Buffer} image - File path to an image or image buffer
 * @param {object} [options] - Optional: { confThreshold?: number, iouThreshold?: number }
 * @returns {Promise<Array<{ id: number, class: string, confidence: number, x: number, y: number, width: number, height: number }>>}
 */
async function recognize(image, options = {}) {
  const confThreshold = options?.serverRecognition?.threshold ?? 0.5;
  const iouThreshold = options?.serverRecognition?.iouThreshold ?? 0.45;

  const session = await getSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const ctx = await loadImageAsYoloInput(image, 640);
  const feeds = { [inputName]: ctx.tensor };

  const results = await session.run(feeds);
  const outTensor = results[outputName];

  let dets = parseYolov11RawOutput(outTensor, confThreshold);
  dets = nms(dets, iouThreshold);

  return dets.map((d, index) => {
    const b = mapBoxToOriginal(d.bbox, ctx);
    const cls = COCO_CLASSES[d.classId] ?? `class_${d.classId}`;
    return {
      id: generateId(),
      class: cls,
      confidence: Math.round(d.conf * 10000) / 10000,
      coordinates: { x: Math.round(b.x), y: Math.round(b.y) },
      size: { width: Math.round(b.w), height: Math.round(b.h) },        
    };
  });
}

async function main() {
  const imageArg = process.argv[2];
  if (!imageArg) {
    console.error("Usage: node detect-yolo.mjs <local/path/to/image.jpg>");
    process.exit(1);
  }

  const imagePath = path.resolve(imageArg);
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  const session = await getSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const ctx = await loadImageAsYoloInput(imagePath, 640);
  const feeds = { [inputName]: ctx.tensor };

  const results = await session.run(feeds);
  const outTensor = results[outputName];

  // Parse + NMS
  let dets = parseYolov11RawOutput(outTensor, 0.5);
  dets = nms(dets, 0.45);

  const final = dets.map(d => {
    const b = mapBoxToOriginal(d.bbox, ctx);
    const cls = COCO_CLASSES[d.classId] ?? `class_${d.classId}`;
    const confidence = Math.round(d.conf * 10000) / 100; // percent, 2 decimals

    return {
      class: cls,
      coordinates: { x: Math.round(b.x), y: Math.round(b.y) },
      size: { width: Math.round(b.w), height: Math.round(b.h) },
      confidence
    };
  });

  console.log(final);
}

export { recognize };

// Run CLI only when this file is executed directly (e.g. node detect-yolo.mjs image.jpg)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    console.error("Detection failed:", err);
    process.exit(1);
  });
}