# Project Architecture

This document describes the architecture of the vision detection project, including the shared detection logic and separate web and Node.js applications.

## Overview

The project consists of:
1. **Shared Detection Logic** (`detection/` folder) - Core detection functionality used by both applications
2. **Mobile Web Application** (`edge/` folder) - Browser-based object detection
3. **Node.js Application** (`node-app/` folder) - Local image processing
4. **API Server** (`server.js`) - OpenAI analysis endpoint

## Shared Detection Logic

Location: `detection/` folder

### Purpose
Contains reusable core functionality for object detection that is shared between the web and Node.js applications.

### Structure

#### ES6 Modules (for Web)
- `filter.js` - Object type filtering
- `smoothing.js` - Bounding box smoothing
- `processor.js` - Detection data processing

#### CommonJS Modules (for Node.js)
- `filter-node.js` - Object type filtering (CommonJS)
- `smoothing-node.js` - Bounding box smoothing (CommonJS)
- `processor-node.js` - Detection data processing (CommonJS)
- `config-node.js` - Node.js configuration

### Key Functions

1. **Filtering** (`filter.js` / `filter-node.js`)
   - `filterDetectionsByType()` - Filters detections by object type
   - `isSelectedObjectTypeDetected()` - Checks if object type is present

2. **Smoothing** (`smoothing.js` / `smoothing-node.js`)
   - `smoothBBox()` - Exponential Moving Average smoothing
   - `applyDeadZone()` - Removes micro-jitter

3. **Processing** (`processor.js` / `processor-node.js`)
   - `createDetectionData()` - Formats data for API

## Mobile Web Application

Location: `edge/` folder

### Technology Stack
- MediaPipe Object Detector (browser-based)
- ES6 Modules
- HTML5 Canvas for drawing

### Key Files
- `app.js` - Main application logic
- `detector.js` - MediaPipe detector initialization
- `drawing.js` - Canvas drawing functions (uses shared filter)
- `smoothing.js` - Wrapper for shared smoothing (with web config)
- `capture.js` - Screen capture and API calls
- `config.js` - Web application configuration

### Flow
1. User starts detection → Camera stream begins
2. MediaPipe detects objects in video frames
3. Shared filtering and smoothing applied
4. Bounding boxes drawn on canvas overlay
5. User captures → Image + detection data sent to API
6. API response displayed

### API Calls
- Made by `capture.js`
- Sends image and detection data to `/api/analyze`
- Displays response in UI

## Node.js Application

Location: `node-app/` folder

### Technology Stack
- MediaPipe Object Detector (same as web app)
- Node.js Canvas
- CommonJS modules

### Key Files
- `detect-image.js` - Main application entry point
- Uses shared detection logic from `detection/` folder

### Flow
1. Load local image file
2. MediaPipe Object Detector detects objects (IMAGE mode)
3. Apply shared filtering and smoothing
4. Draw bounding boxes on image
5. Save annotated image locally
6. Save detection data as JSON
7. Send to API and save response

### Usage
```bash
npm run detect <image-path> [output-dir]
```

### Output Files
For each image, creates:
- `<name>-detected-<timestamp>.jpg` - Image with bounding boxes
- `<name>-detection-<timestamp>.json` - Detection data
- `<name>-api-response-<timestamp>.json` - API response

### API Calls
- Made by `detect-image.js`
- Sends image and detection data to `/api/analyze`
- Saves response to JSON file

## API Server

Location: `server.js`

### Purpose
Receives images and detection data, sends to OpenAI for analysis.

### Endpoints
- `POST /api/analyze` - Main analysis endpoint
- `GET /health` - Health check

### Flow
1. Receive image and detection data
2. Format prompt with detection information
3. Send to OpenAI Vision API
4. Return analysis result

## Configuration

### Web Application
- `edge/config.js` - ES6 module exports
- Contains: API URL, model config, drawing styles, object type map

### Node.js Application
- `detection/config-node.js` - CommonJS exports
- Contains: API URL, drawing styles, object type map

## Key Design Decisions

1. **Shared Logic Separation**
   - Core detection logic in `detection/` folder
   - Platform-specific wrappers in each application
   - Ensures consistency between web and Node.js

2. **Independent API Calls**
   - Each application makes its own API calls
   - No shared API client
   - Allows different error handling and UI updates

3. **Module System Compatibility**
   - ES6 modules for web (browser native)
   - CommonJS for Node.js (Node.js native)
   - Separate implementations maintain compatibility

4. **Unified Model Backend**
   - Both Web and Node.js use MediaPipe Object Detector
   - Same model configuration ensures consistent results
   - Web uses VIDEO mode, Node.js uses IMAGE mode (both same model)

## File Structure

```
vision/
├── detection/              # Shared detection logic
│   ├── filter.js          # ES6: Filtering
│   ├── smoothing.js        # ES6: Smoothing
│   ├── processor.js        # ES6: Processing
│   ├── filter-node.js      # CommonJS: Filtering
│   ├── smoothing-node.js   # CommonJS: Smoothing
│   ├── processor-node.js   # CommonJS: Processing
│   ├── config-node.js      # CommonJS: Config
│   └── README.md
├── edge/                   # Web application
│   ├── app.js
│   ├── detector.js
│   ├── drawing.js
│   ├── smoothing.js        # Wrapper for shared logic
│   ├── capture.js
│   ├── config.js
│   └── ...
├── node-app/               # Node.js application
│   ├── detect-image.js
│   └── README.md
├── server.js               # API server
└── package.json
```

## Dependencies

### Web Application
- MediaPipe Tasks Vision (CDN)
- No npm dependencies (runs in browser)

### Node.js Application
- `canvas` - Image processing
- `@mediapipe/tasks-vision` - MediaPipe Object Detector (same as web)
- `node-fetch` - HTTP requests
- `form-data` - Form data handling

### API Server
- `express` - Web server
- `multer` - File upload handling
- `node-fetch` - OpenAI API calls
- `dotenv` - Environment variables

## Future Enhancements

1. **Unified Model Backend**
   - Consider using same model backend for consistency
   - May require MediaPipe Node.js support or TensorFlow.js in browser

2. **Shared API Client**
   - Could create shared API client module
   - Currently separate for flexibility

3. **Configuration Unification**
   - Could merge config files with conditional exports
   - Currently separate for clarity

