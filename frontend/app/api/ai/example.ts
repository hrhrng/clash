/**
 * Example usage of the AI proxy endpoint
 */

// Example 1: Simple text generation
export async function generateText(prompt: string) {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.0-flash-exp',
      prompt,
    }),
  });

  const result = await response.json();
  return result.text;
}

// Example 2: Image analysis
export async function analyzeImage(imageBase64: string, prompt: string) {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-3-pro-preview',
      prompt,
      image: imageBase64,
    }),
  });

  const result = await response.json();
  return result.text;
}

// Example 3: Multi-turn conversation
export async function continueConversation(
  messages: Array<{ role: string; content: string }>
) {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.0-flash-exp',
      messages,
    }),
  });

  const result = await response.json();
  return result;
}

// Example 4: With custom parameters
export async function generateWithOptions(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
) {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      ...options,
    }),
  });

  const result = await response.json();
  return result;
}
