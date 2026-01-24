import { FilesetResolver, ObjectDetector } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import { MODEL_CONFIG } from './config.js';

/**
 * Initializes the MediaPipe Object Detector
 * @returns {Promise<ObjectDetector>} Initialized detector instance
 */
export async function initDetector() {
  // Loads the WASM / runtime files for vision tasks
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  // Create ObjectDetector
  const detector = await ObjectDetector.createFromOptions(vision, MODEL_CONFIG);
  
  return detector;
}

