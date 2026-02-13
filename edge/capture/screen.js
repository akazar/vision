import { DRAWING_STYLES } from '../config.js';
import { roundRect } from '../boxes/drawing.js';

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
 * Captures the current video frame as JPG blob and builds detection JSON.
 * Does not perform API calls or UI updates.
 * @param {HTMLVideoElement} video - Video element
 * @param {Array} lastDetectionData - Last detection data array
 * @returns {Promise<{rawBlob: Blob, jsonData: Object}>} Raw image blob and detection JSON
 */
export function captureScreenToBlobAndData(video, lastDetectionData) {
  return new Promise((resolve, reject) => {
    if (!video || video.readyState < 2) {
      reject(new Error("Camera not ready"));
      return;
    }

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const view = video.getBoundingClientRect();
    const viewW = view.width;
    const viewH = view.height;

    if (!videoW || !videoH) {
      reject(new Error("Video dimensions not available"));
      return;
    }

    // Create canvas for raw image (without bounding boxes)
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = videoW;
    rawCanvas.height = videoH;
    const rawCtx = rawCanvas.getContext("2d");
    rawCtx.drawImage(video, 0, 0, videoW, videoH);

    // Create canvas for image with detection boxes
    const detectionCanvas = document.createElement("canvas");
    detectionCanvas.width = videoW;
    detectionCanvas.height = videoH;
    const detectionCtx = detectionCanvas.getContext("2d");
    detectionCtx.drawImage(video, 0, 0, videoW, videoH);

    const scaleFactor = videoW / viewW;
    detectionCtx.lineWidth = DRAWING_STYLES.lineWidth * scaleFactor;
    detectionCtx.strokeStyle = DRAWING_STYLES.strokeStyle;
    detectionCtx.shadowColor = DRAWING_STYLES.shadowColor;
    detectionCtx.shadowBlur = DRAWING_STYLES.shadowBlur * scaleFactor;
    detectionCtx.font = `${parseInt(DRAWING_STYLES.font) * scaleFactor}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    detectionCtx.textBaseline = "top";

    for (const det of lastDetectionData) {
      if (!det.videoBbox) continue;
      const bbox = det.videoBbox;
      const x = bbox.originX;
      const y = bbox.originY;
      const w = bbox.width;
      const h = bbox.height;
      const radius = DRAWING_STYLES.borderRadius * scaleFactor;
      roundRect(detectionCtx, x, y, w, h, radius);
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

    rawCanvas.toBlob((rawBlob) => {
      if (!rawBlob) {
        reject(new Error("Failed to capture raw image"));
        return;
      }
      resolve({ rawBlob, jsonData });
    }, "image/jpeg", 0.95);
  });
}
