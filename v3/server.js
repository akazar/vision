const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { reasoning } = require('./server-lib.js');

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
    console.warn('⚠️  Error reading .env file:', err.message);
    require('dotenv').config({ path: envPath });
  }
} else {
  require('dotenv').config({ path: envPath });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for in-memory file storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));

// Serve edge folder so client-lib.js can load ../edge/capture/*.js, ../edge/recognition/*.js
app.use('/edge', express.static(path.join(__dirname, '..', 'edge')));

// Serve static files from v3 directory
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Vision API server is running',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

// Main endpoint to receive image and recognition results, then send to LLM
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!req.body.detections) {
      return res.status(400).json({ error: 'No detection data provided' });
    }

    // Parse recognition results
    const recognitionResults = JSON.parse(req.body.detections);
    const prompt = req.body.prompt || null;
    const llmProvider = req.body.llmProvider || 'openai';
    const modelType = req.body.modelType || 'gpt-4o';
    const timestamp = req.body.timestamp || new Date().toISOString();

    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env file'
      });
    }

    // Call reasoning function from server-lib
    const result = await reasoning(
      recognitionResults,
      prompt,
      llmProvider,
      modelType,
      {
        imageBuffer: req.file.buffer,
        imageMimeType: req.file.mimetype || 'image/jpeg',
        timestamp: timestamp
      }
    );

    res.json(result);

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Vision API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set. Please configure it in .env file');
  }
});
