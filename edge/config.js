// API configuration - uses relative URL for production, absolute for development
// In production (deployed), this will use the same origin as the frontend
// For local development, set API_BASE_URL to 'http://localhost:3001'
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
export const API_BASE_URL = isProduction ? '' : 'http://localhost:3001';

// Object type mapping for filtering
export const OBJECT_TYPE_MAP = {
  person: ["person", "human"],
  pet: ["dog", "cat", "bird"],
  car: ["car", "truck", "bus", "motorcycle"]
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
