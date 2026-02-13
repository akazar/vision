/**
 * Processes the current video frame for further operations (e.g., saving locally)
 * @param {HTMLVideoElement} video - Video element containing the current frame
 * @returns {Promise<HTMLCanvasElement>} Canvas element with the current frame drawn
 */
export async function imageRealTimeProcessing(video) {
  if (!video || video.readyState < 2) {
    return null;
  }

  // Use actual video dimensions to preserve aspect ratio
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  if (!videoW || !videoH) {
    return null;
  }

  // Create canvas for the current frame
  const canvas = document.createElement("canvas");
  canvas.width = videoW;
  canvas.height = videoH;
  const ctx = canvas.getContext("2d");

  // Draw the current video frame to canvas
  ctx.drawImage(video, 0, 0, videoW, videoH);

  // Canvas is now ready for further processing (e.g., saving locally)
  return canvas;
}
