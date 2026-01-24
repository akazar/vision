// Helper script to check if .env file is configured correctly
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('\n=== Environment Configuration Check ===\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('✓ .env file found at:', envPath);
  
  // Read and display .env content (masking sensitive data)
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  
  console.log('\nFound environment variables:');
  lines.forEach(line => {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      if (key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD')) {
        const masked = value.length > 10 
          ? value.substring(0, 7) + '...' + value.slice(-4)
          : '***';
        console.log(`  ${key.trim()}=${masked}`);
      } else {
        console.log(`  ${key.trim()}=${value.trim()}`);
      }
    }
  });
} else {
  console.log('✗ .env file NOT found at:', envPath);
  console.log('\nPlease create a .env file with the following content:');
  console.log('OPENAI_API_KEY=sk-your-api-key-here');
  console.log('PORT=3001');
}

// Check if OPENAI_API_KEY is loaded
console.log('\n=== Environment Variable Check ===');
if (process.env.OPENAI_API_KEY) {
  const key = process.env.OPENAI_API_KEY;
  const preview = key.length > 10 
    ? key.substring(0, 7) + '...' + key.slice(-4)
    : '***';
  console.log('✓ OPENAI_API_KEY is loaded:', preview);
  console.log('  Length:', key.length, 'characters');
  console.log('  Starts with:', key.substring(0, 3));
} else {
  console.log('✗ OPENAI_API_KEY is NOT loaded');
  console.log('\nTroubleshooting:');
  console.log('1. Make sure .env file exists in the project root');
  console.log('2. Check the format: OPENAI_API_KEY=sk-... (no spaces around =)');
  console.log('3. Restart the server after creating/editing .env file');
  console.log('4. Make sure there are no quotes around the value');
}

if (process.env.PORT) {
  console.log('✓ PORT is set:', process.env.PORT);
} else {
  console.log('ℹ PORT not set, will use default: 3001');
}

console.log('\n=== Current Working Directory ===');
console.log(__dirname);
console.log('\n');

