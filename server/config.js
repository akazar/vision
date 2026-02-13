/**
 * Server configuration for OpenAI API
 */

// OpenAI model configuration
exports.OPENAI_MODEL = 'gpt-4o';
exports.MAX_TOKENS = 500;

/**
 * Creates the prompt for OpenAI Vision API analysis
 * @param {string} detectionSummary - Formatted summary of detected objects
 * @returns {string} Complete prompt for OpenAI
 */
exports.createPrompt = (detectionSummary) => {
  return `Analyze this image and describe what you see. The image contains the following detected objects:

${detectionSummary}

Please provide a detailed description of:
1. What is displayed in the picture
2. The context and scene
3. Any notable details about the detected objects
4. The overall composition and setting

Be specific and descriptive.`;
};

