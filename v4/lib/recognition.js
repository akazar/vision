/**
 * Browser-only recognition: MediaPipe Object Detector + shared recognition-core.
 * Use source-to-canvas.js to get a canvas from Video/Image/Blob, then call recognize(canvas, ...).
 */

import { processDetections } from './recognition-core.js';

let detector = null;

/**
 * Initialize MediaPipe Object Detector (browser: CDN).
 * @param {number} threshold - Score threshold
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<ObjectDetector>}
 */
async function initDetector(threshold = 0.45, modelConfig = {}) {
  const mediapipeModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm');
  const { FilesetResolver, ObjectDetector } = mediapipeModule;
  const wasmFilesPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
  const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);
  const config = {
    ...modelConfig,
    runningMode: 'IMAGE',
    scoreThreshold: threshold,
  };
  return ObjectDetector.createFromOptions(vision, config);
}

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
 * Recognize objects in an image (browser).
 * @param {HTMLCanvasElement} sourceCanvas - Canvas with the image (e.g. from imageToCanvas())
 * @param {Array<string>} classes - Class names to recognize (e.g. ['person', 'dog', 'car'])
 * @param {number} threshold - Confidence threshold (0–1)
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<Array>} Recognition results (unified format from recognition-core)
 */
async function recognize(sourceCanvas, classes = [], threshold = 0.45, modelConfig = {}) {
  if (!detector) {
    detector = await initDetector(threshold, modelConfig);
  }
  const detectionResult = detector.detect(sourceCanvas);
  const rawDetections = toCanonicalDetections(detectionResult);
  return processDetections(rawDetections, {
    threshold,
    classes,
    getImage: () => (sourceCanvas ? sourceCanvas.toDataURL('image/jpeg', 0.95) : null),
  });
}

export { recognize };
