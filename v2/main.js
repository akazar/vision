/**
 * Edge Pipeline - Main workflow implementation with UI
 * 
 * Workflow:
 * 1. Capture: Device camera captures photo/video frame
 * 2. Edge Detection: Local model identifies objects with confidence scores
 * 3. Threshold Check: If confidence passes threshold, proceed
 * 4. Local Action (Optional): Immediate robot/API call for time-sensitive tasks
 * 5. Reasoning (Optional): Send image + detection data to cloud for LLM analysis
 * 6. Final Action: Based on reasoning, send notifications, log data, or trigger services
 */

// Capture
import { startCamera, stopCamera, resizeOverlay } from '../edge/capture/camera.js';
import { imageRealTimeProcessing } from '../edge/capture/frame.js';
import { downloadBlob, captureScreenToBlobAndData } from '../edge/capture/screen.js';

// Boxes
import { smoothBBox, applyDeadZone, drawDetections } from '../edge/boxes/index.js';

// Recognition
import { initDetector, isSelectedObjectTypeDetected } from '../edge/recognition/index.js';
import { DETECTION_INTERVAL_MS } from '../edge/recognition/config.js';

// Reasoning
import { requestAnalysis } from '../edge/reasoning/index.js';

// Actions
import { imageDetectedProcessing, apiResponceProcessing } from '../edge/actions/index.js';

// Config
import {
  DEFAULT_OBJECT_TYPE,
  DEFAULT_AUTO_CAPTURE_INTERVAL,
  OBJECT_TYPE_MAP
} from '../edge/config.js';

// UI
import {
  initStatus,
  setStatus,
  initControls,
  setDetectionStartState,
  setDetectionStopState,
  enableSwitchButton,
  initializeSelectOptions,
  getSelectedObjectType,
  getAutoCaptureInterval,
  getDownloadImagesChecked,
  initPanels,
  setupEventHandlers,
  handleAnalysisResponse,
  handleAnalysisError
} from '../edge/ui/index.js';

// Configuration
const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_CLASSES = []; // Empty array means detect all classes
const API_BASE_URL = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' 
  ? '' 
  : 'http://localhost:3001';

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
let detectionPeriods = []; // Array of {start, end} periods when object was detected
let lastObjectDetected = false; // Whether the object was detected in the last frame
let currentDetectionStart = null; // Start time of current detection period
let lastCaptureTime = 0; // When we last triggered capture (to prevent rapid re-triggers)

// Temporal smoothing state
const smoothBoxes = new Map(); // key -> smoothed bbox {x, y, w, h}

// Animation frame ID for canceling the loop
let animationFrameId = null;

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

/**
 * Capture: Get the video stream from device camera
 * @param {HTMLVideoElement} videoElement - Video element to display camera feed (optional, uses DOM video if not provided)
 * @param {string} facingModeParam - Camera facing mode ("environment" or "user")
 * @returns {Promise<MediaStream>} Camera stream
 */
export async function capture(videoElement = null, facingModeParam = null) {
  if (videoElement) {
    // Use provided video element
    if (stream) stopCamera(stream);
    
    const constraints = {
      audio: false,
      video: {
        facingMode: facingModeParam || "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;

    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => resolve();
    });

    return stream;
  } else {
    // Use DOM video element
    await initializeCamera();
    return stream;
  }
}

/**
 * Snap: Get screenshot from video stream
 * @param {MediaStream} streamParam - Video stream from capture() (optional, uses stored stream)
 * @param {HTMLVideoElement} videoElementParam - Video element (optional, uses DOM video)
 * @returns {Promise<{blob: Blob, canvas: HTMLCanvasElement}>} Screenshot blob and canvas
 */
export async function snap(streamParam = null, videoElementParam = null) {
  const videoEl = videoElementParam || video;
  const streamToUse = streamParam || stream;
  
  if (!videoEl || !streamToUse || videoEl.readyState < 2) {
    throw new Error("Camera not ready");
  }

  const canvasEl = await imageRealTimeProcessing(videoEl);
  if (!canvasEl) {
    throw new Error("Failed to capture frame");
  }

  return new Promise((resolve, reject) => {
    canvasEl.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create blob"));
        return;
      }
      resolve({ blob, canvas: canvasEl });
    }, "image/jpeg", 0.95);
  });
}

/**
 * Scheduler: Manually or interval-based snapshot capture
 * @param {number|null} interval - Interval in seconds (null for manual mode)
 * @param {MediaStream} stream - Video stream from capture()
 * @param {Function} callback - Callback function to receive snapshots
 * @returns {Function} Stop function to cancel the scheduler
 */
export function scheduler(interval, stream, callback) {
  let timerId = null;

  const captureSnapshot = async () => {
    try {
      const { blob, canvas } = await snap(stream);
      if (callback) {
        await callback({ blob, canvas });
      }
    } catch (error) {
      console.error("Error capturing snapshot:", error);
    }
  };

  if (interval === null || interval === 0) {
    // Manual mode - return function to trigger capture
    return {
      trigger: captureSnapshot,
      stop: () => {}
    };
  } else {
    // Interval mode
    const intervalMs = interval * 1000;
    timerId = setInterval(captureSnapshot, intervalMs);
    
    // Also capture immediately
    captureSnapshot();

    return {
      trigger: captureSnapshot,
      stop: () => {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
      }
    };
  }
}

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
 * Triggers capture when object is detected for more than 80% of the interval
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
    if (!lastObjectDetected) {
      currentDetectionStart = nowMs;
    }
    lastObjectDetected = true;
  } else {
    if (lastObjectDetected) {
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
  
  for (const period of detectionPeriods) {
    const periodStart = Math.max(period.start, windowStart);
    const periodEnd = Math.min(period.end, nowMs);
    if (periodEnd > periodStart) {
      totalDetectionTime += (periodEnd - periodStart);
    }
  }
  
  if (currentDetectionStart !== null) {
    const currentStart = Math.max(currentDetectionStart, windowStart);
    const currentEnd = nowMs;
    if (currentEnd > currentStart) {
      totalDetectionTime += (currentEnd - currentStart);
    }
  }

  // Check if total detection time exceeds 80% threshold
  if (totalDetectionTime >= thresholdMs) {
    if (nowMs - lastCaptureTime >= intervalMs) {
      lastCaptureTime = nowMs;
      const shouldDownload = getDownloadImagesChecked();
      runCaptureAndAnalyze(video, lastDetectionData, () => {
        if (running) setStatus("Detection active");
      }, shouldDownload);
      
      const newWindowStart = nowMs - intervalMs;
      detectionPeriods = detectionPeriods.filter(period => period.end >= newWindowStart);
      
      if (currentDetectionStart !== null) {
        if (currentDetectionStart < newWindowStart) {
          currentDetectionStart = newWindowStart;
        }
      }
    }
  }
}

// Auto-capture functionality
function startAutoCapture() {
  stopAutoCapture();
  
  const intervalSeconds = getAutoCaptureInterval();
  if (intervalSeconds > 0) {
    autoCaptureIntervalSeconds = intervalSeconds;
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
async function runCaptureAndAnalyze(videoEl, lastDetectionDataParam, setRunningStatus, shouldDownload = false) {
  if (!videoEl || videoEl.readyState < 2) {
    setStatus("Camera not ready");
    return;
  }
  try {
    const { rawBlob, jsonData } = await captureScreenToBlobAndData(videoEl, lastDetectionDataParam);
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

/**
 * Recognize: Detect objects in image with threshold check
 * @param {HTMLVideoElement|HTMLCanvasElement|Blob} image - Video element (preferred), canvas, or blob
 * @param {Array<string>} classes - Array of class names to detect (empty = all)
 * @param {number} threshold - Confidence threshold (0-1)
 * @returns {Promise<Array>} Recognition results array with class, coordinates, size, confidence, and image
 */
export async function recognize(image, classes = DEFAULT_CLASSES, threshold = DEFAULT_THRESHOLD) {
  if (!detector) {
    await initializeDetector();
  }

  let videoElementForDetection = null;

  // Handle different input types
  if (image instanceof HTMLVideoElement) {
    videoElementForDetection = image;
  } else if (image instanceof Blob || image instanceof HTMLCanvasElement) {
    // Use DOM video element for detection
    videoElementForDetection = video;
  } else {
    throw new Error("Image must be a video element, canvas, or blob");
  }

  if (!videoElementForDetection || !(videoElementForDetection instanceof HTMLVideoElement)) {
    throw new Error("Video element required for detection. Call capture() first to initialize the camera, or pass a video element directly.");
  }

  // Run detection using detectForVideo (VIDEO mode)
  const nowMs = performance.now();
  const result = await detector.detectForVideo(videoElementForDetection, nowMs);
  const detections = result.detections || [];
  
  // Filter by threshold and classes
  const filteredDetections = detections.filter(det => {
    const cat = det.categories?.[0];
    if (!cat || cat.score < threshold) {
      return false;
    }
    
    if (classes.length > 0) {
      const categoryName = cat.categoryName.toLowerCase();
      return classes.some(cls => categoryName.includes(cls.toLowerCase()));
    }
    
    return true;
  });

  // Format results
  const results = filteredDetections.map(det => {
    const cat = det.categories?.[0];
    const bbox = det.boundingBox;
    
    return {
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
      image: videoElementForDetection
    };
  });

  return results;
}

/**
 * Action: Execute local actions immediately (for time-sensitive tasks)
 * @param {Array} recognitionResults - Recognition results array from recognize()
 * @param {Array<Function>} actionFunctions - Array of action functions to execute
 * @returns {Promise<void>}
 */
export async function action(recognitionResults, actionFunctions = []) {
  if (!Array.isArray(actionFunctions) || actionFunctions.length === 0) {
    return;
  }

  for (const actionFn of actionFunctions) {
    if (typeof actionFn === 'function') {
      try {
        await actionFn(recognitionResults);
      } catch (error) {
        console.error("Error executing local action:", error);
      }
    }
  }
}

/**
 * Reasoning: Send image and detection data to cloud LLM for analysis
 * @param {Array} recognitionResults - Recognition results array from recognize()
 * @param {string} prompt - Prompt for LLM analysis
 * @param {string} llmProvider - LLM provider name (e.g., "openai")
 * @param {string} modelType - Model type/name (e.g., "gpt-4o")
 * @returns {Promise<Object>} Reasoning results from LLM
 */
export async function reasoning(recognitionResults, prompt, llmProvider = "openai", modelType = "gpt-4o") {
  if (!recognitionResults || recognitionResults.length === 0) {
    throw new Error("No recognition results to analyze");
  }

  // Extract image from first result
  const image = recognitionResults[0]?.image;
  if (!image) {
    throw new Error("No image found in recognition results");
  }

  // Convert canvas to blob if needed
  let imageBlob;
  if (image instanceof HTMLCanvasElement) {
    imageBlob = await new Promise((resolve, reject) => {
      image.toBlob((blob) => {
        if (!blob) reject(new Error("Failed to convert canvas to blob"));
        else resolve(blob);
      }, "image/jpeg", 0.95);
    });
  } else if (image instanceof Blob) {
    imageBlob = image;
  } else {
    throw new Error("Image must be a canvas or blob");
  }

  // Format detection data
  const detections = recognitionResults.map(result => ({
    categoryName: result.class,
    score: result.confidence,
    x: result.coordinates.x,
    y: result.coordinates.y,
    width: result.size.width,
    height: result.size.height
  }));

  const jsonData = {
    timestamp: new Date().toISOString(),
    detections,
    prompt,
    llmProvider,
    modelType
  };

  // Process before sending (optional hook)
  await imageDetectedProcessing(imageBlob, jsonData);

  // Send to server for reasoning
  const formData = new FormData();
  formData.append('image', imageBlob, `reasoning-${Date.now()}.jpg`);
  formData.append('detections', JSON.stringify(jsonData.detections));
  formData.append('timestamp', jsonData.timestamp);
  formData.append('prompt', prompt);
  formData.append('llmProvider', llmProvider);
  formData.append('modelType', modelType);

  const response = await fetch(`${API_BASE_URL}/api/reasoning`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  
  // Process response (optional hook)
  await apiResponceProcessing(result);

  return result;
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
      startAutoCapture();
    } else {
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
