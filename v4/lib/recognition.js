/**
 * Recognition module for object detection using MediaPipe
 * Copied functionality from edge/recognition folder
 */

import { imageToCanvas } from './source-to-canvas.js';

// Global detector instance
let detector = null;

/**
 * Initialize MediaPipe Object Detector
 * @param {string} mode - 'VIDEO' or 'IMAGE'
 * @param {number} threshold - Score threshold
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<ObjectDetector>} Initialized detector instance
 */
async function initDetector(threshold = 0.45, modelConfig = {}) {
  try {
    // Dynamic import of MediaPipe from CDN
    // Using ES module import from jsDelivr CDN
    const mediapipeModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm');
    const { FilesetResolver, ObjectDetector } = mediapipeModule;
    
    const wasmFilesPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);

    const config = {
      ...modelConfig,
      runningMode: 'IMAGE',
      scoreThreshold: threshold
    };

    const detectorInstance = await ObjectDetector.createFromOptions(vision, config);
    return detectorInstance;
  } catch (error) {
    console.error('Error initializing MediaPipe detector:', error);
    throw error;
  }
}

/**
 * Filter detections by object type (copied from filter.js)
 * @param {Array} detections - Array of detection objects
 * @param {Array<string>} classes - Array of class names to filter
 * @returns {Array} Filtered detections
 */
function filterDetectionsByClasses(detections, classes) {
  if (!classes || classes.length === 0) {
    return detections;
  }

  return detections.filter(det => {
    const cat = det.categories?.[0];
    if (!cat) return false;
    const categoryName = cat.categoryName.toLowerCase();
    return classes.some(cls => categoryName.includes(cls.toLowerCase()));
  });
}

/**
 * Recognize objects in image from camera stream
 * @param {HTMLVideoElement|HTMLCanvasElement|Blob|HTMLImageElement} image - Image source from camera stream
 * @param {Array<string>} classes - Array of class names to recognize (e.g., ['person', 'dog', 'car'])
 * @param {number} threshold - Threshold value for recognition confidence (0-1)
 * @param {Object} modelConfig - MediaPipe model configuration
 * @returns {Promise<Array>} Recognition results array with class, coordinates, and size
 */
async function recognize(sourceCanvas, classes = [], threshold = 0.45, modelConfig = {}) {
  try {
    // Initialize or reinitialize detector if needed
    if (!detector) {
      detector = await initDetector(threshold, modelConfig);
    }
    const detectionResult = detector.detect(sourceCanvas);
    
    // Convert canvas to base64 image
    const base64Image = sourceCanvas ? sourceCanvas.toDataURL('image/jpeg', 0.95) : null;

    // Get detections from result
    const detections = detectionResult.detections || [];
    
    // Filter by threshold
    let filteredDetections = detections.filter(det => {
      const cat = det.categories?.[0];
      return cat && cat.score >= threshold;
    });
    
    // Filter by classes if provided
    if (classes && classes.length > 0) {
      filteredDetections = filterDetectionsByClasses(filteredDetections, classes);
    }

    // Unique id for this recognition batch (same for all objects in the array)
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Format results
    const results = filteredDetections.map(det => {
      const cat = det.categories?.[0];
      const bbox = det.boundingBox;
      
      return {
        id,
        class: cat.categoryName,
        confidence: cat.score,
        coordinates: {
          x: bbox.originX,
          y: bbox.originY
        },
        size: {
          width: bbox.width,
          height: bbox.height
        },
        image: base64Image
      };
    });

    return results;
  } catch (error) {
    console.error('Error in recognize function:', error);
    throw error;
  }
}

export { recognize };
