# Shared Detection Logic

This folder contains shared object detection logic used by both the mobile web application and the Node.js application. All modules use **ES6 modules** for consistency across platforms.

## Structure

### Shared ES6 Modules (for both Web and Node.js)

- `filter.js` - Object type filtering utilities
- `smoothing.js` - Bounding box smoothing algorithms
- `processor.js` - Detection data processing
- `detector.js` - MediaPipe Object Detector initialization (works in both browser and Node.js)

### Configuration

- `edge/config.js` - Shared configuration used by both web and Node.js applications

## Shared Functionality

### Filtering (`filter.js`)

- `filterDetectionsByType(detections, filterType, objectTypeMap)` - Filters detections by object type (person, pet, car, all)
- `isSelectedObjectTypeDetected(detections, filterType, objectTypeMap)` - Checks if a specific object type is detected

### Smoothing (`smoothing.js`)

- `smoothBBox(smoothBoxes, key, bbox, confidence, baseAlpha)` - Applies Exponential Moving Average (EMA) smoothing to bounding boxes
- `applyDeadZone(prev, curr, eps)` - Removes micro-jitter by filtering small movements

### Processing (`processor.js`)

- `processDetections(detections, bboxMapping, imageWidth, imageHeight)` - Processes raw MediaPipe detections into standardized format
- `createDetectionData(processedDetections)` - Formats detection data for API calls

### Detector (`detector.js`)

- `initDetector(modelConfig, runningMode)` - Initializes MediaPipe Object Detector
  - `runningMode`: "VIDEO" for web app, "IMAGE" for Node.js app
  - Automatically detects environment (browser vs Node.js) and uses appropriate WASM files

## Usage

### Web Application

```javascript
import { filterDetectionsByType } from '../detection/filter.js';
import { smoothBBox, applyDeadZone } from '../detection/smoothing.js';
import { initDetector } from '../detection/detector.js';
import { MODEL_CONFIG } from './config.js';

const detector = await initDetector(MODEL_CONFIG, "VIDEO");
```

### Node.js Application

```javascript
import { filterDetectionsByType } from '../detection/filter.js';
import { smoothBBox, applyDeadZone } from '../detection/smoothing.js';
import { initDetector } from '../detection/detector.js';
import { MODEL_CONFIG } from '../edge/config.js';

const detector = await initDetector(MODEL_CONFIG, "IMAGE");
```

## Configuration

Both applications use the same configuration from `edge/config.js`:

- `MODEL_CONFIG` - MediaPipe model configuration
- `OBJECT_TYPE_MAP` - Maps filter types to object categories
- `DRAWING_STYLES` - Bounding box appearance
- `BASE_ALPHA` - Smoothing factor
- `DEAD_ZONE_EPS` - Dead zone threshold
- `API_BASE_URL` - API server URL

## API Calls

API calls are made **separately** by each application:
- Web app: `edge/capture.js` handles API calls
- Node.js app: `node-app/detect-image.mjs` handles API calls

This ensures each application maintains independence while sharing core detection logic.

## Benefits of Unified ES6 Modules

- **Single source of truth**: Same code for both platforms
- **Consistency**: Identical behavior across web and Node.js
- **Maintainability**: Changes in one place affect both applications
- **No duplication**: No need to maintain separate CommonJS versions
