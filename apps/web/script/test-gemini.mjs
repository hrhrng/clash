import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  console.log('🚀 Testing Vercel AI SDK with Google Gemini Image Edit...\n');

  try {
    // Read image and convert to base64
    const imagePath = join(__dirname, 'ENTER_FILE_NAME_0.png');
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log('📸 Image loaded, size:', imageBuffer.length, 'bytes\n');

    const result = await generateText({
      model: 'google/gemini-2.5-flash-image',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: base64Image,
            },
            {
              type: 'text',
              text: 'Make it more detailed and vibrant.',
            },
          ],
        },
      ],
    });

    const imageFiles = result.files?.filter((f) =>
      f.mediaType?.startsWith('image/'),
    );

    if (imageFiles && imageFiles.length > 0) {
      // Create output directory if it doesn't exist
      const outputDir = join(__dirname, '../output');
      mkdirSync(outputDir, { recursive: true });

      const timestamp = Date.now();

      for (const [index, file] of imageFiles.entries()) {
        const extension = file.mediaType?.split('/')[1] || 'png';
        const filename = `image-${timestamp}-${index}.${extension}`;
        const filepath = join(outputDir, filename);

        writeFileSync(filepath, file.uint8Array);
        console.log(`Saved image to ${filepath}`);
      }
    }

    console.log('✅ Success!');
    console.log('\nResult:', JSON.stringify(result));

    // Save result to JSON file
    const outDir = join(__dirname, '../out');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 's.json'), JSON.stringify(result, null, 2));
    console.log('Saved result to out/s.json');

    console.log('\nUsage:', result.usage);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

test();
