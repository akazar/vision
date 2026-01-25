/**
 * Processes the current video frame for further operations (e.g., saving locally)
 * @param {HTMLVideoElement} video - Video element containing the current frame
 * @returns {Promise<HTMLCanvasElement>} Canvas element with the current frame drawn
 */
export async function imageRealTimeProcessing(video) {
  if (!video || video.readyState < 2) {
    return null;
  }

  // Use actual video dimensions to preserve aspect ratio
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  
  if (!videoW || !videoH) {
    return null;
  }

  // Create canvas for the current frame
  const canvas = document.createElement("canvas");
  canvas.width = videoW;
  canvas.height = videoH;
  const ctx = canvas.getContext("2d");
  
  // Draw the current video frame to canvas
  ctx.drawImage(video, 0, 0, videoW, videoH);
  
  // Canvas is now ready for further processing (e.g., saving locally)
  // You can access the image data via:
  // - canvas.toBlob() for blob conversion
  // - canvas.toDataURL() for base64 data URL
  // - ctx.getImageData() for pixel data
  // console.log(canvas.toDataURL());
}

/**
 * Processes the image blob and detection JSON data before sending to API
 * Can modify both the image and detection data for further processing
 * @param {Blob} rawBlob - Image blob (JPG format)
 * @param {Object} jsonData - Detection data object with timestamp and detections array
 * @returns {Promise<{blob: Blob, jsonData: Object}>} Modified blob and jsonData
 */
export async function imageDetectedProcessing(rawBlob, jsonData) {
  // At this point, both rawBlob and jsonData are available for processing
  // You can modify them before they are sent to the API
  
  // Example: You can save locally, transform the image, filter detections, etc.
  // For now, we'll return them as-is, but you can modify them here
  
  // Example modifications you could do:
  // - Save blob to IndexedDB or local storage
  // - Filter or modify jsonData.detections
  // - Add additional metadata to jsonData
  // - Transform the image (resize, crop, etc.)

  // console.log(rawBlob, jsonData);
}

/**
 * Processes the API response after receiving it from the API
 * Can modify the response data for further processing
 * @param {Object} result - Parsed JSON response from the API
 * @returns {Promise<Object>} Modified response object
 */
export async function apiResponceProcessing(result) {
  // At this point, the API response is available for processing
  // You can modify it before it's displayed or used
  
  // Example: You can save the response, transform it, add metadata, etc.
  // For now, we'll return it as-is, but you can modify it here
  
  // Example modifications you could do:
  // - Save response to IndexedDB or local storage
  // - Transform or format the response data
  // - Add additional metadata or processing
  // - Filter or modify the analysis content
  
  // console.log('API Response:', result);
}

