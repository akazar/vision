/**
 * UI event handlers setup
 */

import { toggleSettingsPanel, closeSettingsPanel, hideResponsePanel } from './panels.js';

/**
 * Setup all UI event handlers
 * @param {Object} handlers - Object with handler functions
 */
export function setupEventHandlers(handlers) {
  const {
    startBtn,
    stopBtn,
    captureBtn,
    settingsBtn,
    switchBtn,
    objectFilter,
    autoCaptureInterval,
    closeResponseBtn,
    closeSettingsBtn
  } = handlers;

  // Start/Stop detection buttons
  if (startBtn) {
    startBtn.addEventListener("click", handlers.onStart);
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", handlers.onStop);
  }

  // Capture button
  if (captureBtn) {
    captureBtn.addEventListener("click", handlers.onCapture);
  }

  // Settings panel toggle
  if (settingsBtn) {
    settingsBtn.addEventListener("click", toggleSettingsPanel);
  }

  // Switch camera button
  if (switchBtn) {
    switchBtn.addEventListener("click", handlers.onSwitchCamera);
  }

  // Object filter change
  if (objectFilter) {
    objectFilter.addEventListener("change", handlers.onObjectFilterChange);
  }

  // Auto-capture interval change
  if (autoCaptureInterval) {
    autoCaptureInterval.addEventListener("change", handlers.onAutoCaptureIntervalChange);
  }

  // Close response button
  if (closeResponseBtn) {
    closeResponseBtn.addEventListener("click", hideResponsePanel);
  }

  // Close settings button
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", closeSettingsPanel);
  }

  // Window resize
  window.addEventListener("resize", handlers.onResize);
}
