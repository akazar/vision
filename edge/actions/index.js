/**
 * Actions: processing and handling third-party API responses.
 */

import { setStatus } from '../ui/status.js';
import { showResponsePanel } from '../ui/panels.js';

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
 * @param {Function} setRunningStatus - Callback to restore status text
 * @param {number} successDelayMs - Delay before restoring status on success
 */
export function handleAnalysisResponse(result, setRunningStatus, successDelayMs = 500) {
  if (result && result.analysis !== undefined) {
    setStatus('Analysis received');
    showResponsePanel(result.analysis || 'No analysis available', '#fff');
    setTimeout(setRunningStatus, successDelayMs);
  }
}

/**
 * Displays API error in the response block.
 * @param {Error} error - Error object
 * @param {Function} setRunningStatus - Callback to restore status text
 * @param {number} delayMs - Delay before restoring status
 */
export function handleAnalysisError(error, setRunningStatus, delayMs = 3000) {
  console.error('API Error:', error);
  setStatus(`API Error: ${error.message}`);
  showResponsePanel(`Error: ${error.message}`, '#ff6b6b');
  setTimeout(setRunningStatus, delayMs);
}
