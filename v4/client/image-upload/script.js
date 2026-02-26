/**
 * Image upload client: load image from file or URL, run YOLO recognition, show bounding boxes, download result.
 */

import CONFIG from '../../config.js';
import { imageToCanvas } from '../../lib/source-to-canvas.js';
import { recognize } from '../../lib/recognition/mediapipe/detect-mediapipe.js';
import { recognizeWithYolo, getImageFromSource } from '../../lib/recognition/yolo/detect-yolo.js';
import { drawBoundingBoxes } from '../../lib/bounding-boxes.js';
import { action } from '../../lib/actions.js';

const fileInput = document.getElementById('fileInput');
const urlInput = document.getElementById('urlInput');
const modelSelect = document.getElementById('modelSelect');
const recognizeBtn = document.getElementById('recognizeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewCanvas = document.getElementById('previewCanvas');
const placeholder = document.getElementById('placeholder');

/** Current image source: Blob (from file) or HTMLImageElement (from URL). */
let currentImageSource = null;
/** Canvas with image + bounding boxes after recognition (used for display and download). */
let resultCanvas = null;

/**
 * Run recognition and show result canvas with bounding boxes; log results and show Download.
 * Uses browser-side YOLOv11n ONNX via onnxruntime-web.
 */
async function runRecognition(currentImageSource, model = 'YOLO') {
    let results = null;
    if (model === 'MEDIAPIPE') {
        results = await recognize(
            currentImageSource,
            CONFIG
        );
    } else {
        results = await recognizeWithYolo(currentImageSource, CONFIG);
    }        

    // Draw image on a new canvas (same size as original image), then draw boxes in image space
    const img = model === 'YOLO' ? await getImageFromSource(currentImageSource) : currentImageSource;
    const out = document.createElement('canvas');
    let width = img.naturalWidth ?? img.width;
    let height = img.naturalHeight ?? img.height;
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
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
 * Resolve current image to a canvas: from file (Blob) or from URL (Image).
 */
async function getSourceCanvas(currentImageSource) {
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
    if (!currentImageSource) {
        alert('Please select an image file or enter a valid image URL first.');
        return;
    }
    recognizeBtn.disabled = true;

    const model = modelSelect.value ?? CONFIG.recognition.model;
    // For MEDIAPIPE pass a canvas; for YOLO pass original Blob/HTMLImageElement (do not overwrite currentImageSource)
    const sourceForRun = model === 'MEDIAPIPE'
        ? await getSourceCanvas(currentImageSource)
        : currentImageSource;
    const recognitionResults = await runRecognition(sourceForRun, model);

    if (CONFIG.manualRecognitionActionFunctions.length > 0) {
        action(recognitionResults, CONFIG.manualRecognitionActionFunctions);  
    }
    placeholder.classList.add('hidden');
    downloadBtn.hidden = false;
    recognizeBtn.disabled = false;
});

downloadBtn.addEventListener('click', downloadResult);
