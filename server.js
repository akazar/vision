const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load .env file with explicit UTF-8 encoding
const envPath = path.join(__dirname, '.env');
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
    require('dotenv').config();
  }
} else {
  require('dotenv').config();
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

    const imageBuffer = req.file.buffer;
    const detections = JSON.parse(req.body.detections);
    const timestamp = req.body.timestamp || new Date().toISOString();

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env file' 
      });
    }

    // Convert image buffer to base64
    const imageBase64 = imageBuffer.toString('base64');
    const imageMimeType = req.file.mimetype || 'image/jpeg';

    // Format detection data for the prompt
    const detectionSummary = detections.map(det => 
      `${det.categoryName} (${(det.score * 100).toFixed(0)}% confidence) at position [${det.x}, ${det.y}] with size ${det.width}×${det.height}`
    ).join('\n');

    // Create the prompt for OpenAI
    const prompt = `Analyze this image and describe what you see. The image contains the following detected objects:

${detectionSummary}

Please provide a detailed description of:
1. What is displayed in the picture
2. The context and scene
3. Any notable details about the detected objects
4. The overall composition and setting

Be specific and descriptive.`;

    // Prepare the request to OpenAI Vision API
    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    };

    // Send request to OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', errorText);
      return res.status(openaiResponse.status).json({ 
        error: 'OpenAI API request failed',
        details: errorText 
      });
    }

    const openaiData = await openaiResponse.json();
    const analysis = openaiData.choices[0]?.message?.content || 'No analysis available';

    // Return the analysis along with the detection data
    res.json({
      success: true,
      timestamp,
      detections,
      analysis,
      model: openaiData.model,
      usage: openaiData.usage
    });

  } catch (error) {
    console.error('Error processing request:', error);
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

