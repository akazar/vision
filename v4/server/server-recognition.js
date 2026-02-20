/**
 * Server-side recognition script: load image from local path, run recognition (via browser),
 * draw bounding boxes using lib, save result in the same folder, log recognition data.
 * Reuses: drawBoundingBoxes from lib/bounding-boxes.js, CONFIG from config.js.
 * Recognition runs in a headless browser to reuse lib/recognition.js and lib/source-to-canvas.js.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { createCanvas, loadImage } from 'canvas';
import { chromium } from 'playwright';
import CONFIG from '../config.js';
import { drawBoundingBoxes } from '../lib/bounding-boxes.js';
import { action } from '../lib/actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const v4Root = path.join(__dirname, '..');

/**
 * Get image path from argv; resolve to absolute; throw if missing or not a file.
 */
function getImagePathFromArgv() {
  const raw = process.argv[2];
  if (!raw || typeof raw !== 'string') {
    throw new Error('Usage: node server-recognition.js <path-to-image>');
  }
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  return resolved;
}

/**
 * Run recognition in headless browser (reuses lib/recognition.js and lib/source-to-canvas.js).
 * Serves v4 root so /lib and /config.js resolve; opens image-upload, sets file, runs recognize.
 */
async function runRecognitionInBrowser(imagePath, port) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${port}/client/image-upload/index.html`;
    await page.goto(url, { waitUntil: 'networkidle' });

    await page.setInputFiles('#fileInput', imagePath);

    const results = await page.evaluate(async () => {
      const fileInput = document.getElementById('fileInput');
      const file = fileInput?.files?.[0];
      if (!file) return null;
      const { imageToCanvas } = await import('/lib/source-to-canvas.js');
      const { recognize } = await import('/lib/recognition.js');
      const config = (await import('/config.js')).default;
      const canvas = await imageToCanvas(file);
      return await recognize(
        canvas,
        config.recognition.classes,
        config.recognition.threshold,
        config.model
      );
    });

    return results;
  } finally {
    await browser.close();
  }
}

/**
 * Build boxes array in the format expected by drawBoundingBoxes (from image-upload script logic).
 */
function resultsToBoxes(results) {
  if (!results || results.length === 0) return [];
  return results.map((r) => ({
    x: r.coordinates.x,
    y: r.coordinates.y,
    width: r.size.width,
    height: r.size.height,
    label: `${r.class} ${(r.confidence * 100).toFixed(0)}%`,
  }));
}

/**
 * Mime type and buffer format for saving (same format as source when possible).
 */
function getOutputMime(ext) {
  const lower = (ext || '').toLowerCase();
  if (['.jpg', '.jpeg'].includes(lower)) return { mime: 'image/jpeg', ext: '.jpg' };
  if (lower === '.png') return { mime: 'image/png', ext: '.png' };
  if (['.webp'].includes(lower)) return { mime: 'image/webp', ext: '.webp' };
  return { mime: 'image/png', ext: '.png' };
}

async function main() {
  const imagePath = getImagePathFromArgv();
  const dir = path.dirname(imagePath);
  const basename = path.basename(imagePath, path.extname(imagePath));
  const ext = path.extname(imagePath);

  const app = express();
  app.use(express.static(v4Root));
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const port = server.address().port;

  let results = [];
  try {
    results = await runRecognitionInBrowser(imagePath, port);
    if (!results) results = [];
  } finally {
    server.close();
  }

  if (CONFIG.serverReasoningActionFunctions && CONFIG.serverReasoningActionFunctions.length > 0) {
    await action(results, CONFIG.serverReasoningActionFunctions);
  }

  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  if (CONFIG.boundingBoxStyles) {
    const boxes = resultsToBoxes(results);
    drawBoundingBoxes(ctx, boxes);
  }

  if (CONFIG.downloadResultImage) {
    const outFormat = getOutputMime(ext);
    const outName = `${basename}-recognition${outFormat.ext}`;
    const outPath = path.join(dir, outName);

    const buf = outFormat.mime === 'image/jpeg'
      ? canvas.toBuffer('image/jpeg', { quality: 0.95 })
      : canvas.toBuffer(outFormat.mime);
    fs.writeFileSync(outPath, buf);

    console.log(`Saved image with bounding boxes to: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
