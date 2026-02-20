import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sets up front-end hosting routes for the Express app
 * @param {Express} app - Express application instance
 */
export function setupFrontendHosting(app) {
  // Path definitions
  const v4Root = path.join(__dirname, '..');
  const clientPath = path.join(__dirname, '..', 'client');
  const cameraStreamPath = path.join(__dirname, '..', 'client', 'camera-stream');
  const imageUploadPath = path.join(__dirname, '..', 'client', 'image-upload');

  // Landing page at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  // v4 root (config.js, lib/, etc.) at / for module imports from both clients
  // This must come before client static to ensure module imports work
  app.use(express.static(v4Root));

  // Serve client static files (styles.css for landing page)
  // This serves files from client folder but won't override specific routes above
  app.use(express.static(clientPath));

  // Camera-stream client at /camera-stream
  app.use('/camera-stream', express.static(cameraStreamPath));
  app.get('/camera-stream', (req, res) => {
    res.sendFile(path.join(cameraStreamPath, 'index.html'));
  });
  app.get('/camera-stream/', (req, res) => {
    res.sendFile(path.join(cameraStreamPath, 'index.html'));
  });

  // Image upload client
  app.use('/image-upload', express.static(imageUploadPath));
  app.get('/image-upload', (req, res) => {
    res.sendFile(path.join(imageUploadPath, 'index.html'));
  });
}
