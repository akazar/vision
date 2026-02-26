/**
 * main.js — Entry point for the v4 server.
 * Creates the Express app, wires front-end hosting (hosting-server.js) and API logic (api-server.js),
 * then starts the HTTP server on PORT (default 3001).
 */

import express from 'express';
import { setupFrontendHosting } from './hosting-server.js';
import { setupServerLogic } from './api-server.js';
import { setupRecognitionServer } from './recognition-server.js';
import { setupReasoningServer } from './reasoning-server.js';

const PORT = process.env.PORT || 3001;

// Check OpenAI API key status
if (process.env.OPENAI_API_KEY) {
  const keyPreview = process.env.OPENAI_API_KEY.substring(0, 7) + '...' + process.env.OPENAI_API_KEY.slice(-4);
  console.log('✓ OPENAI_API_KEY loaded:', keyPreview);
} else {
  console.warn('⚠️  OPENAI_API_KEY not set. Set it in .env for /api/describe');
}

const app = express();

// Setup front-end hosting routes
setupFrontendHosting(app);

// Setup server logic (API endpoints, middleware)
setupServerLogic(app);

// Setup recognition API (POST /api/recognize)
setupRecognitionServer(app);

// Setup reasoning API (POST /api/reasoning)
setupReasoningServer(app);

// Start the server
app.listen(PORT, () => {
  console.log(`v4 server running at http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
