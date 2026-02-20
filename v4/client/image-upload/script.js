/**
 * Image upload client: load image from file or URL, run recognition, show bounding boxes, download result.
 * Uses: imageToCanvas, recognize, drawBoundingBoxes from lib.
 */

import CONFIG from '../../config.js';
import { imageToCanvas } from '../../lib/source-to-canvas.js';
import { recognize } from '../../lib/recognition.js';
import { drawBoundingBoxes } from '../../lib/bounding-boxes.js';
import { action } from '../../lib/actions.js';

const fileInput = document.getElementById('fileInput');
const urlInput = document.getElementById('urlInput');
const recognizeBtn = document.getElementById('recognizeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewCanvas = document.getElementById('previewCanvas');
const placeholder = document.getElementById('placeholder');

/** Current image source: Blob (from file) or HTMLImageElement (from URL). Cleared after conversion to canvas. */
let currentImageSource = null;
/** Canvas with image + bounding boxes after recognition (used for display and download). */
let resultCanvas = null;

/**
 * Resolve current image to a canvas: from file (Blob) or from URL (Image).
 */
async function getSourceCanvas() {
    if (!currentImageSource) return null;
    if (currentImageSource instanceof Blob) {
        return imageToCanvas(currentImageSource);
    }
    if (currentImageSource instanceof HTMLImageElement && currentImageSource.complete && currentImageSource.naturalWidth) {
        return imageToCanvas(currentImageSource);
    }
    return null;
}

/**
 * Run recognition and show result canvas with bounding boxes; log results and show Download.
 */
async function runRecognition(canvas) {    
    try {
        const { recognition, model } = CONFIG;
        const results = await recognize(
            canvas,
            recognition.classes,
            recognition.threshold,
            model
        );
        // Draw image on a new canvas (same size), then draw boxes in image space
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        const boxes = results.map((r) => ({
            x: r.coordinates.x,
            y: r.coordinates.y,
            width: r.size.width,
            height: r.size.height,
            label: `${r.class} ${(r.confidence * 100).toFixed(0)}%`,
        }));
        drawBoundingBoxes(ctx, boxes);

        resultCanvas = out;
        previewCanvas.width = out.width;
        previewCanvas.height = out.height;
        previewCanvas.getContext('2d').drawImage(out, 0, 0);

        return results;
    } catch (err) {
        console.error('Recognition error:', err);
        alert('Recognition failed: ' + (err.message || 'Unknown error'));
    }
}

/**
 * Download the result image (with bounding boxes) as JPG.
 */
function downloadResult() {
    if (!resultCanvas) return;
    const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `recognition-${Date.now()}.jpg`;
    a.click();
}

// File selected
fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
        currentImageSource = file;
        urlInput.value = '';
    }
});

/**
 * Load image from URL into an HTMLImageElement and set as current source.
 */
function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            currentImageSource = img;
            resolve(img);
        };
        img.onerror = () => reject(new Error('Failed to load image from URL'));
        img.src = url;
    });
}

/**
 * Load image from URL input if present. Returns true to proceed, false to stop (e.g. load error).
 */
async function ensureImageSourceFromUrl() {
    const url = urlInput.value?.trim();
    if (!url) return true;
    try {
        await loadImageFromUrl(url);
        return true;
    } catch (e) {
        alert('Could not load image from URL. ' + (e.message || ''));
        return false;
    }
}

recognizeBtn.addEventListener('click', async () => {
    if (!(await ensureImageSourceFromUrl())) return;
        const canvas = await getSourceCanvas();
    if (!canvas) {
        alert('Please select an image file or enter a valid image URL first.');
        return;
    }
    recognizeBtn.disabled = true;
    const recognitionResults = await runRecognition(canvas);
    if (CONFIG.manualRecognitionActionFunctions.length > 0) {
        action(recognitionResults, CONFIG.manualRecognitionActionFunctions);  
    }
    placeholder.classList.add('hidden');
    downloadBtn.hidden = false;
    recognizeBtn.disabled = false;
});

downloadBtn.addEventListener('click', downloadResult);
