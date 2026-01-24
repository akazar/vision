// Configuration constants
export const SMOOTH_ALPHA = 0.3; // EMA smoothing factor (0.2-0.4 = very smooth)
export const DEAD_ZONE_EPS = 2; // Ignore movements smaller than 2px
export const BASE_ALPHA = 0.25; // Base alpha for confidence-weighted smoothing
export const DETECTION_FPS = 12; // Target detection FPS (throttling)
export const DETECTION_INTERVAL_MS = 1000 / DETECTION_FPS; // ~83ms

// API configuration - update this to match your server URL
// For production, change this to your deployed server URL
export const API_BASE_URL = 'http://localhost:3001';

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

// Drawing styles
export const DRAWING_STYLES = {
  lineWidth: 2,
  strokeStyle: "#00FFAA",
  shadowColor: "rgba(0,0,0,0.4)",
  shadowBlur: 4,
  font: "14px system-ui, -apple-system, Segoe UI, Roboto, Arial",
  borderRadius: 6,
  labelPadding: 4,
  labelHeight: 16,
};

// Object type filter configuration
export const OBJECT_TYPE_OPTIONS = [
  { value: "all", label: "All Objects" },
  { value: "person", label: "Person" },
  { value: "pet", label: "Pet" },
  { value: "car", label: "Car" }
];

export const DEFAULT_OBJECT_TYPE = "all";

// Auto capture interval configuration
export const AUTO_CAPTURE_INTERVAL_OPTIONS = [
  { value: 0, label: "Manual" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 20, label: "20 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "60 seconds" }
];

export const DEFAULT_AUTO_CAPTURE_INTERVAL = 0; // Manual mode

