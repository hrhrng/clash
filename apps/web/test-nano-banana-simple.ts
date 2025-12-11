import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Image Registry
const IMAGE_REGISTRY: Map<string, string> = new Map();
const GENERATED_IMAGE_COUNTER: Map<string, number> = new Map();

function registerImage(name: string, base64Data: string): void {
    IMAGE_REGISTRY.set(name, base64Data);
}

function getImage(name: string): string {
    const data = IMAGE_REGISTRY.get(name);
    if (!data) {
        throw new Error(`Image '${name}' not found in registry`);
    }
    return data;
}

function clearImageRegistry(): void {
    IMAGE_REGISTRY.clear();
    GENERATED_IMAGE_COUNTER.clear();
}

function generateImageName(baseName: string): string {
    const currentCount = GENERATED_IMAGE_COUNTER.get(baseName) || 0;
    const newCount = currentCount + 1;
    GENERATED_IMAGE_COUNTER.set(baseName, newCount);
    return `${baseName}_${newCount}`;
}

function saveImageToFile(base64Data: string, filename: string, outputDir: string = './output'): string {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const filepath = path.join(outputDir, `${filename}.png`);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    return filepath;
}

function imageToBase64(imagePath: string): string {
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString('base64');
}

/**
 * Call Google AI via Cloudflare Gateway using fetch
 */
async function callGoogleAI(
    model: string,
    contents: any[],
    temperature: number = 0.7
): Promise<any> {
    const apiKey = process.env.GOOGLE_API_KEY;
    const baseURL = process.env.GOOGLE_AI_STUDIO_BASE_URL;

    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is required');
    }

    if (!baseURL) {
        throw new Error('GOOGLE_AI_STUDIO_BASE_URL environment variable is required');
    }

    // Construct the full URL
    // Cloudflare Gateway format: base_url/v1beta/models/model_name:generateContent
    const url = `${baseURL}/v1beta/models/${model}:generateContent`;

    const requestBody = {
        contents,
        generationConfig: {
            temperature,
        },
    };

    console.log('Request URL:', url);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `API request failed with status ${response.status}: ${errorText}`
        );
    }

    const data = await response.json();
    return data;
}

/**
 * Generate image using Nano Banana via Cloudflare Gateway
 */
async function nanoBananaGen(
    text: string,
    systemPrompt: string = '',
    base64Images: string[] = [],
    aspectRatio: string = '4:3',
    modelName: string = 'gemini-2.5-flash-image'
): Promise<string> {
    // Build contents array
    const contents: any[] = [];

    // Add system message if provided
    if (systemPrompt) {
        contents.push({
            role: 'user',
            parts: [{ text: systemPrompt }],
        });
        contents.push({
            role: 'model',
            parts: [{ text: 'Understood.' }],
        });
    }

    // Build user message parts
    const userParts: any[] = [{ text: text }];

    // Add images if provided
    if (base64Images && base64Images.length > 0) {
        for (const img of base64Images) {
            userParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: img,
                },
            });
        }
    }

    contents.push({
        role: 'user',
        parts: userParts,
    });

    console.log('Calling Google AI with model:', modelName);

    try {
        const response = await callGoogleAI(modelName, contents);

        console.log('API Response:', JSON.stringify(response, null, 2));

        // Extract image from response
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        console.log('Found image in response');
                        return part.inlineData.data;
                    }
                }
            }
        }

        throw new Error('No image found in response');
    } catch (error) {
        console.error('Error calling Google AI:', error);
        throw error;
    }
}

/**
 * Simple test of nano banana image generation
 */
async function testNanoBananaSimple(): Promise<void> {
    console.log('=== Starting Simple Nano Banana Test ===\n');

    try {
        // Step 1: Register test image
        console.log('Step 1: Registering test image...');
        const testImagePath = './assets/cuddly_cat_hat.png';
        if (fs.existsSync(testImagePath)) {
            registerImage('cat_original', imageToBase64(testImagePath));
            console.log('Test image registered as "cat_original"');
        } else {
            console.log('Test image not found, using placeholder');
            const placeholderBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            registerImage('cat_original', placeholderBase64);
        }

        // Step 2: Generate a simple image
        console.log('\nStep 2: Generating image with Nano Banana...');
        const imageData = await nanoBananaGen(
            'A happy cat wearing a red hat',
            'You are an AI that generates high-quality images.',
            [],
            '4:3'
        );

        console.log('Image generated successfully!');
        console.log('Image data length:', imageData.length);

        // Step 3: Save the generated image
        const imageName = generateImageName('generated');
        registerImage(imageName, imageData);
        const filepath = saveImageToFile(imageData, imageName);

        console.log(`\n✓ Image saved to: ${filepath}`);
        console.log(`✓ Image registered as: ${imageName}`);

        console.log('\n=== Test Completed Successfully ===');
    } catch (error) {
        console.error('\n=== Test Failed ===');
        console.error('Error:', error);
        throw error;
    } finally {
        console.log('\nCleaning up image registry...');
        clearImageRegistry();
        console.log('Cleanup complete');
    }
}

// Run test
if (require.main === module) {
    console.log('Starting simple Nano Banana test...\n');
    console.log('Environment:');
    console.log('- GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '✓ Set' : '✗ Not set');
    console.log('- GOOGLE_AI_STUDIO_BASE_URL:', process.env.GOOGLE_AI_STUDIO_BASE_URL || '(not set)');
    console.log('');

    testNanoBananaSimple()
        .then(() => {
            console.log('\n✓ All tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n✗ Test failed:', error.message);
            process.exit(1);
        });
}

export {
    registerImage,
    getImage,
    clearImageRegistry,
    nanoBananaGen,
    testNanoBananaSimple,
};
