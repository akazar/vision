const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { analyzeWithLLM } = require('./reasoning');
const { apiRequestProcessing, apiResponceProcessing } = require('./middleware');

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

app.listen(PORT, () => {
  console.log(`Vision API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set. Please configure it in .env file');
  }
});


