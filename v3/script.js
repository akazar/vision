// Import client library functions
import { capture, snap, recognize, reasoning } from './client-lib.js';

// DOM elements
const videoBackground = document.getElementById('videoBackground');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = overlayCanvas.getContext('2d');
const controlButton = document.getElementById('controlButton');
const reasoningPanel = document.getElementById('reasoningPanel');
const reasoningText = document.getElementById('reasoningText');
const reasoningLoading = document.getElementById('reasoningLoading');
const closeReasoning = document.getElementById('closeReasoning');
const statusIndicator = document.getElementById('statusIndicator');

// Configuration
let config = {
  classes: ["person", "car", "tree", "building", "dog", "cat", "bird"],
  threshold: 0.5,
  prompt: "Analyze this image and describe what you see. Focus on the detected objects and provide context about the scene.",
  llmProvider: "openai",
  modelType: "gpt-4o"
};

// Application state
let stream = null;
let currentRecognitionResults = [];
let isRecognizing = false;
let recognitionFrameId = null;
let isProcessingReasoning = false;

// Initialize interface
function initInterface() {
  // Set canvas size to match viewport
  function resizeCanvas() {
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  updateStatus('Ready');
}

// Initialize event handlers
function initEventHandlers() {
  controlButton.addEventListener('click', handleAnalyzeClick);
  closeReasoning.addEventListener('click', closeReasoningPanel);
  
  // Close reasoning panel on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reasoningPanel.classList.contains('visible')) {
      closeReasoningPanel();
    }
  });
}

// Update status indicator
function updateStatus(text) {
  statusIndicator.textContent = text;
}

// Draw bounding boxes on overlay canvas
function drawRecognitionResults(recognitionResults) {
  // Clear canvas
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
  if (!recognitionResults || recognitionResults.length === 0) {
    return;
  }
  
  // Get video dimensions
  const videoRect = videoBackground.getBoundingClientRect();
  const videoWidth = videoBackground.videoWidth;
  const videoHeight = videoBackground.videoHeight;
  
  if (videoWidth === 0 || videoHeight === 0) return;
  
  // Calculate scale factors
  const scaleX = videoRect.width / videoWidth;
  const scaleY = videoRect.height / videoHeight;
  
  // Draw each detection
  recognitionResults.forEach(result => {
    const x = result.coordinates.x * scaleX;
    const y = result.coordinates.y * scaleY;
    const width = result.size.width * scaleX;
    const height = result.size.height * scaleY;
    
    // Draw bounding box
    ctx.strokeStyle = '#00FFAA';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.strokeRect(x, y, width, height);
    
    // Draw label background
    const label = `${result.class} ${(result.score * 100).toFixed(0)}%`;
    ctx.font = '16px system-ui';
    ctx.textBaseline = 'top';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;
    const padding = 6;
    
    const labelX = Math.max(0, Math.min(x, overlayCanvas.width - textWidth - padding * 2));
    const labelY = Math.max(0, y - textHeight - padding * 2);
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(labelX, labelY, textWidth + padding * 2, textHeight + padding * 2);
    
    // Draw label text
    ctx.fillStyle = '#00FFAA';
    ctx.fillText(label, labelX + padding, labelY + padding);
    
    // Reset shadow
    ctx.shadowBlur = 4;
  });
}

// Continuous recognition loop
async function recognitionLoop() {
  if (!isRecognizing || !stream || !videoBackground.readyState) {
    return;
  }
  
  try {
    // Capture current frame
    const snapshot = await snap(stream);
    
    // Recognize objects
    const results = await recognize(snapshot.canvas, config.classes, config.threshold);
    
    // Filter by threshold (already done in recognize, but ensure)
    currentRecognitionResults = results.filter(r => r.score >= config.threshold);
    
    // Draw bounding boxes
    drawRecognitionResults(currentRecognitionResults);
    
    updateStatus(`Detected: ${currentRecognitionResults.length} objects`);
  } catch (error) {
    console.error('Recognition error:', error);
    updateStatus('Recognition error');
  }
  
  // Continue loop
  recognitionFrameId = requestAnimationFrame(() => {
    recognitionLoop();
  });
}

// Start recognition
function startRecognition() {
  if (isRecognizing) return;
  isRecognizing = true;
  recognitionLoop();
}

// Stop recognition
function stopRecognition() {
  isRecognizing = false;
  if (recognitionFrameId) {
    cancelAnimationFrame(recognitionFrameId);
    recognitionFrameId = null;
  }
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// Handle analyze button click
async function handleAnalyzeClick() {
  if (isProcessingReasoning) return;
  
  if (!stream || !videoBackground.readyState) {
    alert('Camera not ready');
    return;
  }
  
  isProcessingReasoning = true;
  controlButton.disabled = true;
  controlButton.textContent = 'Processing...';
  
  try {
    // Capture current frame
    updateStatus('Capturing frame...');
    const snapshot = await snap(stream);
    
    // Get current recognition results (or recognize again)
    let recognitionResults = currentRecognitionResults;
    if (recognitionResults.length === 0) {
      updateStatus('Recognizing objects...');
      recognitionResults = await recognize(snapshot.canvas, config.classes, config.threshold);
      recognitionResults = recognitionResults.filter(r => r.score >= config.threshold);
    }
    
    // Show loading
    showReasoningPanel(true);
    reasoningLoading.style.display = 'block';
    reasoningText.textContent = '';
    
    // Send to server for reasoning
    updateStatus('Sending to server...');
    const reasoningResults = await reasoning(
      recognitionResults,
      config.prompt,
      config.llmProvider,
      config.modelType
    );
    
    // Display reasoning results
    reasoningLoading.style.display = 'none';
    reasoningText.textContent = reasoningResults.analysis || 'No analysis available';
    
    updateStatus('Analysis complete');
  } catch (error) {
    console.error('Reasoning error:', error);
    reasoningLoading.style.display = 'none';
    reasoningText.textContent = `Error: ${error.message || 'Failed to get reasoning results'}`;
    updateStatus('Error occurred');
  } finally {
    isProcessingReasoning = false;
    controlButton.disabled = false;
    controlButton.textContent = 'Analyze';
  }
}

// Show/hide reasoning panel
function showReasoningPanel(show) {
  if (show) {
    reasoningPanel.classList.add('visible');
  } else {
    reasoningPanel.classList.remove('visible');
  }
}

// Close reasoning panel
function closeReasoningPanel() {
  showReasoningPanel(false);
}

// Initialize application
async function init() {
  try {
    initInterface();
    initEventHandlers();
    
    updateStatus('Starting camera...');
    
    // Get stream from camera
    stream = await capture();
    
    // Show stream fullscreen
    videoBackground.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      videoBackground.onloadedmetadata = () => {
        videoBackground.play().then(() => {
          resolve();
        });
      };
    });
    
    updateStatus('Camera ready');
    controlButton.disabled = false;
    
    // Start continuous recognition
    startRecognition();
    
  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus(`Error: ${error.message}`);
    alert(`Failed to initialize: ${error.message}`);
  }
}

// Start the application
init();
