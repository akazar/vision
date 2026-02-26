/**
 * hosting-server.js — Front-end hosting for the v4 app.
 * Registers Express routes and static middleware for: root landing page, /config,
 * /camera-stream, /image-upload, /server-detection, and /server-reasoning. Serves the v4 root for shared lib/ and config.js.
 */

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
  const landingPath = path.join(__dirname, '..', 'client', 'landing');
  const configPath = path.join(__dirname, '..', 'config');
  const cameraStreamPath = path.join(__dirname, '..', 'client', 'camera-stream');
  const imageUploadPath = path.join(__dirname, '..', 'client', 'image-upload');
  const serverDetectionPath = path.join(__dirname, '..', 'client', 'server-detection');
  const serverReasoningPath = path.join(__dirname, '..', 'client', 'server-reasoning');

  // Landing page at root (index + styles from client/landing)
  app.get('/', (req, res) => {
    res.sendFile(path.join(landingPath, 'index.html'));
  });
  app.use(express.static(landingPath));

  // v4 root (config.js, lib/, etc.) at / for module imports from both clients
  // This must come before client static to ensure module imports work
  app.use(express.static(v4Root));

  // Serve client static files (other client assets)
  app.use(express.static(clientPath));

  // Config generator at /config
  app.use('/config', express.static(configPath));
  app.get('/config', (req, res) => {
    res.sendFile(path.join(configPath, 'index.html'));
  });
  app.get('/config/', (req, res) => {
    res.sendFile(path.join(configPath, 'index.html'));
  });

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
  app.get('/image-upload/', (req, res) => {
    res.sendFile(path.join(imageUploadPath, 'index.html'));
  });

  // Server-detection client at /server-detection
  app.use('/server-detection', express.static(serverDetectionPath));
  app.get('/server-detection', (req, res) => {
    res.sendFile(path.join(serverDetectionPath, 'index.html'));
  });
  app.get('/server-detection/', (req, res) => {
    res.sendFile(path.join(serverDetectionPath, 'index.html'));
  });

  // Server-reasoning client at /server-reasoning
  app.use('/server-reasoning', express.static(serverReasoningPath));
  app.get('/server-reasoning', (req, res) => {
    res.sendFile(path.join(serverReasoningPath, 'index.html'));
  });
  app.get('/server-reasoning/', (req, res) => {
    res.sendFile(path.join(serverReasoningPath, 'index.html'));
  });
}
