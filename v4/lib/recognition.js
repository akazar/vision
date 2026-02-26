/**
 * Browser-only recognition: MediaPipe Object Detector + shared recognition-core.
 * Use source-to-canvas.js to get a canvas from Video/Image/Blob, then call recognize(canvas, ...).
 */

let detector = null;

/**
 * Initialize MediaPipe Object Detector (browser: CDN).
 * @param {number} threshold - Score threshold
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<ObjectDetector>}
 */
async function initDetector(detectorOptions = {}) {
  const mediapipeModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm');
  const { FilesetResolver, ObjectDetector } = mediapipeModule;
  const wasmFilesPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
  const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);
  return ObjectDetector.createFromOptions(vision, detectorOptions);
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
 * Filter detections by object type.
 * @param {Array<{ categories?: Array<{ categoryName: string }> }>} detections - Array of detection objects (canonical shape)
 * @param {Array<string>} classes - Array of class names to filter (e.g. ['person', 'dog'])
 * @returns {Array} Filtered detections
 */
function filterDetectionsByClasses(detections, classes) {
  if (!classes || classes.length === 0) {
    return detections;
  }
  return detections.filter((det) => {
    const cat = det.categories?.[0];
    if (!cat) return false;
    const categoryName = (cat.categoryName || '').toLowerCase();
    return classes.some((cls) => categoryName.includes(String(cls).toLowerCase()));
  });
}

/**
 * Default ID generator (works in browser and Node 19+).
 * @returns {string}
 */
function defaultGenerateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Process raw detections into the unified result format.
 * @param {Array<{ categories?: Array<{ categoryName: string, score: number }>, boundingBox?: { originX: number, originY: number, width: number, height: number } }>} rawDetections - Detections in canonical shape
 * @param {Object} options
 * @param {Array<string>} [options.classes=[]] - Class filter (empty = all)
 * @param {() => string} [options.generateId] - ID generator for the batch
 * @param {() => (string|null)} [options.getImage] - Optional image (e.g. base64) for results
 * @returns {Array<{ id: string, class: string, confidence: number, coordinates: { x, y }, size: { width, height }, image?: string }>}
 */
function processDetections(rawDetections, options = {}) {
  const {
    classes = [],
    generateId = defaultGenerateId,
    getImage = () => null,
  } = options;

  const detections = rawDetections || [];
  let filtered = detections;
  if (classes && classes.length > 0) {
    filtered = filterDetectionsByClasses(filtered, classes);
  }

  const id = generateId();
  const image = typeof getImage === 'function' ? getImage() : null;

  return filtered.map((det) => {
    const cat = det.categories?.[0];
    const bbox = det.boundingBox || { originX: 0, originY: 0, width: 0, height: 0 };
    return {
      id,
      class: cat?.categoryName ?? '',
      confidence: cat?.score ?? 0,
      coordinates: { x: bbox.originX, y: bbox.originY },
      size: { width: bbox.width, height: bbox.height },
      ...(image != null ? { image } : {}),
    };
  });
}

/**
 * Recognize objects in an image (browser).
 * @param {HTMLCanvasElement} sourceCanvas - Canvas with the image (e.g. from imageToCanvas())
 * @param {Array<string>} classes - Class names to recognize (e.g. ['person', 'dog', 'car'])
 * @param {number} threshold - Confidence threshold (0–1)
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<Array>} Recognition results (unified format from recognition-core)
 */
async function recognize(sourceCanvas, config = {}) {
  if (!detector) {
    const detectorOptions = {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
        delegate: "GPU",
        runningMode: "IMAGE",
      },
      scoreThreshold: config.recognition.threshold,
      maxResults: config.recognition.maxResults || 10,
    };
    detector = await initDetector(detectorOptions);
  }
  const detectionResult = detector.detect(sourceCanvas);
  const rawDetections = toCanonicalDetections(detectionResult);
  return processDetections(rawDetections, {
    classes: config.recognition.classes,
    getImage: () => (sourceCanvas ? sourceCanvas.toDataURL('image/jpeg', 0.95) : null),
  });
}

export { recognize };
