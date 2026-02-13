# Vision Detection with OpenAI Analysis

Real-time object detection in the browser (MediaPipe) with optional cloud LLM analysis (OpenAI Vision). The backend serves the frontend and provides an `/api/analyze` endpoint that sends images and detection data to OpenAI.

## Overview

- **Frontend (edge/)**  
  Browser app: camera stream, local object detection, bounding boxes, capture, and optional auto-capture. Sends image + detections to the backend for analysis.

- **Backend (server/)**  
  Express server that serves the edge app and exposes `/api/analyze`. Uses a **reasoning** module (cloud LLM config + OpenAI Vision call) and **middleware** for request/response hooks.

## Architecture

### Edge (frontend) – thematic folders

| Folder        | Role |
|---------------|------|
| **capture/**  | Camera (start/stop/resize), frame processing, screen capture to blob + JSON, download. |
| **boxes/**    | Drawing bounding boxes, smoothing (EMA + dead zone), viewport mapping. |
| **recognition/** | Local object detection (MediaPipe detector), detection config (FPS, model, smoothing params), filter by object type. |
| **reasoning/**  | Client-side: `requestAnalysis(blob, jsonData)` → `POST /api/analyze`. |
| **actions/**   | Pre/post API hooks (`imageDetectedProcessing`, `apiResponceProcessing`) and UI handling of analysis result/error. |

- **edge/config.js** – API base URL, object type options, drawing styles, auto-capture options (no detection/LLM config; that lives in `recognition/` and server `reasoning/`).

### Server (backend)

| Path | Role |
|------|------|
| **server.js** | Express app, static serving of `edge/`, `/` and `/health`, `/api/analyze` route. Loads `.env`, uses `reasoning` and `middleware`. |
| **reasoning/** | Cloud LLM: **config.js** (model, max_tokens, prompt builder), **analyze.js** (`analyzeWithLLM` → OpenAI Vision API). |
| **middleware.js** | `apiRequestProcessing`, `apiResponceProcessing` (hooks around the analyze flow). |

Flow: request → multer → `apiRequestProcessing` → `reasoning.analyzeWithLLM` → `apiResponceProcessing` → JSON response.

### File structure (high level)

```
vision/
├── edge/                    # Frontend (static, served by server)
│   ├── app.js               # Entry, detection loop, UI, runCaptureAndAnalyze
│   ├── config.js            # API URL, UI/drawing/object-type config
│   ├── index.html
│   ├── styles.css
│   ├── capture/             # Camera + screen capture
│   ├── boxes/               # Drawing + smoothing
│   ├── recognition/         # Detector + filter + detection config
│   ├── reasoning/           # Client: requestAnalysis
│   └── actions/             # API response handling + hooks
├── server/
│   ├── server.js            # Express, routes, static
│   ├── middleware.js        # Request/response hooks
│   └── reasoning/           # Cloud LLM config + analyzeWithLLM
├── .env                     # OPENAI_API_KEY, PORT (not committed)
├── package.json
└── README.md
```

## Setup

### 1. Install and env

```bash
npm install
```

Create a `.env` in the project root:

```
OPENAI_API_KEY=sk-your-key-here
PORT=3001
```

Get an API key from [OpenAI API keys](https://platform.openai.com/api-keys).

### 2. Run

```bash
npm start
```

- Server: `http://localhost:3001` (or your `PORT`).
- Frontend: open `http://localhost:3001` (server serves `edge/` and `index.html` at `/`).
- No separate frontend server: the Node server serves the edge app.

Development with auto-reload:

```bash
npm run dev
```

### 3. Use the app

1. Open `http://localhost:3001` in a browser (HTTPS required for camera in production).
2. Allow camera access.
3. Click ▶ to start detection.
4. Use 📷 to capture and send the current frame + detections for OpenAI analysis.
5. Optional: enable auto-capture and “Download images on detection” in settings (⚙).

## API

### POST /api/analyze

Accepts multipart form data:

- `image` – image file (e.g. JPG)
- `detections` – JSON string of detection array
- `timestamp` – ISO string

Returns JSON:

```json
{
  "success": true,
  "timestamp": "...",
  "detections": [...],
  "analysis": "OpenAI description of the image",
  "model": "gpt-4o",
  "usage": { ... }
}
```

### GET /health

Health check; includes `apiKeyConfigured` and `port`.

## Deployment (e.g. Render)

1. Connect the repo to Render and create a **Web Service**.
2. **Build**: `npm install`  
   **Start**: `npm start`  
   **Root**: project root.
3. **Environment**: set `OPENAI_API_KEY`. Optionally set `PORT` (Render often sets it automatically).
4. Frontend is served at `/`; use HTTPS so the camera works.

Notes:

- Do not commit `.env`; set secrets in the Render dashboard.
- On free tier, the service may spin down after inactivity; first request can be slow.

## Requirements

- Node.js 14+
- Modern browser with camera access (for detection/capture)
- OpenAI API key (for analysis)
