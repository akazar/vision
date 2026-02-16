/**
 * Status text management
 */

let statusEl = null;

/**
 * Initialize status element reference
 * @param {HTMLElement} element - Status element
 */
export function initStatus(element) {
  statusEl = element;
}

/**
 * Update status text
 * @param {string} text - Status message
 */
export function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

/**
 * Get current status element
 * @returns {HTMLElement|null}
 */
export function getStatusElement() {
  return statusEl;
}
