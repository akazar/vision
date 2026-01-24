# Setup Instructions

## Quick Start

### 1. Backend Setup

```bash
# Install dependencies
npm install

# Create .env file
echo "OPENAI_API_KEY=your_key_here" > .env
echo "PORT=3000" >> .env

# Start server
npm start
```

### 2. Frontend Setup

1. Update API URL in `edge/script.js` if needed (default: `http://localhost:3000`)
2. Serve the frontend using any HTTP server:
   - Python: `python -m http.server 8000`
   - Node: `npx http-server -p 8000`
   - PHP: `php -S localhost:8000`
3. Open `http://localhost:8000/edge/index.html`

### 3. Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add it to your `.env` file: `OPENAI_API_KEY=sk-...`

## Testing

1. Start the backend server
2. Open the frontend in your browser
3. Click "Start" to initialize detection
4. Click the capture button (📷) to capture and analyze

The analysis will appear in an alert dialog and in the browser console.

