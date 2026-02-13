import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { MODEL_CONFIG } from './config.js';

/**
 * Initializes the MediaPipe Object Detector for web (VIDEO mode)
 * @returns {Promise<ObjectDetector>} Initialized detector instance
 */
export async function initDetector() {
  try {
    const wasmFilesPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);

    const config = {
      ...MODEL_CONFIG,
      runningMode: "VIDEO"
    };

    const detector = await ObjectDetector.createFromOptions(vision, config);
    return detector;
  } catch (error) {
    console.error('Error initializing MediaPipe detector:', error);
    throw error;
  }
}
