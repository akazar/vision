// recognition server api:
// contains the next methods:

const path = require('path');

// Use functionality from server folder (no changes there)
const { analyzeWithLLM } = require('../server/reasoning');
const { apiRequestProcessing, apiResponceProcessing } = require('../server/actions');

/**
 * Get recognition results and send API call to LLM provider using the defined model, image and prompt.
 * Returns the reasoning results from the LLM provider API response.
 *
 * @param {Array} recognitionResults - Recognition results array (detections: { categoryName, score, x, y, width, height })
 * @param {string} prompt - Prompt for reasoning
 * @param {string} llmProvider - LLM provider name (reserved for future use; current server uses OpenAI)
 * @param {string} modelType - Model type/name (reserved for future use; current server uses config model)
 * @param {Object} options - Required for server-side call: { imageBuffer, imageMimeType, timestamp?, apiKey? }
 * @returns {Promise<{ analysis: string, model: string, usage: Object, success: boolean, timestamp: string, detections: Array }>}
 */
async function reasoning(recognitionResults, prompt, llmProvider, modelType, options = {}) {
  const { imageBuffer, imageMimeType, timestamp = new Date().toISOString(), apiKey } = options;

  if (!imageBuffer || !imageMimeType) {
    throw new Error('reasoning() requires options.imageBuffer and options.imageMimeType (e.g. from request: req.file.buffer, req.file.mimetype)');
  }

  const apiKeyToUse = apiKey || process.env.OPENAI_API_KEY;
  if (!apiKeyToUse) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY or pass options.apiKey');
  }

  const customPrompt = prompt || null;

  const { analysis, model, usage, raw: openaiData } = await analyzeWithLLM(
    imageBuffer,
    imageMimeType,
    recognitionResults,
    timestamp,
    apiKeyToUse,
    customPrompt
  );

  await apiResponceProcessing(openaiData, analysis, recognitionResults, timestamp);

  return {
    success: true,
    timestamp,
    detections: recognitionResults,
    analysis,
    model,
    usage,
  };
}

/**
 * Run the functions from the array using recognition results and reasoning results as parameters.
 *
 * @param {Array} recognitionResults - Recognition results array from API/recognize
 * @param {Object} reasoningResults - Reasoning results from LLM provider response (e.g. { analysis, model, usage })
 * @param {Array<Function>} actionFunctionArray - Array of functions (recognitionResults, reasoningResults) => any
 * @returns {Promise<Array>} Results from each action function
 */
async function action(recognitionResults, reasoningResults, actionFunctionArray = []) {
  if (!Array.isArray(actionFunctionArray) || actionFunctionArray.length === 0) {
    return [];
  }

  const results = [];
  for (const fn of actionFunctionArray) {
    if (typeof fn !== 'function') continue;
    try {
      const value = await Promise.resolve(fn(recognitionResults, reasoningResults));
      results.push(value);
    } catch (err) {
      console.error('action function error:', err);
      results.push({ error: err.message });
    }
  }
  return results;
}

module.exports = {
  reasoning,
  action,
};
