/**
 * Processes the API request after receiving it from the client
 * Can modify the request data for further processing
 * @param {Object} req - Express request object containing file and body data
 * @returns {Promise<{imageBuffer: Buffer, detections: Array, timestamp: string}>} Processed request data
 */
async function apiRequestProcessing(req) {
  // At this point, the raw request is available for processing
  // You can modify it before it's used for OpenAI API call
  
  // Extract request data
  const imageBuffer = req.file.buffer;
  const detections = JSON.parse(req.body.detections);
  const timestamp = req.body.timestamp || new Date().toISOString();
  
  // Example: You can save locally, transform the image, filter detections, etc.
  // For now, we'll return them as-is, but you can modify them here
  
  // Example modifications you could do:
  // - Save imageBuffer to file system
  // - Filter or modify detections array
  // - Add additional metadata
  // - Transform the image (resize, crop, etc.)
  // - Log request data for debugging
  
  // console.log('API Request - Image size:', imageBuffer.length, 'Detections:', detections.length);

  return {
    imageBuffer: imageBuffer,
    detections: detections,
    timestamp: timestamp
  };
}

/**
 * Processes the LLM response after receiving it from OpenAI
 * Can modify the response data before sending it back to the client
 * @param {Object} openaiData - Raw response data from OpenAI API
 * @param {string} analysis - Extracted analysis text
 * @param {Array} detections - Detection data array
 * @param {string} timestamp - Timestamp string
 * @returns {Promise<Object>} Processed response object to send to client
 */
async function apiResponceProcessing(openaiData, analysis, detections, timestamp) {
  // At this point, the LLM response is available for processing
  // You can modify it before it's sent back to the client
  
  // Example: You can save the response, transform it, add metadata, etc.
  // For now, we'll return it as-is, but you can modify it here
  
  // Example modifications you could do:
  // - Save response to database or file system
  // - Transform or format the analysis text
  // - Add additional metadata or processing
  // - Filter or modify the detections
  // - Log response data for debugging
  
  // console.log('LLM Response - Analysis:', analysis, 'Model:', openaiData.model);
}

module.exports = {
  apiRequestProcessing,
  apiResponceProcessing
};

