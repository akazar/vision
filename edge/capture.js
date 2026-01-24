import { API_BASE_URL, DRAWING_STYLES } from './config.js';
import { roundRect } from './drawing.js';

/**
 * Helper function to download a blob as a file
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Filename for download
 */
export function downloadBlob(blob, filename) {
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
 * Sends data to API for OpenAI analysis
 * @param {HTMLVideoElement} video - Video element
 * @param {Array} lastDetectionData - Last detection data array
 * @param {HTMLElement} statusEl - Status element for user feedback
 * @param {Function} setRunningStatus - Function to restore running status
 * @param {boolean} shouldDownload - Whether to download images and JSON files
 */
export function captureScreenAndData(video, lastDetectionData, statusEl, setRunningStatus, shouldDownload = false) {
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
  const scaleFactor = videoW / viewW;
  detectionCtx.lineWidth = DRAWING_STYLES.lineWidth * scaleFactor;
  detectionCtx.strokeStyle = DRAWING_STYLES.strokeStyle;
  detectionCtx.shadowColor = DRAWING_STYLES.shadowColor;
  detectionCtx.shadowBlur = DRAWING_STYLES.shadowBlur * scaleFactor;
  detectionCtx.font = `${parseInt(DRAWING_STYLES.font) * scaleFactor}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
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
    const radius = DRAWING_STYLES.borderRadius * scaleFactor;
    roundRect(detectionCtx, x, y, w, h, radius);
    
    // Draw label
    const label = `${det.categoryName} ${(det.score * 100).toFixed(0)}% [${x},${y} ${w}×${h}]`;
    const pad = DRAWING_STYLES.labelPadding * scaleFactor;
    const textW = detectionCtx.measureText(label).width;
    const textH = DRAWING_STYLES.labelHeight * scaleFactor;
    const labelY = (y - (textH + pad * 2) >= 0) ? (y - (textH + pad * 2)) : y;
    const labelX = Math.max(0, Math.min(videoW - (textW + pad * 2), x));
    
    detectionCtx.shadowBlur = 0;
    detectionCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
    detectionCtx.fillRect(labelX, labelY, textW + pad * 2, textH + pad * 2);
    detectionCtx.fillStyle = "#fff";
    detectionCtx.fillText(label, labelX + pad, labelY + pad);
    detectionCtx.fillStyle = "#000";
    detectionCtx.shadowBlur = DRAWING_STYLES.shadowBlur * scaleFactor;
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
    
    // Download raw image and JSON file only if enabled
    if (shouldDownload) {
      downloadBlob(rawBlob, `raw-${timestamp}.jpg`);
      const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
      downloadBlob(jsonBlob, `detection-${timestamp}.json`);
    }

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
      
      // Display the analysis result in the response block
      console.log('Analysis result:', result);
      statusEl.textContent = `Analysis received`;
      
      // Update the API response display
      const responseEl = document.getElementById('apiResponse');
      const responseContentEl = document.getElementById('apiResponseContent');
      
      if (responseEl && responseContentEl) {
        responseContentEl.textContent = result.analysis || 'No analysis available';
        responseContentEl.style.color = '#fff'; // Reset color in case it was red from previous error
        responseEl.style.display = 'block';
      }
      
      // Restore running status
      setTimeout(() => {
        setRunningStatus();
      }, 500);
      
    } catch (error) {
      console.error('API Error:', error);
      statusEl.textContent = `API Error: ${error.message}`;
      
      // Show error in the response block
      const responseEl = document.getElementById('apiResponse');
      const responseContentEl = document.getElementById('apiResponseContent');
      
      if (responseEl && responseContentEl) {
        responseContentEl.textContent = `Error: ${error.message}`;
        responseContentEl.style.color = '#ff6b6b';
        responseEl.style.display = 'block';
      }
      
      setTimeout(() => {
        setRunningStatus();
      }, 3000);
    }

  }, "image/jpeg", 0.95);
}

