/**
 * Panel management (settings panel, API response panel)
 */

let settingsPanel = null;
let settingsBtn = null;
let responseEl = null;
let responseContentEl = null;

/**
 * Initialize panel element references
 * @param {Object} elements - Object with panel element references
 */
export function initPanels(elements) {
  settingsPanel = elements.settingsPanel;
  settingsBtn = elements.settingsBtn;
  responseEl = elements.responseEl;
  responseContentEl = elements.responseContentEl;
}

/**
 * Toggle settings panel visibility
 */
export function toggleSettingsPanel() {
  if (!settingsPanel || !settingsBtn) return;

  const isVisible = settingsPanel.style.display !== "none";
  settingsPanel.style.display = isVisible ? "none" : "block";
  settingsBtn.textContent = isVisible ? "⚙" : "✕";
  settingsBtn.setAttribute("aria-label", isVisible ? "Open settings" : "Close settings");
}

/**
 * Close settings panel
 */
export function closeSettingsPanel() {
  if (!settingsPanel || !settingsBtn) return;

  settingsPanel.style.display = "none";
  settingsBtn.textContent = "⚙";
  settingsBtn.setAttribute("aria-label", "Open settings");
}

/**
 * Show API response panel with content
 * @param {string} content - Response content to display
 * @param {string} color - Text color (default: '#fff')
 */
export function showResponsePanel(content, color = '#fff') {
  if (!responseEl || !responseContentEl) return;

  responseContentEl.textContent = content;
  responseContentEl.style.color = color;
  responseEl.style.display = 'block';
}

/**
 * Hide API response panel
 */
export function hideResponsePanel() {
  if (responseEl) {
    responseEl.style.display = "none";
  }
}

/**
 * Get panel element references
 * @returns {Object}
 */
export function getPanels() {
  return {
    settingsPanel,
    settingsBtn,
    responseEl,
    responseContentEl
  };
}
