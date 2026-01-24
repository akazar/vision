/**
 * Detection filtering utilities
 */

/**
 * Filters detections by object type
 * @param {Array} detections - Array of detection objects
 * @param {string} filterType - Filter type ("all", "person", "pet", "car")
 * @param {Object} objectTypeMap - Object type mapping configuration
 * @returns {Array} Filtered detections
 */
export function filterDetectionsByType(detections, filterType, objectTypeMap) {
  if (filterType === "all") {
    return detections;
  }
  
  const allowedTypes = objectTypeMap[filterType] || [];
  return detections.filter(det => {
    const cat = det.categories?.[0];
    if (!cat) return false;
    const categoryName = cat.categoryName.toLowerCase();
    return allowedTypes.some(type => categoryName.includes(type));
  });
}

/**
 * Checks if the selected object type is present in the detection data
 * @param {Array} detections - Array of detection data objects
 * @param {string} filterType - Filter type ("all", "person", "pet", "car")
 * @param {Object} objectTypeMap - Object type mapping configuration
 * @returns {boolean} True if object type is detected
 */
export function isSelectedObjectTypeDetected(detections, filterType, objectTypeMap) {
  if (filterType === "all") {
    return detections.length > 0;
  }
  
  const allowedTypes = objectTypeMap[filterType] || [];
  
  return detections.some(det => {
    const categoryName = (det.categoryName || "").toLowerCase();
    return allowedTypes.some(type => categoryName.includes(type));
  });
}

