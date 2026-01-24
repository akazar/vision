// Script to fix .env file encoding issues
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.log('No .env file found. Creating a new one...');
  console.log('Please add your OPENAI_API_KEY to the .env file');
  fs.writeFileSync(envPath, 'OPENAI_API_KEY=your_key_here\nPORT=3001\n', 'utf8');
  console.log('Created .env file. Please edit it with your API key.');
  process.exit(0);
}

console.log('Reading .env file...');
// Read as buffer first to detect encoding
const buffer = fs.readFileSync(envPath);
let content = null;
let detectedKey = null;
let detectedPort = null;

// Try different encodings
const encodings = ['utf8', 'utf16le', 'latin1'];
for (const encoding of encodings) {
  try {
    content = buffer.toString(encoding);
    // Try to extract the key
    const keyMatch = content.match(/OPENAI[_\s]*API[_\s]*KEY[=:]\s*([^\s\r\n]+)/i);
    const portMatch = content.match(/PORT[=:]\s*(\d+)/i);
    
    if (keyMatch) {
      detectedKey = keyMatch[1].replace(/[\s\u0000]/g, ''); // Remove spaces and null chars
      console.log(`✓ Found API key using ${encoding} encoding`);
    }
    if (portMatch) {
      detectedPort = portMatch[1];
    }
    
    if (detectedKey) break;
  } catch (err) {
    continue;
  }
}

// If we found the key, extract it more carefully
if (!detectedKey) {
  // Try to extract from raw buffer by looking for 'sk-' pattern
  const bufferStr = buffer.toString('latin1');
  const skMatch = bufferStr.match(/sk-[a-zA-Z0-9_-]+/);
  if (skMatch) {
    detectedKey = skMatch[0];
    console.log('✓ Found API key by pattern matching');
  }
}

if (!detectedKey) {
  console.error('✗ Could not extract API key from .env file');
  console.log('\nPlease manually recreate the .env file:');
  console.log('1. Delete the current .env file');
  console.log('2. Create a new .env file in VS Code or Notepad++');
  console.log('3. Make sure it\'s saved as UTF-8 encoding');
  console.log('4. Add: OPENAI_API_KEY=sk-your-key-here');
  console.log('5. Add: PORT=3001');
  process.exit(1);
}

// Create clean .env file
const cleanContent = `OPENAI_API_KEY=${detectedKey}\nPORT=${detectedPort || '3001'}\n`;
fs.writeFileSync(envPath, cleanContent, 'utf8');
console.log('✓ Fixed .env file encoding (saved as UTF-8)');
console.log(`\n✓ API Key: ${detectedKey.substring(0, 7)}...${detectedKey.slice(-4)}`);
console.log(`✓ Port: ${detectedPort || '3001'}`);
console.log('\n✓ .env file has been fixed! Restart your server.');

