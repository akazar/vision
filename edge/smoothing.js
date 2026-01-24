import { BASE_ALPHA, DEAD_ZONE_EPS } from './config.js';

/**
 * Smooths a bounding box using Exponential Moving Average (EMA)
 * @param {Map} smoothBoxes - Map storing previous smoothed boxes
 * @param {string} key - Unique identifier for the object (e.g., categoryName)
 * @param {Object} bbox - Current bounding box {x, y, w, h}
 * @param {number} confidence - Detection confidence (0-1) for dynamic alpha
 * @returns {Object} Smoothed bounding box {x, y, w, h}
 */
export function smoothBBox(smoothBoxes, key, bbox, confidence = 0.5) {
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
export function applyDeadZone(prev, curr, eps = DEAD_ZONE_EPS) {
  return {
    x: Math.abs(curr.x - prev.x) < eps ? prev.x : curr.x,
    y: Math.abs(curr.y - prev.y) < eps ? prev.y : curr.y,
    w: Math.abs(curr.w - prev.w) < eps ? prev.w : curr.w,
    h: Math.abs(curr.h - prev.h) < eps ? prev.h : curr.h,
  };
}

