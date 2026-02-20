const fetch = require('node-fetch');
const { OPENAI_MODEL, MAX_TOKENS, createPrompt } = require('./config.js');

/**
 * Calls the cloud LLM (OpenAI Vision) to analyze an image and detections.
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} imageMimeType - MIME type (e.g. 'image/jpeg')
 * @param {Array} detections - Detection data array
 * @param {string} timestamp - Timestamp string
 * @param {string} apiKey - OpenAI API key
 * @param {string} customPrompt - Optional custom prompt (if provided, detectionSummary will be appended)
 * @returns {Promise<{analysis: string, model: string, usage: Object}>}
 */
async function analyzeWithLLM(imageBuffer, imageMimeType, detections, timestamp, apiKey, customPrompt = null) {
  const imageBase64 = imageBuffer.toString('base64');
  const detectionSummary = detections.map(det =>
    `${det.categoryName} (${(det.score * 100).toFixed(0)}% confidence) at position [${det.x}, ${det.y}] with size ${det.width}×${det.height}`
  ).join('\n');

  const prompt = customPrompt 
    ? `${customPrompt}\n\nDetected objects:\n${detectionSummary}`
    : createPrompt(detectionSummary);
  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageMimeType};base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: MAX_TOKENS
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error('OpenAI API request failed');
    err.details = errorText;
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const analysis = data.choices[0]?.message?.content || 'No analysis available';

  return {
    analysis,
    model: data.model,
    usage: data.usage,
    raw: data
  };
}

module.exports = {
  analyzeWithLLM
};
