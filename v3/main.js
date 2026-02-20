// functional library contains the next methosds

// Import functionality from edge folder
import { startCamera, stopCamera } from '../edge/capture/camera.js';
import { imageRealTimeProcessing } from '../edge/capture/frame.js';
import { initDetector } from '../edge/recognition/detector.js';
import { MODEL_CONFIG } from '../edge/recognition/config.js';

// Global state
let detector = null;
let detectorMode = null; // 'IMAGE' or 'VIDEO'
let videoElement = null;

/**
 * Get the video stream from device camera
 * @returns {Promise<MediaStream>} Camera stream
 */
export async function capture() {
  // Create a temporary video element if not provided
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    document.body.appendChild(videoElement);
  }
  
  const stream = await startCamera(videoElement, 'environment');
  return stream;
}

/**
 * Get screenshot from video stream
 * @param {MediaStream} stream - Video stream from capture()
 * @returns {Promise<{image: Blob, canvas: HTMLCanvasElement}>} Screenshot blob and canvas
 */
export async function snap(stream) {
  if (!stream) {
    throw new Error('Stream is required');
  }
  
  // Ensure video element is set up with the stream
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    document.body.appendChild(videoElement);
  }
  
  if (videoElement.srcObject !== stream) {
    videoElement.srcObject = stream;
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => resolve();
    });
  }
  
  // Wait for video to be ready
  if (videoElement.readyState < 2) {
    await new Promise((resolve) => {
      videoElement.oncanplay = () => resolve();
    });
  }
  
  // Capture frame using imageRealTimeProcessing
  const canvas = await imageRealTimeProcessing(videoElement);
  
  if (!canvas) {
    throw new Error('Failed to capture frame');
  }
  
  // Convert canvas to blob
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/jpeg', 0.95);
  });
  
  return { image: blob, canvas };
}

/**
 * Manually or intervally call snap to get screenshots
 * @param {number|null} interval - Interval in seconds (null for manual mode)
 * @param {MediaStream} stream - Video stream from capture()
 * @returns {Promise<{image: Blob, canvas: HTMLCanvasElement}>|Function} Screenshot or function to call manually
 */
export function scheduler(interval, stream) {
  if (interval === null || interval === undefined) {
    // Manual mode - return a function that can be called to snap
    return async () => {
      return await snap(stream);
    };
  }
  
  // Interval mode - set up interval and return function to stop
  let intervalId = null;
  const snapshots = [];
  
  intervalId = setInterval(async () => {
    try {
      const result = await snap(stream);
      snapshots.push(result);
    } catch (error) {
      console.error('Error capturing snapshot:', error);
    }
  }, interval * 1000);
  
  // Return function to stop scheduler and get all snapshots
  return {
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return snapshots;
    },
    getSnapshots: () => snapshots
  };
}

/**
 * Recognize objects in image
 * @param {Blob|HTMLCanvasElement|HTMLImageElement} image - Image to recognize
 * @param {Array<string>} classes - Array of class names to recognize (e.g., ['person', 'dog'])
 * @param {number} threshold - Threshold value for recognition (0-1)
 * @returns {Promise<Array>} Recognition results array with class, coordinates, size, and image
 */
export async function recognize(image, classes = [], threshold = 0.45) {
  // Initialize detector with IMAGE mode for static image detection
  // Re-initialize if detector doesn't exist or is in wrong mode
  if (!detector || detectorMode !== 'IMAGE') {
    const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
    const wasmFilesPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmFilesPath);
    
    const config = {
      ...MODEL_CONFIG,
      runningMode: "IMAGE",
      scoreThreshold: threshold
    };
    
    detector = await ObjectDetector.createFromOptions(vision, config);
    detectorMode = 'IMAGE';
  }
  
  // Convert image to canvas if needed
  let canvas;
  if (image instanceof HTMLCanvasElement) {
    canvas = image;
  } else if (image instanceof HTMLImageElement) {
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
  } else if (image instanceof Blob) {
    // Convert blob to image element
    const img = new Image();
    const url = URL.createObjectURL(image);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
  } else {
    throw new Error('Invalid image type. Expected Blob, HTMLCanvasElement, or HTMLImageElement');
  }
  
  // Perform detection using detectForImage
  const result = detector.detect(canvas);
  
  // Filter detections by threshold
  let detections = (result.detections || []).filter(det => {
    const cat = det.categories?.[0];
    return cat && cat.score >= threshold;
  });
  
  // Filter by classes if provided
  if (classes && classes.length > 0) {
    detections = detections.filter(det => {
      const cat = det.categories?.[0];
      if (!cat) return false;
      const categoryName = cat.categoryName.toLowerCase();
      return classes.some(cls => categoryName.includes(cls.toLowerCase()));
    });
  }
  
  // Format results
  const recognitionResults = detections.map(det => {
    const cat = det.categories?.[0];
    const bbox = det.boundingBox;
    
    return {
      class: cat.categoryName,
      score: cat.score,
      coordinates: {
        x: bbox.originX,
        y: bbox.originY
      },
      size: {
        width: bbox.width,
        height: bbox.height
      },
      image: canvas // Include the original image
    };
  });
  
  return recognitionResults;
}

/**
 * Run action functions with recognition results
 * @param {Array} recognitionResults - Recognition results array from recognize()
 * @param {Array<Function>} actionFunctions - Array of functions to execute
 * @returns {Promise<Array>} Results from all action functions
 */
export async function action(recognitionResults, actionFunctions = []) {
  if (!Array.isArray(actionFunctions) || actionFunctions.length === 0) {
    return [];
  }
  
  const results = [];
  for (const actionFn of actionFunctions) {
    if (typeof actionFn === 'function') {
      try {
        const result = await actionFn(recognitionResults);
        results.push(result);
      } catch (error) {
        console.error('Error executing action function:', error);
        results.push({ error: error.message });
      }
    }
  }
  
  return results;
}

/**
 * Send recognition results to LLM for reasoning
 * @param {Array} recognitionResults - Recognition results array from recognize()
 * @param {string} prompt - Prompt for LLM reasoning
 * @param {string} llmProvider - LLM provider name
 * @param {string} modelType - Model type/name
 * @returns {Promise<Object>} Results from API response
 */
export async function reasoning(recognitionResults, prompt, llmProvider, modelType) {
  if (!recognitionResults || recognitionResults.length === 0) {
    throw new Error('Recognition results are required');
  }
  
  // Convert recognition results to detection format expected by API
  const detections = recognitionResults.map(result => ({
    categoryName: result.class,
    score: result.score,
    x: result.coordinates.x,
    y: result.coordinates.y,
    width: result.size.width,
    height: result.size.height
  }));
  
  // Get image blob from first result (assuming all results share the same image)
  let imageBlob;
  if (recognitionResults[0].image instanceof HTMLCanvasElement) {
    imageBlob = await new Promise((resolve, reject) => {
      recognitionResults[0].image.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/jpeg', 0.95);
    });
  } else if (recognitionResults[0].image instanceof Blob) {
    imageBlob = recognitionResults[0].image;
  } else {
    throw new Error('Image must be Blob or HTMLCanvasElement');
  }
  
  // Prepare JSON data with detections
  const jsonData = {
    timestamp: new Date().toISOString(),
    detections: detections
  };
  
  // Extend the requestAnalysis pattern to include prompt, provider, and model
  // Since we can't modify edge folder, we'll create a custom request here
  const timestamp = jsonData.timestamp || new Date().toISOString();
  const timestampFile = timestamp.replace(/[:.]/g, "-").slice(0, -5);

  const formData = new FormData();
  formData.append('image', imageBlob, `raw-${timestampFile}.jpg`);
  formData.append('detections', JSON.stringify(jsonData.detections));
  formData.append('timestamp', timestamp);
  formData.append('prompt', prompt || '');
  formData.append('llmProvider', llmProvider || '');
  formData.append('modelType', modelType || '');

  // Use API_BASE_URL from edge config pattern
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const API_BASE_URL = isProduction ? '' : 'http://localhost:3001';

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}
