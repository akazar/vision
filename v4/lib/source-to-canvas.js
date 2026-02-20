/**
 * Convert image source to canvas
 * @param {HTMLVideoElement|HTMLCanvasElement|Blob|HTMLImageElement} image - Image source
 * @returns {Promise<HTMLCanvasElement>} Canvas containing the image
 */
export async function imageToCanvas(image) {
  if (image instanceof HTMLVideoElement) {
    const video = image;
    if (video.readyState < 2) {
      throw new Error('Video element is not ready');
    }
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    if (!videoW || !videoH) {
      throw new Error('Video dimensions not available');
    }
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = videoW;
    sourceCanvas.height = videoH;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, videoW, videoH);
    return sourceCanvas;
  }
  if (image instanceof HTMLCanvasElement) {
    return image;
  }
  if (image instanceof HTMLImageElement) {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.width;
    sourceCanvas.height = image.height;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return sourceCanvas;
  }
  if (image instanceof Blob) {
    const img = new Image();
    const url = URL.createObjectURL(image);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return sourceCanvas;
  }
  throw new Error('Invalid image type. Expected HTMLVideoElement, HTMLCanvasElement, HTMLImageElement, or Blob');
}
