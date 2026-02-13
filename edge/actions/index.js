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

/**
 * Updates UI with analysis result or error.
 * @param {Object} result - API result with analysis text
 * @param {HTMLElement} statusEl - Status element
 * @param {Function} setRunningStatus - Callback to restore status text
 * @param {number} successDelayMs - Delay before restoring status on success
 * @param {number} errorDelayMs - Delay before restoring status on error
 */
export function handleAnalysisResponse(result, statusEl, setRunningStatus, successDelayMs = 500, errorDelayMs = 3000) {
  const responseEl = document.getElementById('apiResponse');
  const responseContentEl = document.getElementById('apiResponseContent');

  if (result && result.analysis !== undefined) {
    statusEl.textContent = 'Analysis received';
    if (responseEl && responseContentEl) {
      responseContentEl.textContent = result.analysis || 'No analysis available';
      responseContentEl.style.color = '#fff';
      responseEl.style.display = 'block';
    }
    setTimeout(setRunningStatus, successDelayMs);
  }
}

/**
 * Displays API error in the response block.
 * @param {Error} error - Error object
 * @param {HTMLElement} statusEl - Status element
 * @param {Function} setRunningStatus - Callback to restore status text
 * @param {number} delayMs - Delay before restoring status
 */
export function handleAnalysisError(error, statusEl, setRunningStatus, delayMs = 3000) {
  console.error('API Error:', error);
  statusEl.textContent = `API Error: ${error.message}`;

  const responseEl = document.getElementById('apiResponse');
  const responseContentEl = document.getElementById('apiResponseContent');
  if (responseEl && responseContentEl) {
    responseContentEl.textContent = `Error: ${error.message}`;
    responseContentEl.style.color = '#ff6b6b';
    responseEl.style.display = 'block';
  }

  setTimeout(setRunningStatus, delayMs);
}
