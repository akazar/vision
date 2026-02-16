import { startCamera, stopCamera, resizeOverlay, imageRealTimeProcessing, downloadBlob, captureScreenToBlobAndData } from './capture/index.js';
import { smoothBBox, applyDeadZone, drawDetections } from './boxes/index.js';
import { initDetector, isSelectedObjectTypeDetected } from './recognition/index.js';
import { DETECTION_INTERVAL_MS } from './recognition/config.js';
import { requestAnalysis } from './reasoning/index.js';
import { imageDetectedProcessing, apiResponceProcessing, handleAnalysisResponse, handleAnalysisError } from './actions/index.js';
import {
  DEFAULT_OBJECT_TYPE,
  DEFAULT_AUTO_CAPTURE_INTERVAL,
  OBJECT_TYPE_MAP
} from './config.js';
import {
  initStatus,
  setStatus,
  initControls,
  setDetectionStartState,
  setDetectionStopState,
  enableSwitchButton,
  initializeSelectOptions,
  getSelectedObjectType,
  setSelectedObjectType,
  getAutoCaptureInterval,
  getDownloadImagesChecked,
  initPanels,
  setupEventHandlers
} from './ui/index.js';

// DOM elements
const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

// Initialize UI modules
initStatus(document.getElementById("status"));
initControls({
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  switchBtn: document.getElementById("switchBtn"),
  objectFilter: document.getElementById("objectFilter"),
  autoCaptureInterval: document.getElementById("autoCaptureInterval"),
  downloadImagesCheckbox: document.getElementById("downloadImages")
});
initPanels({
  settingsPanel: document.getElementById("settingsPanel"),
  settingsBtn: document.getElementById("settingsBtn"),
  responseEl: document.getElementById("apiResponse"),
  responseContentEl: document.getElementById("apiResponseContent")
});

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
  setStatus("Loading model…");
  detector = await initDetector();
  setStatus("Model ready");
}

// Camera management
async function initializeCamera() {
  if (stream) stopCamera(stream);
  
  setStatus("Requesting camera…");
  stream = await startCamera(video, facingMode);
  
  // Ensure canvas internal resolution matches displayed size
  resizeOverlay(canvas, video, ctx);
  
  setStatus("Camera started");
  enableSwitchButton();
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
    
    // Process current frame for further operations (e.g., saving locally)
    await imageRealTimeProcessing(video);
    
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
  setDetectionStopState();
  setStatus("Detection stopped");
}

// Start detection
async function startDetection() {
  if (!detector) {
    try {
      await initializeDetector();
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e?.message || e));
      return;
    }
  }
  
  running = true;
  setDetectionStartState();
  setStatus("Detection active");
  
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
  const intervalSeconds = getAutoCaptureInterval();
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
  const isObjectDetected = isSelectedObjectTypeDetected(lastDetectionData, selectedObjectType, OBJECT_TYPE_MAP);
  
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
      const shouldDownload = getDownloadImagesChecked();
      runCaptureAndAnalyze(video, lastDetectionData, () => {
        if (running) setStatus("Detection active");
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

// Use shared detection filter function

// Auto-capture functionality (now handled by checkObjectDetectionForAutoCapture)
function startAutoCapture() {
  stopAutoCapture(); // Clear any existing timer
  
  const intervalSeconds = getAutoCaptureInterval();
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

/**
 * Captures screen to blob + JSON, optionally downloads, then sends to API and handles response.
 */
async function runCaptureAndAnalyze(video, lastDetectionData, setRunningStatus, shouldDownload = false) {
  if (!video || video.readyState < 2) {
    setStatus("Camera not ready");
    return;
  }
  try {
    const { rawBlob, jsonData } = await captureScreenToBlobAndData(video, lastDetectionData);
    const timestamp = jsonData.timestamp.replace(/[:.]/g, "-").slice(0, -5);

    if (shouldDownload) {
      downloadBlob(rawBlob, `raw-${timestamp}.jpg`);
      const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
      downloadBlob(jsonBlob, `detection-${timestamp}.json`);
    }

    await imageDetectedProcessing(rawBlob, jsonData);
    setStatus("Sending to API...");

    const result = await requestAnalysis(rawBlob, jsonData);
    await apiResponceProcessing(result);
    handleAnalysisResponse(result, setRunningStatus);
  } catch (error) {
    handleAnalysisError(error, setRunningStatus);
  }
}

// Initialize select options from config
function initializeAppSelectOptions() {
  const { selectedObjectType: initialType, autoCaptureIntervalSeconds: initialInterval } = initializeSelectOptions();
  selectedObjectType = initialType;
  autoCaptureIntervalSeconds = initialInterval;
}

// Initialize on page load
async function initialize() {
  try {
    setStatus("Initializing…");
    
    // Initialize select options from config
    initializeAppSelectOptions();
    
    // Start camera
    await initializeCamera();
    
    // Don't auto-start detection - user must click start button
    setStatus("Ready - Click ▶ to start detection");
  } catch (e) {
    console.error(e);
    setStatus("Error: " + (e?.message || e));
  }
}

// Setup UI event handlers
setupEventHandlers({
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  captureBtn: document.getElementById("captureBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  switchBtn: document.getElementById("switchBtn"),
  objectFilter: document.getElementById("objectFilter"),
  autoCaptureInterval: document.getElementById("autoCaptureInterval"),
  closeResponseBtn: document.getElementById("closeResponse"),
  closeSettingsBtn: document.getElementById("closeSettings"),
  onStart: async () => {
    await startDetection();
  },
  onStop: () => {
    stopDetection();
  },
  onCapture: () => {
    const shouldDownload = getDownloadImagesChecked();
    runCaptureAndAnalyze(video, lastDetectionData, () => {
      if (running) setStatus("Detection active");
    }, shouldDownload);
  },
  onSwitchCamera: async () => {
    facingMode = (facingMode === "environment") ? "user" : "environment";
    await initializeCamera();
  },
  onObjectFilterChange: () => {
    selectedObjectType = getSelectedObjectType();
    // Reset detection tracking when filter changes
    detectionPeriods = [];
    lastObjectDetected = false;
    currentDetectionStart = null;
    lastCaptureTime = 0;
    // Clear current detections to re-filter on next detection cycle
    smoothBoxes.clear();
    const view = video.getBoundingClientRect();
    ctx.clearRect(0, 0, view.width, view.height);
  },
  onAutoCaptureIntervalChange: () => {
    if (running) {
      startAutoCapture(); // Restart with new interval (resets tracking)
    } else {
      // Reset tracking even if not running
      detectionPeriods = [];
      lastObjectDetected = false;
      currentDetectionStart = null;
      lastCaptureTime = 0;
    }
  },
  onResize: () => {
    resizeOverlay(canvas, video, ctx);
  }
});

// Start camera and detection immediately on page load
initialize();

