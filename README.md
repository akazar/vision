# Vision Detection with OpenAI Analysis

This project consists of two parts:
1. **Frontend** (edge/): A web application using MediaPipe for real-time object detection
2. **Backend** (server.js): A Node.js API server that receives images and detection data, then sends them to OpenAI for analysis

## Setup

### Backend Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

3. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

### Frontend Setup

1. Update the API URL in `edge/script.js` if your server is running on a different URL:
```javascript
const API_BASE_URL = 'http://localhost:3000'; // or your server URL
```

2. Serve the frontend files using a local web server (required for camera access):
```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

3. Open `http://localhost:8000/edge/index.html` in your browser

## Usage

1. Open the web application in your browser
2. Click the "Start" button (▶) to initialize detection
3. Point your camera at objects
4. Click the capture button (📷) to:
   - Capture the current frame
   - Send image and detection data to the API
   - Receive OpenAI's analysis of what's in the image

## API Endpoints

### POST /api/analyze

Receives an image file and detection JSON, sends to OpenAI for analysis.

**Request:**
- `image`: Image file (multipart/form-data)
- `detections`: JSON string of detection data
- `timestamp`: ISO timestamp string

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:45.123Z",
  "detections": [...],
  "analysis": "OpenAI's description of the image",
  "model": "gpt-4o",
  "usage": {...}
}
```

### GET /health

Health check endpoint.

## Requirements

- Node.js 14+ for the backend
- Modern browser with camera access for the frontend
- OpenAI API key

