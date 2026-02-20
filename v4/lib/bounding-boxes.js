/**
 * Bounding boxes drawing module
 * Draws bounding boxes on top of video element for recognized objects
 */

import CONFIG from '../config.js';

let overlayCanvas = null;
let overlayCtx = null;

/**
 * Maps bounding box coordinates from video pixel space to displayed video size
 * Accounts for object-fit: cover scaling
 * @param {Object} bbox - Bounding box with coordinates and size in video pixel space
 * @param {HTMLVideoElement} video - Video element
 * @returns {Object} Mapped bounding box {x, y, width, height} in display coordinates
 */
function mapBoundingBoxToDisplay(bbox, video) {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (!videoWidth || !videoHeight) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    const videoRect = video.getBoundingClientRect();
    const displayWidth = videoRect.width;
    const displayHeight = videoRect.height;
    
    // Calculate scale factor for object-fit: cover
    // object-fit: cover maintains aspect ratio and covers entire container
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;
    const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure coverage
    
    // Calculate scaled dimensions
    const scaledVideoWidth = videoWidth * scale;
    const scaledVideoHeight = videoHeight * scale;
    
    // Calculate offsets (how much is cropped on each side)
    const offsetX = (scaledVideoWidth - displayWidth) / 2;
    const offsetY = (scaledVideoHeight - displayHeight) / 2;
    
    // Map coordinates from video space to display space
    const x = bbox.coordinates.x * scale - offsetX;
    const y = bbox.coordinates.y * scale - offsetY;
    const width = bbox.size.width * scale;
    const height = bbox.size.height * scale;
    
    return { x, y, width, height };
}

/**
 * Creates or gets the overlay canvas for drawing bounding boxes
 * @param {HTMLVideoElement} video - Video element
 * @returns {HTMLCanvasElement} Canvas element
 */
function getOrCreateOverlayCanvas(video) {
    if (!overlayCanvas) {
        overlayCanvas = document.createElement('canvas');
        overlayCanvas.id = 'bounding-boxes-overlay';
        overlayCanvas.style.position = 'fixed';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.width = '100%';
        overlayCanvas.style.height = '100%';
        overlayCanvas.style.pointerEvents = 'none'; // Allow clicks to pass through
        overlayCanvas.style.zIndex = '5'; // Between video (0) and content (10)
        
        // Insert after video element
        const videoElement = document.getElementById('camera-background');
        if (videoElement && videoElement.parentNode) {
            videoElement.parentNode.insertBefore(overlayCanvas, videoElement.nextSibling);
        } else {
            document.body.appendChild(overlayCanvas);
        }
        
        overlayCtx = overlayCanvas.getContext('2d');
    }
    
    // Update canvas size to match viewport
    const rect = video.getBoundingClientRect();
    if (overlayCanvas.width !== rect.width || overlayCanvas.height !== rect.height) {
        overlayCanvas.width = rect.width;
        overlayCanvas.height = rect.height;
    }
    
    return overlayCanvas;
}

/**
 * Clears all bounding boxes from the overlay canvas
 */
export function clearBoundingBoxes() {
    if (overlayCanvas && overlayCtx) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
}

/**
 * Low-level: draws bounding boxes on a canvas context. Coordinates are in the context's space.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<{x: number, y: number, width: number, height: number, label: string}>} boxes - Boxes to draw
 * @param {Object} styles - Optional styles (merged with CONFIG.boundingBoxStyles)
 */
export function drawBoundingBoxes(ctx, boxes, styles = {}) {
    if (!boxes || boxes.length === 0) return;
    const s = { ...CONFIG.boundingBoxStyles, ...styles };
    const canvas = ctx.canvas;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    ctx.strokeStyle = s.strokeStyle;
    ctx.lineWidth = s.lineWidth;
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur;
    ctx.font = s.font;
    ctx.textBaseline = 'top';

    boxes.forEach((box) => {
        const { x, y, width, height, label } = box;
        if (width <= 0 || height <= 0) return;

        drawRoundedRect(ctx, x, y, width, height, s.borderRadius);

        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 20;
        const labelX = Math.max(0, Math.min(x, canvasWidth - textWidth - s.labelPadding * 2));
        const labelY = Math.max(0, y - textHeight - s.labelPadding * 2);

        ctx.shadowBlur = 0;
        ctx.fillStyle = s.labelBgColor;
        ctx.fillRect(labelX, labelY, textWidth + s.labelPadding * 2, textHeight + s.labelPadding * 2);
        ctx.fillStyle = s.labelTextColor;
        ctx.fillText(label, labelX + s.labelPadding, labelY + s.labelPadding);
        ctx.shadowBlur = s.shadowBlur;
    });
}

/**
 * Draws bounding boxes for recognized objects on top of the video element
 * @param {Array} recognitionResults - Array of recognition results from recognize() function
 * @param {HTMLVideoElement} video - Video element
 * @param {Object} styles - Drawing styles configuration object
 */
export function boundingBoxes(recognitionResults, video, styles) {
    if (!video || !recognitionResults || recognitionResults.length === 0) {
        clearBoundingBoxes();
        return;
    }

    const canvas = getOrCreateOverlayCanvas(video);
    const ctx = overlayCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const boxes = recognitionResults
        .map((result) => {
            const displayBox = mapBoundingBoxToDisplay(result, video);
            const x = Math.max(0, Math.min(canvas.width, displayBox.x));
            const y = Math.max(0, Math.min(canvas.height, displayBox.y));
            const width = Math.max(0, Math.min(canvas.width - x, displayBox.width));
            const height = Math.max(0, Math.min(canvas.height - y, displayBox.height));
            if (width <= 0 || height <= 0) return null;
            return {
                x,
                y,
                width,
                height,
                label: `${result.class} ${(result.confidence * 100).toFixed(0)}%`,
            };
        })
        .filter(Boolean);

    drawBoundingBoxes(ctx, boxes, styles);
}

/**
 * Draws a rounded rectangle
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} radius - Border radius
 */
export function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
}
