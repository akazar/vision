import { initDetector } from './detector.js';
import { startCamera, stopCamera, resizeOverlay } from './camera.js';
import { smoothBBox, applyDeadZone } from './smoothing.js';
import { drawDetections } from './drawing.js';
import { captureScreenAndData } from './capture.js';
import { 
  DETECTION_INTERVAL_MS,
  OBJECT_TYPE_OPTIONS,
  DEFAULT_OBJECT_TYPE,
  AUTO_CAPTURE_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CAPTURE_INTERVAL
} from './config.js';

// DOM elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const captureBtn = document.getElementById("captureBtn");
const objectFilter = document.getElementById("objectFilter");
const autoCaptureInterval = document.getElementById("autoCaptureInterval");
const downloadImagesCheckbox = document.getElementById("downloadImages");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

// Application state
let detector = null;
let stream = null;
let running = false;
let facingMode = "environment"; // or "user"
let lastVideoTime = -1;
let lastInferTime = 0;
let lastDetectionData = [];
let selectedObjectType = DEFAULT_OBJECT_TYPE;
let autoCaptureTimer = null;
let autoCaptureIntervalSeconds = DEFAULT_AUTO_CAPTURE_INTERVAL;

// Object detection tracking for auto-capture
// Track detection periods within a sliding window
let detectionPeriods = []; // Array of {start, end} periods when object was detected
let lastObjectDetected = false; // Whether the object was detected in the last frame
let currentDetectionStart = null; // Start time of current detection period
let lastCaptureTime = 0; // When we last triggered capture (to prevent rapid re-triggers)

// Temporal smoothing state
const smoothBoxes = new Map(); // key -> smoothed bbox {x, y, w, h}

// Initialize detector
async function initializeDetector() {
  statusEl.textContent = "Loading model…";
  detector = await initDetector();
  statusEl.textContent = "Model ready";
}

// Camera management
async function initializeCamera() {
  if (stream) stopCamera(stream);
  
  statusEl.textContent = "Requesting camera…";
  stream = await startCamera(video, facingMode);
  
  // Ensure canvas internal resolution matches displayed size
  resizeOverlay(canvas, video, ctx);
  
  statusEl.textContent = "Camera started";
  const switchBtn = document.getElementById("switchBtn");
  if (switchBtn) {
    switchBtn.disabled = false;
  }
}

function stopCameraStream() {
  if (stream) {
    stopCamera(stream);
    stream = null;
    video.srcObject = null;
  }
}

// Animation frame ID for canceling the loop
let animationFrameId = null;

// Main detection loop
async function loop() {
  if (!running) {
    animationFrameId = null;
    return;
  }
  if (!detector || video.readyState < 2) {
    animationFrameId = requestAnimationFrame(loop);
    return;
  }

  const nowMs = performance.now();

  // Frame-rate throttling: Run detection at ~12 FPS for better performance and stability
  if (video.currentTime !== lastVideoTime && (nowMs - lastInferTime) >= DETECTION_INTERVAL_MS) {
    lastVideoTime = video.currentTime;
    lastInferTime = nowMs;
    
    const result = await detector.detectForVideo(video, nowMs);
    lastDetectionData = drawDetections(
      ctx, 
      video, 
      result.detections || [], 
      smoothBoxes, 
      smoothBBox, 
      applyDeadZone,
      selectedObjectType
    );
    
    // Check if selected object type is detected for auto-capture
    checkObjectDetectionForAutoCapture(nowMs);
  }

  animationFrameId = requestAnimationFrame(loop);
}

// Stop detection and clear canvas
function stopDetection() {
  running = false;
  
  // Cancel animation frame if active
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Stop auto-capture timer
  stopAutoCapture();
  
  // Reset detection tracking
  detectionPeriods = [];
  lastObjectDetected = false;
  currentDetectionStart = null;
  lastCaptureTime = 0;
  
  // Clear the canvas
  const view = video.getBoundingClientRect();
  ctx.clearRect(0, 0, view.width, view.height);
  
  // Clear detection data
  lastDetectionData = [];
  smoothBoxes.clear();
  
  // Update UI
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = "Detection stopped";
}

// Start detection
async function startDetection() {
  if (!detector) {
    try {
      await initializeDetector();
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Error: " + (e?.message || e);
      return;
    }
  }
  
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "Detection active";
  
  // Reset timing
  lastVideoTime = -1;
  lastInferTime = 0;
  
  // Start auto-capture if enabled
  startAutoCapture();
  
  // Start the loop
  loop();
}

/**
 * Checks if the selected object type is detected and tracks duration
 * Triggers capture when object is detected for more than 80% of the interval (allowing interruptions)
 */
function checkObjectDetectionForAutoCapture(nowMs) {
  const intervalSeconds = parseInt(autoCaptureInterval.value);
  if (intervalSeconds === 0 || !running) {
    // Manual mode or not running - reset tracking
    detectionPeriods = [];
    lastObjectDetected = false;
    currentDetectionStart = null;
    return;
  }

  const intervalMs = intervalSeconds * 1000;
  const thresholdMs = intervalMs * 0.8; // 80% of interval

  // Check if selected object type is currently detected
  const isObjectDetected = isSelectedObjectTypeDetected(lastDetectionData, selectedObjectType);
  
  if (isObjectDetected) {
    // Object is detected
    if (!lastObjectDetected) {
      // Object just appeared - start a new detection period
      currentDetectionStart = nowMs;
    }
    lastObjectDetected = true;
  } else {
    // Object is not detected
    if (lastObjectDetected) {
      // Object just disappeared - end the current detection period
      if (currentDetectionStart !== null) {
        detectionPeriods.push({
          start: currentDetectionStart,
          end: nowMs
        });
        currentDetectionStart = null;
      }
    }
    lastObjectDetected = false;
  }

  // Clean up old periods outside the sliding window
  const windowStart = nowMs - intervalMs;
  detectionPeriods = detectionPeriods.filter(period => period.end >= windowStart);

  // Calculate total detection time within the window
  let totalDetectionTime = 0;
  
  // Add completed periods
  for (const period of detectionPeriods) {
    const periodStart = Math.max(period.start, windowStart);
    const periodEnd = Math.min(period.end, nowMs);
    if (periodEnd > periodStart) {
      totalDetectionTime += (periodEnd - periodStart);
    }
  }
  
  // Add current detection period if object is currently detected
  if (currentDetectionStart !== null) {
    const currentStart = Math.max(currentDetectionStart, windowStart);
    const currentEnd = nowMs;
    if (currentEnd > currentStart) {
      totalDetectionTime += (currentEnd - currentStart);
    }
  }

  // Check if total detection time exceeds 80% threshold
  if (totalDetectionTime >= thresholdMs) {
    // Prevent rapid re-triggers (wait at least intervalMs between captures)
    if (nowMs - lastCaptureTime >= intervalMs) {
      lastCaptureTime = nowMs;
      const shouldDownload = downloadImagesCheckbox ? downloadImagesCheckbox.checked : false;
      captureScreenAndData(video, lastDetectionData, statusEl, () => {
        if (running) statusEl.textContent = "Detection active";
      }, shouldDownload);
      
      // Reset the window start time to allow continuous tracking
      // Keep current detection if object is still detected, but reset completed periods
      // This allows the system to continue tracking and trigger again
      const newWindowStart = nowMs - intervalMs;
      
      // Keep only periods that are still within the new window
      detectionPeriods = detectionPeriods.filter(period => period.end >= newWindowStart);
      
      // If currently detecting, adjust the start time to be within the new window
      if (currentDetectionStart !== null) {
        // If current detection started before the new window, adjust it
        if (currentDetectionStart < newWindowStart) {
          currentDetectionStart = newWindowStart;
        }
      }
    }
  }
}

/**
 * Checks if the selected object type is present in the detection data
 */
function isSelectedObjectTypeDetected(detections, filterType) {
  if (filterType === "all") {
    return detections.length > 0;
  }
  
  // Object type mapping for filtering
  const OBJECT_TYPE_MAP = {
    person: ["person", "human"],
    pet: ["dog", "cat", "bird"],
    car: ["car", "truck", "bus", "motorcycle"]
  };
  
  const allowedTypes = OBJECT_TYPE_MAP[filterType] || [];
  
  return detections.some(det => {
    const categoryName = (det.categoryName || "").toLowerCase();
    return allowedTypes.some(type => categoryName.includes(type));
  });
}

// Auto-capture functionality (now handled by checkObjectDetectionForAutoCapture)
function startAutoCapture() {
  stopAutoCapture(); // Clear any existing timer
  
  const intervalSeconds = parseInt(autoCaptureInterval.value);
  if (intervalSeconds > 0) {
    autoCaptureIntervalSeconds = intervalSeconds;
    // Reset tracking when starting
    detectionPeriods = [];
    lastObjectDetected = false;
    currentDetectionStart = null;
    lastCaptureTime = 0;
  }
}

function stopAutoCapture() {
  if (autoCaptureTimer) {
    clearInterval(autoCaptureTimer);
    autoCaptureTimer = null;
  }
  autoCaptureIntervalSeconds = 0;
  detectionPeriods = [];
  lastObjectDetected = false;
  currentDetectionStart = null;
  lastCaptureTime = 0;
}

// Initialize select options from config
function initializeSelectOptions() {
  // Populate object filter options
  objectFilter.innerHTML = '';
  OBJECT_TYPE_OPTIONS.forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === DEFAULT_OBJECT_TYPE) {
      optionEl.selected = true;
    }
    objectFilter.appendChild(optionEl);
  });
  
  // Populate auto capture interval options
  autoCaptureInterval.innerHTML = '';
  AUTO_CAPTURE_INTERVAL_OPTIONS.forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === DEFAULT_AUTO_CAPTURE_INTERVAL) {
      optionEl.selected = true;
    }
    autoCaptureInterval.appendChild(optionEl);
  });
  
  // Set initial values
  selectedObjectType = DEFAULT_OBJECT_TYPE;
  autoCaptureIntervalSeconds = DEFAULT_AUTO_CAPTURE_INTERVAL;
}

// Initialize on page load
async function initialize() {
  try {
    statusEl.textContent = "Initializing…";
    
    // Initialize select options from config
    initializeSelectOptions();
    
    // Start camera
    await initializeCamera();
    
    // Don't auto-start detection - user must click start button
    statusEl.textContent = "Ready - Click ▶ to start detection";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Error: " + (e?.message || e);
  }
}

// UI event handlers
startBtn.addEventListener("click", async () => {
  await startDetection();
});

stopBtn.addEventListener("click", () => {
  stopDetection();
});

// Settings panel toggle
settingsBtn.addEventListener("click", () => {
  if (settingsPanel) {
    const isVisible = settingsPanel.style.display !== "none";
    settingsPanel.style.display = isVisible ? "none" : "block";
    settingsBtn.textContent = isVisible ? "⚙" : "✕";
    settingsBtn.setAttribute("aria-label", isVisible ? "Open settings" : "Close settings");
  }
});

// Switch camera button (inside settings panel)
const switchBtn = document.getElementById("switchBtn");
if (switchBtn) {
  switchBtn.addEventListener("click", async () => {
    facingMode = (facingMode === "environment") ? "user" : "environment";
    await initializeCamera();
  });
}

captureBtn.addEventListener("click", () => {
  const shouldDownload = downloadImagesCheckbox ? downloadImagesCheckbox.checked : false;
  captureScreenAndData(video, lastDetectionData, statusEl, () => {
    if (running) statusEl.textContent = "Detection active";
  }, shouldDownload);
});

// Object filter change handler
objectFilter.addEventListener("change", (e) => {
  selectedObjectType = e.target.value;
  // Reset detection tracking when filter changes
  detectionPeriods = [];
  lastObjectDetected = false;
  currentDetectionStart = null;
  lastCaptureTime = 0;
  // Clear current detections to re-filter on next detection cycle
  smoothBoxes.clear();
  const view = video.getBoundingClientRect();
  ctx.clearRect(0, 0, view.width, view.height);
});

// Auto-capture interval change handler
autoCaptureInterval.addEventListener("change", (e) => {
  if (running) {
    startAutoCapture(); // Restart with new interval (resets tracking)
  } else {
    // Reset tracking even if not running
    detectionPeriods = [];
    lastObjectDetected = false;
    currentDetectionStart = null;
    lastCaptureTime = 0;
  }
});

// Handle window resize
window.addEventListener("resize", () => {
  resizeOverlay(canvas, video, ctx);
});

// Close button handler for API response
const closeResponseBtn = document.getElementById("closeResponse");
if (closeResponseBtn) {
  closeResponseBtn.addEventListener("click", () => {
    const responseEl = document.getElementById("apiResponse");
    if (responseEl) {
      responseEl.style.display = "none";
    }
  });
}

// Close button handler for settings panel
const closeSettingsBtn = document.getElementById("closeSettings");
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => {
    if (settingsPanel) {
      settingsPanel.style.display = "none";
      settingsBtn.textContent = "⚙";
      settingsBtn.setAttribute("aria-label", "Open settings");
    }
  });
}

// Start camera and detection immediately on page load
initialize();

