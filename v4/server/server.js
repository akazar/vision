import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { serverAction } from './actions-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load CONFIG from config.js (same as client)
let REASONING_SERVER_ACTION_FUNCTIONS = [];
let REGULAR_SERVER_ACTION_FUNCTIONS = [];
try {
  const configPath = path.join(__dirname, '..', 'config.js');
  const configModule = await import(pathToFileURL(configPath).href);
  const CONFIG = configModule.default ?? configModule.CONFIG;
  REASONING_SERVER_ACTION_FUNCTIONS = CONFIG?.serverReasoningActionFunctions ?? [];
  REGULAR_SERVER_ACTION_FUNCTIONS = CONFIG?.serverRegularActionFunctions ?? [];
} catch (err) {
  console.warn('Could not load config from config.js:', err.message);
  REASONING_SERVER_ACTION_FUNCTIONS = [(d) => console.log('[Action] Description:', d)];
  REGULAR_SERVER_ACTION_FUNCTIONS = [];
}

let lastReasoningResult = '';

// Load .env from v4 folder (parent of server/)
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
    console.warn('⚠️  Error reading .env:', err.message);
    try { require('dotenv').config({ path: envPath }); } catch (_) {}
  }
} else {
  try { require('dotenv').config({ path: envPath }); } catch (_) {}
}

const app = express();
const PORT = process.env.PORT || 3001;

// v4 root (config.js, lib/*.js, etc.) for module imports – served at /
const v4Root = path.join(__dirname, '..');
// Camera-stream client – served at /camera-stream
const cameraStreamPath = path.join(__dirname, '..', 'client', 'camera-stream');

if (process.env.OPENAI_API_KEY) {
  const keyPreview = process.env.OPENAI_API_KEY.substring(0, 7) + '...' + process.env.OPENAI_API_KEY.slice(-4);
  console.log('✓ OPENAI_API_KEY loaded:', keyPreview);
} else {
  console.warn('⚠️  OPENAI_API_KEY not set. Set it in .env for /api/describe');
}

if (REGULAR_SERVER_ACTION_FUNCTIONS.length > 0) {
  REGULAR_SERVER_ACTION_FUNCTIONS.forEach(funcObj => {
    const run = async () => {
      await serverAction(lastReasoningResult, [funcObj.func]);
    };
    setInterval(run, funcObj.intervalMs);
  });
}

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '50mb' }));

// v4 root (config.js, lib/, etc.) at / for module imports from both clients
app.use(express.static(v4Root));

// Camera-stream client at /camera-stream
app.use('/camera-stream', express.static(cameraStreamPath));
app.get('/camera-stream', (req, res) => {
  res.sendFile(path.join(cameraStreamPath, 'index.html'));
});
app.get('/camera-stream/', (req, res) => {
  res.sendFile(path.join(cameraStreamPath, 'index.html'));
});

// Image upload client
const imageUploadPath = path.join(__dirname, '..', 'client', 'image-upload');
app.use('/image-upload', express.static(imageUploadPath));
app.get('/image-upload', (req, res) => {
  res.sendFile(path.join(imageUploadPath, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'v4 server running',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

// Describe image (used by v4 config action) – OpenAI key from .env
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
    lastReasoningResult = description;
    if (REASONING_SERVER_ACTION_FUNCTIONS.length > 0) {
      await serverAction(description, REASONING_SERVER_ACTION_FUNCTIONS);
    }

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
  console.log(`v4 server running at http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
