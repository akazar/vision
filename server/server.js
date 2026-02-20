const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { analyzeWithLLM } = require('./reasoning');
const { apiRequestProcessing, apiResponceProcessing } = require('./actions');

// Load .env file with explicit UTF-8 encoding
// .env file is in the parent directory (project root)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  // Read .env file as UTF-8 and parse manually if dotenv fails
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
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    });
    console.log('✓ .env file loaded manually (UTF-8)');
  } catch (err) {
    console.warn('⚠️  Error reading .env file manually, trying dotenv:', err.message);
    require('dotenv').config({ path: envPath });
  }
} else {
  require('dotenv').config({ path: envPath });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Log API key status (without exposing the key)
if (process.env.OPENAI_API_KEY) {
  const keyPreview = process.env.OPENAI_API_KEY.substring(0, 7) + '...' + process.env.OPENAI_API_KEY.slice(-4);
  console.log('✓ OPENAI_API_KEY loaded:', keyPreview);
} else {
  console.error('✗ OPENAI_API_KEY not found in environment variables');
  if (fs.existsSync(envPath)) {
    console.error('  .env file exists but key not loaded. Check file encoding (should be UTF-8)');
  }
}

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

// Serve static files from edge directory
const edgePath = path.join(__dirname, '..', 'edge');
app.use(express.static(edgePath));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(edgePath, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Vision API server is running',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

// Main endpoint to receive image and JSON, then send to OpenAI
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!req.body.detections) {
      return res.status(400).json({ error: 'No detection data provided' });
    }

    // Process API request after receiving it
    await apiRequestProcessing(req);

    const imageBuffer = req.file.buffer;
    const detections = JSON.parse(req.body.detections);
    const timestamp = req.body.timestamp || new Date().toISOString();
    const imageMimeType = req.file.mimetype || 'image/jpeg';

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env file'
      });
    }

    const { analysis, model, usage, raw: openaiData } = await analyzeWithLLM(
      imageBuffer,
      imageMimeType,
      detections,
      timestamp,
      process.env.OPENAI_API_KEY
    );

    await apiResponceProcessing(openaiData, analysis, detections, timestamp);

    res.json({
      success: true,
      timestamp,
      detections,
      analysis,
      model,
      usage
    });

  } catch (error) {
    console.error('Error processing request:', error);
    if (error.status && error.details) {
      return res.status(error.status).json({
        error: 'OpenAI API request failed',
        details: error.details
      });
    }
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Describe image: accepts base64 image + prompt, returns OpenAI description (for v4 / client use)
app.post('/api/describe', async (req, res) => {
  try {
    const { image, prompt } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "image" (base64 data URL)' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env'
      });
    }

    const describePrompt = prompt || 'Describe this image in detail.';
    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: describePrompt },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      max_tokens: 500
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: 'OpenAI API request failed',
        details: errText
      });
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content || 'No description';

    res.json({
      success: true,
      description,
      model: data.model,
      usage: data.usage
    });
  } catch (error) {
    console.error('Error in /api/describe:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Vision API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set. Please configure it in .env file');
  }
});


