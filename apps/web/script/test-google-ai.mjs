import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

async function testGoogleAI() {
  console.log('🚀 Testing Vercel AI SDK with Google Gemini...\n');

  try {
    // Test 1: Simple text generation
    console.log('📝 Test 1: Simple text generation (gemini-1.5-flash)');
    const result1 = await generateText({
      model: google('gemini-1.5-flash'),
      prompt: 'Write a haiku about coding in TypeScript.',
    });
    console.log('Result:', result1.text);
    console.log(`Tokens: ${result1.usage?.totalTokens || 'N/A'}\n`);

    // Test 2: Structured prompt
    console.log('📝 Test 2: Structured prompt (gemini-1.5-pro)');
    const result2 = await generateText({
      model: google('gemini-1.5-pro'),
      prompt: 'Explain what Next.js App Router is in one sentence.',
    });
    console.log('Result:', result2.text);
    console.log(`Tokens: ${result2.usage?.totalTokens || 'N/A'}\n`);

    // Test 3: With system message
    console.log('📝 Test 3: With system message');
    const result3 = await generateText({
      model: google('gemini-1.5-flash'),
      system: 'You are a helpful coding assistant specializing in React and TypeScript.',
      prompt: 'What are the benefits of using server components in Next.js?',
    });
    console.log('Result:', result3.text);
    console.log(`Tokens: ${result3.usage?.totalTokens || 'N/A'}\n`);

    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
    }
  }
}

// Run the tests
testGoogleAI();
