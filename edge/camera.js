/**
 * Starts the camera with specified constraints
 * @param {HTMLVideoElement} video - Video element to display camera feed
 * @param {string} facingMode - Camera facing mode ("environment" or "user")
 * @returns {Promise<MediaStream>} Camera stream
 */
export async function startCamera(video, facingMode) {
  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  await new Promise((res) => {
    video.onloadedmetadata = () => res();
  });

  return stream;
}

/**
 * Stops the camera stream
 * @param {MediaStream} stream - Camera stream to stop
 */
export function stopCamera(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

/**
 * Resizes the overlay canvas to match the video display size
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
export function resizeOverlay(canvas, video, ctx) {
  // Match canvas buffer to the on-screen video size
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

