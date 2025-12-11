import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = 'http://localhost:3000/api/ai/generate';

async function testProxy() {
  console.log('🚀 Testing Vercel AI Proxy...\n');

  // Test 1: Simple text prompt
  console.log('📝 Test 1: Simple text generation');
  try {
    const response1 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash-exp',
        prompt: 'Write a haiku about coding.',
      }),
    });

    const result1 = await response1.json();
    console.log('✅ Success!');
    console.log('Result:', result1.text);
    console.log('Usage:', result1.usage);
    console.log('---\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Image analysis
  console.log('📝 Test 2: Image analysis');
  try {
    const imagePath = join(__dirname, 'ENTER_FILE_NAME_0.png');
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response2 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-3-pro-preview',
        prompt:
          'Describe this architectural drawing. What are the main rooms and features?',
        image: base64Image,
      }),
    });

    const result2 = await response2.json();
    console.log('✅ Success!');
    console.log('Result:', result2.text);
    console.log('Usage:', result2.usage);
    console.log('---\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Multi-turn conversation
  console.log('📝 Test 3: Multi-turn conversation');
  try {
    const response3 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash-exp',
        messages: [
          {
            role: 'user',
            content: 'What is Next.js?',
          },
          {
            role: 'assistant',
            content: 'Next.js is a React framework for building web applications.',
          },
          {
            role: 'user',
            content: 'What are its main features?',
          },
        ],
      }),
    });

    const result3 = await response3.json();
    console.log('✅ Success!');
    console.log('Result:', result3.text);
    console.log('Usage:', result3.usage);
    console.log('---\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('🎉 All tests completed!');
}

// Run tests
testProxy();
