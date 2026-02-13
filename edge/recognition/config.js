// Detection / recognition constants
export const SMOOTH_ALPHA = 0.3; // EMA smoothing factor (0.2-0.4 = very smooth)
export const DEAD_ZONE_EPS = 2; // Ignore movements smaller than 2px
export const BASE_ALPHA = 0.25; // Base alpha for confidence-weighted smoothing
export const DETECTION_FPS = 12; // Target detection FPS (throttling)
export const DETECTION_INTERVAL_MS = 1000 / DETECTION_FPS; // ~83ms

// MediaPipe model configuration
export const MODEL_CONFIG = {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  scoreThreshold: 0.45,
  maxResults: 10,
};
