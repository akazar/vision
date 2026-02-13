import { API_BASE_URL } from '../config.js';

/**
 * Sends image and detection data to the backend for cloud LLM analysis.
 * @param {Blob} rawBlob - Image blob (JPG)
 * @param {Object} jsonData - Object with { timestamp, detections }
 * @returns {Promise<Object>} API response (analysis result)
 */
export async function requestAnalysis(rawBlob, jsonData) {
  const timestamp = jsonData.timestamp || new Date().toISOString();
  const timestampFile = timestamp.replace(/[:.]/g, "-").slice(0, -5);

  const formData = new FormData();
  formData.append('image', rawBlob, `raw-${timestampFile}.jpg`);
  formData.append('detections', JSON.stringify(jsonData.detections));
  formData.append('timestamp', timestamp);

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}
