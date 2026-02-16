/**
 * Control elements (buttons, selects) state management
 */

import {
  OBJECT_TYPE_OPTIONS,
  DEFAULT_OBJECT_TYPE,
  AUTO_CAPTURE_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CAPTURE_INTERVAL
} from '../config.js';

let startBtn = null;
let stopBtn = null;
let switchBtn = null;
let objectFilter = null;
let autoCaptureInterval = null;
let downloadImagesCheckbox = null;

/**
 * Initialize control element references
 * @param {Object} elements - Object with control element references
 */
export function initControls(elements) {
  startBtn = elements.startBtn;
  stopBtn = elements.stopBtn;
  switchBtn = elements.switchBtn;
  objectFilter = elements.objectFilter;
  autoCaptureInterval = elements.autoCaptureInterval;
  downloadImagesCheckbox = elements.downloadImagesCheckbox;
}

/**
 * Set button states for detection start
 */
export function setDetectionStartState() {
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (switchBtn) switchBtn.disabled = true;
}

/**
 * Set button states for detection stop
 */
export function setDetectionStopState() {
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (switchBtn) switchBtn.disabled = false;
}

/**
 * Enable switch button (camera ready)
 */
export function enableSwitchButton() {
  if (switchBtn) switchBtn.disabled = false;
}

/**
 * Disable switch button
 */
export function disableSwitchButton() {
  if (switchBtn) switchBtn.disabled = true;
}

/**
 * Initialize select dropdowns with options from config
 * @returns {Object} Initial values {selectedObjectType, autoCaptureIntervalSeconds}
 */
export function initializeSelectOptions() {
  if (!objectFilter || !autoCaptureInterval) {
    return { selectedObjectType: DEFAULT_OBJECT_TYPE, autoCaptureIntervalSeconds: DEFAULT_AUTO_CAPTURE_INTERVAL };
  }

  // Populate object filter options
  objectFilter.innerHTML = '';
  OBJECT_TYPE_OPTIONS.forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === DEFAULT_OBJECT_TYPE) {
      optionEl.selected = true;
    }
    objectFilter.appendChild(optionEl);
  });

  // Populate auto capture interval options
  autoCaptureInterval.innerHTML = '';
  AUTO_CAPTURE_INTERVAL_OPTIONS.forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === DEFAULT_AUTO_CAPTURE_INTERVAL) {
      optionEl.selected = true;
    }
    autoCaptureInterval.appendChild(optionEl);
  });

  return {
    selectedObjectType: DEFAULT_OBJECT_TYPE,
    autoCaptureIntervalSeconds: DEFAULT_AUTO_CAPTURE_INTERVAL
  };
}

/**
 * Get selected object type
 * @returns {string}
 */
export function getSelectedObjectType() {
  return objectFilter ? objectFilter.value : DEFAULT_OBJECT_TYPE;
}

/**
 * Set selected object type
 * @param {string} value
 */
export function setSelectedObjectType(value) {
  if (objectFilter) objectFilter.value = value;
}

/**
 * Get auto capture interval value
 * @returns {number}
 */
export function getAutoCaptureInterval() {
  return autoCaptureInterval ? parseInt(autoCaptureInterval.value) : DEFAULT_AUTO_CAPTURE_INTERVAL;
}

/**
 * Get download images checkbox state
 * @returns {boolean}
 */
export function getDownloadImagesChecked() {
  return downloadImagesCheckbox ? downloadImagesCheckbox.checked : false;
}

/**
 * Get control element references
 * @returns {Object}
 */
export function getControls() {
  return {
    startBtn,
    stopBtn,
    switchBtn,
    objectFilter,
    autoCaptureInterval,
    downloadImagesCheckbox
  };
}
