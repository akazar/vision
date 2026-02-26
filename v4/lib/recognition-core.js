// /**
//  * Platform-agnostic recognition core: result format, filtering, and mapping.
//  * Used by both browser (lib/recognition/mediapipe/detect-mediapipe.js) and Node (server/recognition-node.js).
//  * No DOM, MediaPipe, or Node-specific APIs — pure data transformation.
//  *
//  * Canonical raw detection shape (from any detector):
//  *   { categories: [{ categoryName: string, score: number }], boundingBox: { originX, originY, width, height } }
//  * Unified result shape (returned to callers):
//  *   { id, class, confidence, coordinates: { x, y }, size: { width, height }, image? }
//  */

// /**
//  * Filter detections by object type.
//  * @param {Array<{ categories?: Array<{ categoryName: string }> }>} detections - Array of detection objects (canonical shape)
//  * @param {Array<string>} classes - Array of class names to filter (e.g. ['person', 'dog'])
//  * @returns {Array} Filtered detections
//  */
// export function filterDetectionsByClasses(detections, classes) {
//   if (!classes || classes.length === 0) {
//     return detections;
//   }
//   return detections.filter((det) => {
//     const cat = det.categories?.[0];
//     if (!cat) return false;
//     const categoryName = (cat.categoryName || '').toLowerCase();
//     return classes.some((cls) => categoryName.includes(String(cls).toLowerCase()));
//   });
// }

// /**
//  * Default ID generator (works in browser and Node 19+).
//  * @returns {string}
//  */
// function defaultGenerateId() {
//   if (typeof crypto !== 'undefined' && crypto.randomUUID) {
//     return crypto.randomUUID();
//   }
//   return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
// }

// /**
//  * Process raw detections into the unified result format.
//  * @param {Array<{ categories?: Array<{ categoryName: string, score: number }>, boundingBox?: { originX: number, originY: number, width: number, height: number } }>} rawDetections - Detections in canonical shape
//  * @param {Object} options
//  * @param {number} [options.threshold=0.45] - Minimum score
//  * @param {Array<string>} [options.classes=[]] - Class filter (empty = all)
//  * @param {() => string} [options.generateId] - ID generator for the batch
//  * @param {() => (string|null)} [options.getImage] - Optional image (e.g. base64) for results
//  * @returns {Array<{ id: string, class: string, confidence: number, coordinates: { x, y }, size: { width, height }, image?: string }>}
//  */
// export function processDetections(rawDetections, options = {}) {
//   const {
//     threshold = 0.45,
//     classes = [],
//     generateId = defaultGenerateId,
//     getImage = () => null,
//   } = options;

//   const detections = rawDetections || [];
//   let filtered = detections.filter((det) => {
//     const cat = det.categories?.[0];
//     return cat && typeof cat.score === 'number' && cat.score >= threshold;
//   });
//   if (classes && classes.length > 0) {
//     filtered = filterDetectionsByClasses(filtered, classes);
//   }

//   const id = generateId();
//   const image = typeof getImage === 'function' ? getImage() : null;

//   return filtered.map((det) => {
//     const cat = det.categories?.[0];
//     const bbox = det.boundingBox || { originX: 0, originY: 0, width: 0, height: 0 };
//     return {
//       id,
//       class: cat?.categoryName ?? '',
//       confidence: cat?.score ?? 0,
//       coordinates: { x: bbox.originX, y: bbox.originY },
//       size: { width: bbox.width, height: bbox.height },
//       ...(image != null ? { image } : {}),
//     };
//   });
// }
