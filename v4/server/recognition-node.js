/**
 * Node-only recognition: load image from path, run MediaPipe Object Detector (npm),
 * use shared recognition-core for result format. No headless browser.
 */

import { createCanvas, loadImage } from 'canvas';
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { processDetections } from '../lib/recognition-core.js';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';

let detector = null;

/**
 * Convert MediaPipe detection result to canonical raw-detection shape for recognition-core.
 * @param {Object} detectionResult - Result from detector.detect()
 * @returns {Array}
 */
function toCanonicalDetections(detectionResult) {
  const list = detectionResult?.detections ?? [];
  return list.map((det) => ({
    categories: det.categories?.map((c) => ({ categoryName: c.categoryName, score: c.score })),
    boundingBox: det.boundingBox
      ? {
          originX: det.boundingBox.originX,
          originY: det.boundingBox.originY,
          width: det.boundingBox.width,
          height: det.boundingBox.height,
        }
      : { originX: 0, originY: 0, width: 0, height: 0 },
  }));
}

/**
 * Initialize MediaPipe Object Detector (Node: npm package).
 * @param {number} threshold - Score threshold
 * @param {Object} modelConfig - MediaPipe model configuration (e.g. CONFIG.model)
 * @returns {Promise<ObjectDetector>}
 */
async function initDetector(threshold = 0.45, modelConfig = {}) {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const config = {
    ...modelConfig,
    baseOptions: {
      ...modelConfig.baseOptions,
      delegate: 'CPU', // Node has no WebGL; use CPU
    },
    runningMode: 'IMAGE',
    scoreThreshold: threshold,
  };
  return ObjectDetector.createFromOptions(vision, config);
}

/**
 * Recognize objects in an image file (Node).
 * @param {string} imagePath - Absolute path to image file
 * @param {Object} options - Same shape as browser: { classes, threshold, modelConfig }
 * @param {Array<string>} [options.classes=[]] - Class names to recognize
 * @param {number} [options.threshold=0.45] - Confidence threshold
 * @param {Object} [options.modelConfig={}] - MediaPipe model config (e.g. CONFIG.model)
 * @returns {Promise<Array>} Recognition results (unified format from recognition-core)
 */
export async function recognizeFromPath(imagePath, options = {}) {
  const { classes = [], threshold = 0.45, modelConfig = {} } = options;

  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  if (!detector) {
    detector = await initDetector(threshold, modelConfig);
  }

  const detectionResult = detector.detect(canvas);
  const rawDetections = toCanonicalDetections(detectionResult);
  return processDetections(rawDetections, {
    threshold,
    classes,
    getImage: () => null,
  });
}
