import { DRAWING_STYLES } from './config.js';

// Object type mapping for filtering
const OBJECT_TYPE_MAP = {
  person: ["person", "human"],
  pet: ["dog", "cat", "bird"],
  car: ["car", "truck", "bus", "motorcycle"]
};

/**
 * Filters detections by object type
 * @param {Array} detections - Array of detection objects
 * @param {string} filterType - Filter type ("all", "person", "pet", "car")
 * @returns {Array} Filtered detections
 */
function filterDetectionsByType(detections, filterType) {
  if (filterType === "all") {
    return detections;
  }
  
  const allowedTypes = OBJECT_TYPE_MAP[filterType] || [];
  return detections.filter(det => {
    const cat = det.categories?.[0];
    if (!cat) return false;
    const categoryName = cat.categoryName.toLowerCase();
    return allowedTypes.some(type => categoryName.includes(type));
  });
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
export function roundRect(ctx, x, y, w, h, r = DRAWING_STYLES.borderRadius) {
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

/**
 * Maps bounding box coordinates from video pixel space to canvas CSS pixels
 * @param {Object} bbox - Bounding box {originX, originY, width, height} in VIDEO pixel coords
 * @param {HTMLVideoElement} video - Video element
 * @returns {Object} Mapped bounding box {x, y, w, h}
 */
export function mapRectFromVideoToCanvas(bbox, video) {
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

/**
 * Draws detection boxes and labels on the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLVideoElement} video - Video element
 * @param {Array} detections - Array of detection objects
 * @param {Map} smoothBoxes - Map storing smoothed boxes
 * @param {Function} smoothBBox - Smoothing function
 * @param {Function} applyDeadZone - Dead zone filtering function
 * @param {string} objectFilter - Object type filter ("all", "person", "pet", "car")
 * @returns {Array} Detection data array for capture
 */
export function drawDetections(ctx, video, detections, smoothBoxes, smoothBBox, applyDeadZone, objectFilter = "all") {
  const view = video.getBoundingClientRect();
  ctx.clearRect(0, 0, view.width, view.height);

  // Enhanced drawing style with rounded borders and shadow
  ctx.lineWidth = DRAWING_STYLES.lineWidth;
  ctx.strokeStyle = DRAWING_STYLES.strokeStyle;
  ctx.shadowColor = DRAWING_STYLES.shadowColor;
  ctx.shadowBlur = DRAWING_STYLES.shadowBlur;
  ctx.font = DRAWING_STYLES.font;
  ctx.textBaseline = "top";

  // Clean up old entries from smoothBoxes (remove objects that are no longer detected)
  const currentKeys = new Set();
  
  // Store detection data for capture functionality
  const detectionData = [];
  
  // Filter detections by object type if specified
  const filteredDetections = filterDetectionsByType(detections, objectFilter);
  
  for (const det of filteredDetections) {
    const cat = det.categories?.[0];
    if (!cat) continue;

    const key = cat.categoryName; // Use category name as key for tracking
    currentKeys.add(key);

    const rawRect = mapRectFromVideoToCanvas(det.boundingBox, video);

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
    const smoothedRect = smoothBBox(smoothBoxes, key, clampedRect, cat.score);
    
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
    roundRect(ctx, finalRect.x, finalRect.y, finalRect.w, finalRect.h, DRAWING_STYLES.borderRadius);

    // Create label with coordinates and dimensions
    const label = `${cat.categoryName} ${(cat.score * 100).toFixed(0)}% [${Math.round(finalRect.x)},${Math.round(finalRect.y)} ${Math.round(finalRect.w)}×${Math.round(finalRect.h)}]`;

    // Label background + text near top of box
    const pad = DRAWING_STYLES.labelPadding;
    const textW = ctx.measureText(label).width;
    const textH = DRAWING_STYLES.labelHeight;

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
    ctx.shadowBlur = DRAWING_STYLES.shadowBlur;
  }

  // Remove stale entries (objects that disappeared)
  for (const key of smoothBoxes.keys()) {
    if (!currentKeys.has(key)) {
      smoothBoxes.delete(key);
    }
  }
  
  return detectionData;
}

