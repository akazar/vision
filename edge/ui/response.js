/**
 * API analysis response UI (status + response panel)
 */

import { setStatus } from './status.js';
import { showResponsePanel } from './panels.js';

/**
 * Updates UI with analysis result.
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
