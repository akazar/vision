/**
 * Browser-side YOLOv11n object detection (ONNX Runtime Web).
 * Entry point: recognizeWithYolo(source, config).
 * Requires global `ort` from onnxruntime-web (e.g. script tag in the page).
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function iou(a, b) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

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

function nmsPerClass(dets, iouThreshold = 0.45) {
  const byClass = new Map();
  for (const d of dets) {
    if (!byClass.has(d.classId)) byClass.set(d.classId, []);
    byClass.get(d.classId).push(d);
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

let yoloSession = null;

async function getYoloSession() {
  if (yoloSession) return yoloSession;
  if (typeof ort === 'undefined') {
    throw new Error('ONNX Runtime Web (ort) is not loaded. Make sure ort.min.js is included.');
  }
  const modelUrl = new URL('./models/yolo11n.onnx', import.meta.url).href;
  yoloSession = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
  });
  return yoloSession;
}

async function imageToYoloTensor(imgEl, inputSize = 640) {
  const origW = imgEl.naturalWidth;
  const origH = imgEl.naturalHeight;

  const r = Math.min(inputSize / origW, inputSize / origH);
  const newW = Math.round(origW * r);
  const newH = Math.round(origH * r);

  const padX = inputSize - newW;
  const padY = inputSize - newH;
  const padLeft = Math.floor(padX / 2);
  const padTop = Math.floor(padY / 2);

  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

  ctx2d.fillStyle = 'black';
  ctx2d.fillRect(0, 0, inputSize, inputSize);

  ctx2d.drawImage(imgEl, 0, 0, origW, origH, padLeft, padTop, newW, newH);

  const imageData = ctx2d.getImageData(0, 0, inputSize, inputSize).data;
  const area = inputSize * inputSize;
  const chw = new Float32Array(3 * area);

  for (let i = 0; i < area; i++) {
    const r8 = imageData[i * 4 + 0];
    const g8 = imageData[i * 4 + 1];
    const b8 = imageData[i * 4 + 2];

    chw[i] = r8 / 255.0;
    chw[i + area] = g8 / 255.0;
    chw[i + 2 * area] = b8 / 255.0;
  }

  return {
    tensor: new ort.Tensor('float32', chw, [1, 3, inputSize, inputSize]),
    origW,
    origH,
    r,
    padLeft,
    padTop,
    inputSize,
  };
}

function parseYolov11RawOutput(outTensor, confThreshold = 0.5) {
  const data = outTensor.data;
  const dims = outTensor.dims;

  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error(`Unexpected output dims: ${dims}`);
  }

  let numPred;
  let numAttr;
  let attrFirst;
  if (dims[1] === 84) {
    attrFirst = true;
    numAttr = dims[1];
    numPred = dims[2];
  } else if (dims[2] === 84) {
    attrFirst = false;
    numPred = dims[1];
    numAttr = dims[2];
  } else {
    throw new Error(`Unsupported output shape: ${dims.join('x')} (expected 84 in dim1 or dim2).`);
  }

  const dets = [];
  for (let i = 0; i < numPred; i++) {
    let cx;
    let cy;
    let w;
    let h;
    if (attrFirst) {
      cx = data[0 * numPred + i];
      cy = data[1 * numPred + i];
      w = data[2 * numPred + i];
      h = data[3 * numPred + i];
    } else {
      const base = i * numAttr;
      cx = data[base + 0];
      cy = data[base + 1];
      w = data[base + 2];
      h = data[base + 3];
    }

    let bestClass = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < 80; c++) {
      const score = attrFirst ? data[(4 + c) * numPred + i] : data[i * numAttr + (4 + c)];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }

    let conf = bestScore;
    if (conf < 0 || conf > 1) conf = sigmoid(conf);
    if (conf < confThreshold) continue;

    dets.push({
      classId: bestClass,
      conf,
      bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
    });
  }
  return dets;
}

function mapBoxToOriginal(bbox, ctx) {
  const x1 = (bbox.x - ctx.padLeft) / ctx.r;
  const y1 = (bbox.y - ctx.padTop) / ctx.r;
  const x2 = (bbox.x + bbox.w - ctx.padLeft) / ctx.r;
  const y2 = (bbox.y + bbox.h - ctx.padTop) / ctx.r;

  const ox1 = clamp(x1, 0, ctx.origW);
  const oy1 = clamp(y1, 0, ctx.origH);
  const ox2 = clamp(x2, 0, ctx.origW);
  const oy2 = clamp(y2, 0, ctx.origH);

  return {
    x: ox1,
    y: oy1,
    w: Math.max(0, ox2 - ox1),
    h: Math.max(0, oy2 - oy1),
  };
}

/**
 * Resolve Blob, HTMLImageElement, or HTMLCanvasElement to an HTMLImageElement (for YOLO input).
 * @param {Blob|HTMLImageElement|HTMLCanvasElement} source
 * @returns {Promise<HTMLImageElement>}
 */
export async function getImageFromSource(source) {
  if (source instanceof HTMLImageElement && source.complete && source.naturalWidth) {
    return source;
  }
  if (source instanceof Blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(source);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image from Blob'));
      };
      img.src = url;
    });
  }
  if (source instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image from Canvas'));
      img.src = source.toDataURL('image/jpeg', 0.95);
    });
  }
  throw new Error('Unsupported image source type for YOLO recognition');
}

/**
 * Run YOLOv11n object detection on an image source (Blob, HTMLImageElement, or HTMLCanvasElement).
 * Returns detections in canonical shape: { class, confidence, coordinates, size }[].
 * @param {Blob|HTMLImageElement|HTMLCanvasElement} source
 * @returns {Promise<Array<{ class: string, confidence: number, coordinates: { x, y }, size: { width, height } }>>}
 */
export async function recognizeWithYolo(source, config) {
  const sess = await getYoloSession();
  const inputName = sess.inputNames[0];
  const outputName = sess.outputNames[0];

  const img = await getImageFromSource(source);
  const prep = await imageToYoloTensor(img, 640);
  const results = await sess.run({ [inputName]: prep.tensor });
  const outTensor = results[outputName];

  let dets = parseYolov11RawOutput(outTensor, 0.5);
  dets = nmsPerClass(dets, 0.45);

  const final = dets.map((d) => {
    const b = mapBoxToOriginal(d.bbox, prep);
    const cls = config.recognition.classes[d.classId] ?? `class_${d.classId}`;
    const confidence = d.conf;

    return {
      class: cls,
      confidence,
      coordinates: { x: Math.round(b.x), y: Math.round(b.y) },
      size: { width: Math.round(b.w), height: Math.round(b.h) },
    };
  });

  return final;
}
