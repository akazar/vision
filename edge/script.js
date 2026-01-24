import {
  FilesetResolver,
  ObjectDetector
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const startBtn = document.getElementById("startBtn");
const switchBtn = document.getElementById("switchBtn");
const captureBtn = document.getElementById("captureBtn");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

let detector = null;
let stream = null;
let running = false;

// Prefer rear camera on mobile
let facingMode = "environment"; // or "user"

// Keep last time to avoid redundant work
let lastVideoTime = -1;

// -------------- Temporal Smoothing State -------------- 
const SMOOTH_ALPHA = 0.3; // EMA smoothing factor (0.2-0.4 = very smooth)
const DEAD_ZONE_EPS = 2; // Ignore movements smaller than 2px
const BASE_ALPHA = 0.25; // Base alpha for confidence-weighted smoothing
const DETECTION_FPS = 12; // Target detection FPS (throttling)
const DETECTION_INTERVAL_MS = 1000 / DETECTION_FPS; // ~83ms

const smoothBoxes = new Map(); // key -> smoothed bbox {x, y, w, h}
let lastInferTime = 0; // For frame-rate throttling
let lastDetectionData = []; // Store last detection data for capture

// API configuration - update this to match your server URL
// For production, change this to your deployed server URL
const API_BASE_URL = 'http://localhost:3001';

// -------------- Init detector (WASM + model) --------------
async function initDetector() {
  statusEl.textContent = "Loading model…";

  // Loads the WASM / runtime files for vision tasks
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  // Create ObjectDetector
  // (EfficientDet Lite0 is a good baseline for mobile)
  detector = await ObjectDetector.createFromOptions(vision, {
  baseOptions: {
          modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
          delegate: "GPU",
      },
      runningMode: "VIDEO",
      scoreThreshold: 0.45,
      maxResults: 10,
  });


  statusEl.textContent = "Model ready";
}

// -------------- Camera --------------
async function startCamera() {
  if (stream) stopCamera();

  statusEl.textContent = "Requesting camera…";

  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  await new Promise((res) => {
    video.onloadedmetadata = () => res();
  });

  // Ensure canvas internal resolution matches displayed size
  resizeOverlay();

  statusEl.textContent = "Camera started";
  switchBtn.disabled = false;
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

function resizeOverlay() {
  // Match canvas buffer to the on-screen video size
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

window.addEventListener("resize", resizeOverlay);

// -------------- Temporal Smoothing Functions --------------
/**
 * Smooths a bounding box using Exponential Moving Average (EMA)
 * @param {string} key - Unique identifier for the object (e.g., categoryName)
 * @param {Object} bbox - Current bounding box {x, y, w, h}
 * @param {number} confidence - Detection confidence (0-1) for dynamic alpha
 * @returns {Object} Smoothed bounding box {x, y, w, h}
 */
function smoothBBox(key, bbox, confidence = 0.5) {
  if (!smoothBoxes.has(key)) {
    smoothBoxes.set(key, { ...bbox });
    return bbox;
  }

  const prev = smoothBoxes.get(key);
  
  // Confidence-weighted smoothing: low confidence = smoother, high confidence = more responsive
  const dynamicAlpha = BASE_ALPHA + confidence * 0.4;
  const alpha = Math.max(0.1, Math.min(0.9, dynamicAlpha));
  
  const next = {
    x: prev.x + alpha * (bbox.x - prev.x),
    y: prev.y + alpha * (bbox.y - prev.y),
    w: prev.w + alpha * (bbox.w - prev.w),
    h: prev.h + alpha * (bbox.h - prev.h),
  };

  smoothBoxes.set(key, next);
  return next;
}

/**
 * Applies dead-zone filtering to remove micro-jitter
 * @param {Object} prev - Previous bounding box {x, y, w, h}
 * @param {Object} curr - Current bounding box {x, y, w, h}
 * @param {number} eps - Threshold in pixels (default: 2)
 * @returns {Object} Filtered bounding box {x, y, w, h}
 */
function applyDeadZone(prev, curr, eps = DEAD_ZONE_EPS) {
  return {
    x: Math.abs(curr.x - prev.x) < eps ? prev.x : curr.x,
    y: Math.abs(curr.y - prev.y) < eps ? prev.y : curr.y,
    w: Math.abs(curr.w - prev.w) < eps ? prev.w : curr.w,
    h: Math.abs(curr.h - prev.h) < eps ? prev.h : curr.h,
  };
}

/**
 * Draws a rounded rectangle with optional shadow
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {number} r - Corner radius (default: 6)
 */
function roundRect(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

// -------------- Coordinate mapping (important!) --------------
// Because video is object-fit: cover, the displayed pixels are a cropped/zoomed version
// of the source. We must map detection coords (in video pixel space) -> canvas CSS pixels.
function mapRectFromVideoToCanvas(bbox) {
  // bbox: {originX, originY, width, height} in VIDEO pixel coords
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  const view = video.getBoundingClientRect();
  const viewW = view.width;
  const viewH = view.height;

  // object-fit: cover scale
  const scale = Math.max(viewW / videoW, viewH / videoH);
  const scaledW = videoW * scale;
  const scaledH = videoH * scale;

  // crop offsets (how much is cut off on each axis)
  const offsetX = (scaledW - viewW) / 2;
  const offsetY = (scaledH - viewH) / 2;

  // Convert video pixel -> scaled displayed pixel -> canvas CSS pixel
  const x = bbox.originX * scale - offsetX;
  const y = bbox.originY * scale - offsetY;
  const w = bbox.width * scale;
  const h = bbox.height * scale;

  return { x, y, w, h };
}

// -------------- Drawing --------------
function drawDetections(detections) {
  const view = video.getBoundingClientRect();
  ctx.clearRect(0, 0, view.width, view.height);

  // Enhanced drawing style with rounded borders and shadow
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#00FFAA";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textBaseline = "top";

  // Clean up old entries from smoothBoxes (remove objects that are no longer detected)
  const currentKeys = new Set();
  
  // Store detection data for capture functionality
  const detectionData = [];
  
  for (const det of detections) {
    const cat = det.categories?.[0];
    if (!cat) continue;

    const key = cat.categoryName; // Use category name as key for tracking
    currentKeys.add(key);

    const rawRect = mapRectFromVideoToCanvas(det.boundingBox);

    // Clamp if partially off-screen
    const clampedRect = {
      x: Math.max(0, Math.min(view.width, rawRect.x)),
      y: Math.max(0, Math.min(view.height, rawRect.y)),
      w: Math.max(0, Math.min(view.width - rawRect.x, rawRect.w)),
      h: Math.max(0, Math.min(view.height - rawRect.y, rawRect.h)),
    };

    // Get previous smoothed box before applying new smoothing
    const prevSmoothedRect = smoothBoxes.get(key);
    
    // Apply EMA smoothing with confidence weighting
    const smoothedRect = smoothBBox(key, clampedRect, cat.score);
    
    // Apply dead-zone filtering to remove micro-jitter (compare smoothed with previous smoothed)
    const finalRect = prevSmoothedRect ? applyDeadZone(prevSmoothedRect, smoothedRect) : smoothedRect;
    
    // Update stored value after dead-zone (overwrite what smoothBBox set)
    smoothBoxes.set(key, finalRect);

    // Store detection data for capture (both viewport and video coordinates)
    detectionData.push({
      categoryName: cat.categoryName,
      score: cat.score,
      // Viewport coordinates (for JSON)
      x: Math.round(finalRect.x),
      y: Math.round(finalRect.y),
      width: Math.round(finalRect.w),
      height: Math.round(finalRect.h),
      // Original video coordinates (for redrawing on capture)
      videoBbox: det.boundingBox
    });

    // Draw rounded rectangle with shadow
    roundRect(ctx, finalRect.x, finalRect.y, finalRect.w, finalRect.h, 6);

    // Create label with coordinates and dimensions
    const label = `${cat.categoryName} ${(cat.score * 100).toFixed(0)}% [${Math.round(finalRect.x)},${Math.round(finalRect.y)} ${Math.round(finalRect.w)}×${Math.round(finalRect.h)}]`;

    // Label background + text near top of box
    const pad = 4;
    const textW = ctx.measureText(label).width;
    const textH = 16;

    // Put label above the box; if it would go above the screen, place inside the box at top
    const labelY = (finalRect.y - (textH + pad * 2) >= 0) ? (finalRect.y - (textH + pad * 2)) : finalRect.y;
    const labelX = Math.max(0, Math.min(view.width - (textW + pad * 2), finalRect.x));

    // Reset shadow for label background
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(labelX, labelY, textW + pad * 2, textH + pad * 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, labelX + pad, labelY + pad);
    
    // Reset for next iteration
    ctx.fillStyle = "#000";
    ctx.shadowBlur = 4;
  }

  // Remove stale entries (objects that disappeared)
  for (const key of smoothBoxes.keys()) {
    if (!currentKeys.has(key)) {
      smoothBoxes.delete(key);
    }
  }
  
  // Update last detection data for capture
  lastDetectionData = detectionData;
}

// -------------- Main loop --------------
async function loop() {
  if (!running) return;
  if (!detector || video.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }

  const nowMs = performance.now();

  // Frame-rate throttling: Run detection at ~12 FPS for better performance and stability
  // Render at 60 FPS (always redraw, but only detect periodically)
  if (video.currentTime !== lastVideoTime && (nowMs - lastInferTime) >= DETECTION_INTERVAL_MS) {
    lastVideoTime = video.currentTime;
    lastInferTime = nowMs;
    
    const result = await detector.detectForVideo(video, nowMs);
    drawDetections(result.detections || []);
  } else {
    // Still redraw even if not detecting (for smooth rendering at 60 FPS)
    // This ensures the smoothed boxes continue to animate smoothly
    // Note: We could store last detections and redraw them, but for simplicity,
    // we only draw when we have fresh detections. The smoothing will handle
    // the visual continuity between detection frames.
  }

  requestAnimationFrame(loop);
}

// -------------- Initialize on page load --------------
async function initialize() {
  try {
    statusEl.textContent = "Initializing…";
    
   
    
    // Start camera
    await startCamera();
    
    // Start detection loop
    running = true;
    statusEl.textContent = "Running";
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Error: " + (e?.message || e);
  }
}

// Start camera and detection immediately on page load
initialize();

// -------------- Capture functionality --------------
/**
 * Helper function to download a blob as a file
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Captures the current screen (video + overlay) as JPG and saves detection data as JSON
 * Saves two versions: one with bounding boxes and one without
 */
function captureScreenAndData() {
  if (!video || video.readyState < 2) {
    statusEl.textContent = "Camera not ready";
    return;
  }

  // Use actual video dimensions to preserve aspect ratio
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  
  if (!videoW || !videoH) {
    statusEl.textContent = "Video dimensions not available";
    return;
  }

  const view = video.getBoundingClientRect();
  const viewW = view.width;
  const viewH = view.height;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  
  // Calculate the scale and offsets for object-fit: cover mapping
  const scale = Math.max(viewW / videoW, viewH / videoH);
  const scaledW = videoW * scale;
  const scaledH = videoH * scale;
  const offsetX = (scaledW - viewW) / 2;
  const offsetY = (scaledH - viewH) / 2;
  
  // Create canvas for raw image (without bounding boxes) - use actual video dimensions
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = videoW;
  rawCanvas.height = videoH;
  const rawCtx = rawCanvas.getContext("2d");
  
  // Draw video at its native resolution
  rawCtx.drawImage(video, 0, 0, videoW, videoH);
  
  // Create canvas for image with detection boxes - use actual video dimensions
  const detectionCanvas = document.createElement("canvas");
  detectionCanvas.width = videoW;
  detectionCanvas.height = videoH;
  const detectionCtx = detectionCanvas.getContext("2d");
  
  // Draw video at its native resolution
  detectionCtx.drawImage(video, 0, 0, videoW, videoH);
  
  // Redraw detection boxes and labels directly on the detection canvas at video resolution
  // Use the same drawing style as the overlay
  detectionCtx.lineWidth = 2 * (videoW / viewW); // Scale line width
  detectionCtx.strokeStyle = "#00FFAA";
  detectionCtx.shadowColor = "rgba(0,0,0,0.4)";
  detectionCtx.shadowBlur = 4 * (videoW / viewW);
  detectionCtx.font = `${14 * (videoW / viewW)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  detectionCtx.textBaseline = "top";
  
  // Redraw each detection using original video coordinates
  for (const det of lastDetectionData) {
    if (!det.videoBbox) continue;
    
    const bbox = det.videoBbox;
    const x = bbox.originX;
    const y = bbox.originY;
    const w = bbox.width;
    const h = bbox.height;
    
    // Draw rounded rectangle
    const radius = 6 * (videoW / viewW);
    detectionCtx.beginPath();
    detectionCtx.moveTo(x + radius, y);
    detectionCtx.lineTo(x + w - radius, y);
    detectionCtx.quadraticCurveTo(x + w, y, x + w, y + radius);
    detectionCtx.lineTo(x + w, y + h - radius);
    detectionCtx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    detectionCtx.lineTo(x + radius, y + h);
    detectionCtx.quadraticCurveTo(x, y + h, x, y + h - radius);
    detectionCtx.lineTo(x, y + radius);
    detectionCtx.quadraticCurveTo(x, y, x + radius, y);
    detectionCtx.closePath();
    detectionCtx.stroke();
    
    // Draw label
    const label = `${det.categoryName} ${(det.score * 100).toFixed(0)}% [${x},${y} ${w}×${h}]`;
    const pad = 4 * (videoW / viewW);
    const textW = detectionCtx.measureText(label).width;
    const textH = 16 * (videoW / viewW);
    const labelY = (y - (textH + pad * 2) >= 0) ? (y - (textH + pad * 2)) : y;
    const labelX = Math.max(0, Math.min(videoW - (textW + pad * 2), x));
    
    detectionCtx.shadowBlur = 0;
    detectionCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
    detectionCtx.fillRect(labelX, labelY, textW + pad * 2, textH + pad * 2);
    detectionCtx.fillStyle = "#fff";
    detectionCtx.fillText(label, labelX + pad, labelY + pad);
    detectionCtx.fillStyle = "#000";
    detectionCtx.shadowBlur = 4 * (videoW / viewW);
  }
  
  // Convert raw canvas to JPG blob (without boxes)
  rawCanvas.toBlob(async (rawBlob) => {
    if (!rawBlob) {
      statusEl.textContent = "Failed to capture raw image";
      return;
    }
    
    // Create JSON data with detection information
    const jsonData = {
      timestamp: new Date().toISOString(),
      detections: lastDetectionData.map(det => ({
        categoryName: det.categoryName,
        score: det.score,
        x: det.x,
        y: det.y,
        width: det.width,
        height: det.height
      }))
    };
    
    // Download raw image (without boxes) - optional, can be removed
    downloadBlob(rawBlob, `raw-${timestamp}.jpg`);
    
    // Download JSON file - optional, can be removed
    const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
    downloadBlob(jsonBlob, `detection-${timestamp}.json`);

    // Send to API
    try {
      statusEl.textContent = "Sending to API...";
      
      const formData = new FormData();
      formData.append('image', rawBlob, `raw-${timestamp}.jpg`);
      formData.append('detections', JSON.stringify(jsonData.detections));
      formData.append('timestamp', jsonData.timestamp);

      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Display the analysis result
      console.log('Analysis result:', result);
      statusEl.textContent = `Analysis: ${result.analysis.substring(0, 50)}...`;
      
      // Optionally show full analysis in an alert or modal
      setTimeout(() => {
        alert(`OpenAI Analysis:\n\n${result.analysis}`);
        if (running) statusEl.textContent = "Running";
      }, 500);
      
    } catch (error) {
      console.error('API Error:', error);
      statusEl.textContent = `API Error: ${error.message}`;
      setTimeout(() => {
        if (running) statusEl.textContent = "Running";
      }, 3000);
    }

  }, "image/jpeg", 0.95);
}

// -------------- UI handlers --------------
startBtn.addEventListener("click", async () => {
  try {
     // Initialize detector
     await initDetector();
    
    startBtn.disabled = true;
    statusEl.textContent = "Detection active";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Error: " + (e?.message || e);
    startBtn.disabled = false;
  }
});

switchBtn.addEventListener("click", async () => {
  facingMode = (facingMode === "environment") ? "user" : "environment";
  await startCamera();
});

captureBtn.addEventListener("click", () => {
  captureScreenAndData();
});

