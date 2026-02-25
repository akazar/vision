/**
 * recognition-server.js — CLI script for server-side image recognition.
 * Loads an image from a local path (argv), runs recognition natively in Node
 * (server/recognition-node.js + lib/recognition-core.js), runs server reasoning
 * actions from config, draws bounding boxes via lib/bounding-boxes.js, and optionally
 * saves the annotated image next to the original.
 * Usage: node recognition-server.js <path-to-image>
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
import CONFIG from '../config.js';
import { drawBoundingBoxes } from '../lib/bounding-boxes.js';
import { action } from '../lib/actions.js';
import { recognizeFromPath } from './recognition-node.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get image path from argv; resolve to absolute; throw if missing or not a file.
 */
function getImagePathFromArgv() {
  const raw = process.argv[2];
  if (!raw || typeof raw !== 'string') {
    throw new Error('Usage: node recognition-server.js <path-to-image>');
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

  const { recognition, model } = CONFIG;
  const results = await recognizeFromPath(imagePath, {
    classes: recognition.classes,
    threshold: recognition.threshold,
    modelConfig: model,
  });

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

    const buf =
      outFormat.mime === 'image/jpeg'
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
