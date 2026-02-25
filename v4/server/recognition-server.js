/**
 * Recognition API: exposes setupRecognitionServer(app) to register POST /api/recognize on the main app.
 * Accepts image as base64 and optional config, uses recognize() from recognition/recognition.mjs, returns detections.
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
// import { recognize } from './recognition/recognition.mjs';
import { recognize } from './recognition/yolo/detect-yolo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let CONFIG = null;
try {
  const configPath = path.join(__dirname, '..', 'config.js');
  const configModule = await import(pathToFileURL(configPath).href);
  CONFIG = configModule.default ?? configModule.CONFIG;
} catch (err) {
  console.warn('Could not load config.js:', err.message);
  CONFIG = {
    recognition: { threshold: 0.5, maxResults: 10, classes: [] },
    model: { baseOptions: {} },
  };
}

/**
 * Registers the recognition API on the given Express app.
 * @param {Express.Application} app - Express application instance
 */
export function setupRecognitionServer(app) {
  /**
   * POST /api/recognize
   * Body: { image: string (base64), mime?: string, config?: object }
   * Returns: { success: true, detections: Array } or { success: false, error: string }
   */
  app.post('/api/recognize', async (req, res) => {
    try {
      const { image, mime = 'image/jpeg', config } = req.body ?? {};
      if (!image || typeof image !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid body: "image" (base64 string) required',
        });
      }

      const dataUrl = image.startsWith('data:')
        ? image
        : `data:${mime || 'image/jpeg'};base64,${image.replace(/^data:[^;]+;base64,/, '')}`;
      const effectiveConfig = config && typeof config === 'object' ? config : CONFIG;

      const detections = await recognize(dataUrl, effectiveConfig);

      return res.json({ success: true, detections });
    } catch (err) {
      console.error('[recognition]', err?.stack ?? err);
      return res.status(500).json({
        success: false,
        error: err?.message ?? String(err),
      });
    }
  });
}
