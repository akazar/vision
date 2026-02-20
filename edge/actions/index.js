/**
 * Actions: processing and handling third-party API responses.
 */

/**
 * Processes the image blob and detection JSON data before sending to API.
 * @param {Blob} rawBlob - Image blob (JPG format)
 * @param {Object} jsonData - Detection data object with timestamp and detections array
 * @returns {Promise<void>}
 */
export async function imageDetectedProcessing(rawBlob, jsonData) {
  // Hook for pre-send processing (save locally, transform, filter, etc.)
}

/**
 * Processes the API response after receiving it.
 * @param {Object} result - Parsed JSON response from the API
 * @returns {Promise<void>}
 */
export async function apiResponceProcessing(result) {
  // Hook for post-response processing (save, transform, etc.)
}
