/**
 * Server Pipeline - Reasoning and Final Actions
 * 
 * Handles:
 * - Reasoning: Receives image + detection data, calls LLM provider
 * - Final Actions: Processes reasoning results and triggers notifications/logging/services
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { analyzeWithLLM } = require('../server/reasoning');
const { apiRequestProcessing, apiResponceProcessing } = require('../server/actions');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    });
    console.log('✓ .env file loaded');
  } catch (err) {
    console.warn('⚠️  Error reading .env file, trying dotenv:', err.message);
    require('dotenv').config({ path: envPath });
  }
} else {
  require('dotenv').config({ path: envPath });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for in-memory file storage
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));

// Serve static files from edge directory (for shared modules used by v2/main.js)
const edgePath = path.join(__dirname, '..', 'edge');
app.use('/edge', express.static(edgePath));

// Serve static files from v2 directory (for v2 app files)
const v2Path = path.join(__dirname);
app.use(express.static(v2Path));

// Serve v2/index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(v2Path, 'index.html'));
});

/**
 * Reasoning endpoint: Receives image and detection data, sends to LLM for analysis
 * POST /api/reasoning
 * Body: multipart/form-data
 *   - image: Image file
 *   - detections: JSON string of detection array
 *   - timestamp: ISO timestamp string
 *   - prompt: Custom prompt for LLM (optional)
 *   - llmProvider: LLM provider name (default: "openai")
 *   - modelType: Model type/name (default: "gpt-4o")
 */
app.post('/api/reasoning', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!req.body.detections) {
      return res.status(400).json({ error: 'No detection data provided' });
    }

    // Process API request (optional hook)
    await apiRequestProcessing(req);

    const imageBuffer = req.file.buffer;
    const detections = JSON.parse(req.body.detections);
    const timestamp = req.body.timestamp || new Date().toISOString();
    const imageMimeType = req.file.mimetype || 'image/jpeg';
    const customPrompt = req.body.prompt;
    const llmProvider = req.body.llmProvider || 'openai';
    const modelType = req.body.modelType || 'gpt-4o';

    // Currently only OpenAI is supported, but structure allows for other providers
    if (llmProvider !== 'openai') {
      return res.status(400).json({ 
        error: `LLM provider "${llmProvider}" not yet supported. Only "openai" is currently supported.` 
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env file'
      });
    }

    // Call LLM for reasoning
    const { analysis, model, usage, raw: openaiData } = await analyzeWithLLM(
      imageBuffer,
      imageMimeType,
      detections,
      timestamp,
      process.env.OPENAI_API_KEY,
      customPrompt
    );

    const reasoningResults = {
      success: true,
      timestamp,
      detections,
      analysis,
      model,
      usage,
      llmProvider,
      modelType
    };

    // Process response (optional hook)
    await apiResponceProcessing(openaiData, analysis, detections, timestamp);

    // Execute final actions based on reasoning results
    await executeFinalActions(reasoningResults);

    res.json(reasoningResults);

  } catch (error) {
    console.error('Error processing reasoning request:', error);
    if (error.status && error.details) {
      return res.status(error.status).json({
        error: 'LLM API request failed',
        details: error.details
      });
    }
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Final Actions: Execute actions based on reasoning results
 * Examples: Send notifications (Viber/Telegram), log data, trigger external services
 * @param {Object} reasoningResults - Results from LLM analysis
 * @returns {Promise<void>}
 */
async function executeFinalActions(reasoningResults) {
  // Example implementations - customize based on your needs

  // 1. Log data
  console.log('Reasoning Results:', {
    timestamp: reasoningResults.timestamp,
    detections: reasoningResults.detections.length,
    analysis: reasoningResults.analysis.substring(0, 100) + '...',
    model: reasoningResults.model
  });

  // 2. Send notifications (example structure - implement actual API calls)
  // Example: Send to Telegram
  // if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  //   await sendTelegramNotification(reasoningResults);
  // }

  // Example: Send to Viber
  // if (process.env.VIBER_BOT_TOKEN && process.env.VIBER_CHAT_ID) {
  //   await sendViberNotification(reasoningResults);
  // }

  // 3. Trigger external services
  // Example: Webhook
  // if (process.env.WEBHOOK_URL) {
  //   await triggerWebhook(reasoningResults);
  // }

  // 4. Save to database/file system
  // Example: Save reasoning results
  // await saveReasoningResults(reasoningResults);
}

/**
 * Example: Send Telegram notification
 * @param {Object} reasoningResults - Reasoning results
 */
async function sendTelegramNotification(reasoningResults) {
  // Implement Telegram bot API call
  // const message = `Detection Alert:\n${reasoningResults.analysis}`;
  // await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     chat_id: process.env.TELEGRAM_CHAT_ID,
  //     text: message
  //   })
  // });
}

/**
 * Example: Send Viber notification
 * @param {Object} reasoningResults - Reasoning results
 */
async function sendViberNotification(reasoningResults) {
  // Implement Viber bot API call
  // Similar structure to Telegram
}

/**
 * Example: Trigger webhook
 * @param {Object} reasoningResults - Reasoning results
 */
async function triggerWebhook(reasoningResults) {
  // Implement webhook call
  // await fetch(process.env.WEBHOOK_URL, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(reasoningResults)
  // });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Vision Pipeline Server is running',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`Vision Pipeline Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set. Please configure it in .env file');
  }
});

module.exports = { app, executeFinalActions };
