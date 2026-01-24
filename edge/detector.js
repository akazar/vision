import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { MODEL_CONFIG } from './config.js';

/**
 * Initializes the MediaPipe Object Detector for web (VIDEO mode)
 * @returns {Promise<ObjectDetector>} Initialized detector instance
 */
export async function initDetector() {
  try {
    // Browser: use CDN for WASM files
    const wasmFilesPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";

    // Loads the WASM / runtime files for vision tasks
    const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);

    // Create ObjectDetector with VIDEO running mode
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

