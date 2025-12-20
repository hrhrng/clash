import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Image Registry - Similar to Python version
const IMAGE_REGISTRY: Map<string, string> = new Map();
const GENERATED_IMAGE_COUNTER: Map<string, number> = new Map();

/**
 * Register an image with a name for later reference
 */
function registerImage(name: string, base64Data: string): void {
    IMAGE_REGISTRY.set(name, base64Data);
}

/**
 * Retrieve base64 data for a registered image
 */
function getImage(name: string): string {
    const data = IMAGE_REGISTRY.get(name);
    if (!data) {
        throw new Error(
            `Image '${name}' not found in registry. Available images: ${Array.from(IMAGE_REGISTRY.keys()).join(', ')}`
        );
    }
    return data;
}

/**
 * Clear all registered images and counters
 */
function clearImageRegistry(): void {
    IMAGE_REGISTRY.clear();
    GENERATED_IMAGE_COUNTER.clear();
}

/**
 * Get list of all registered image names
 */
function listRegisteredImages(): string[] {
    return Array.from(IMAGE_REGISTRY.keys());
}

/**
 * Generate a unique image name based on the base name
 */
function generateImageName(baseName: string): string {
    const currentCount = GENERATED_IMAGE_COUNTER.get(baseName) || 0;
    const newCount = currentCount + 1;
    GENERATED_IMAGE_COUNTER.set(baseName, newCount);
    return `${baseName}_${newCount}`;
}

/**
 * Save base64-encoded image to file
 */
function saveImageToFile(
    base64Data: string,
    filename: string,
    outputDir: string = './output'
): string {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filepath = path.join(outputDir, `${filename}.png`);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);

    return filepath;
}

/**
 * Read image file and convert to base64
 */
function imageToBase64(imagePath: string): string {
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString('base64');
}

/**
 * Base nano banana generation function
 */
async function baseNanoBananaGen(
    text: string,
    systemPrompt: string = '',
    images: string[] = [],
    aspectRatio: string = '16:9',
    modelName: string = 'gemini-2.5-flash-image'
): Promise<string> {
    // Get API key and base URL from environment
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is required');
    }

    const baseURL = process.env.GOOGLE_AI_STUDIO_BASE_URL;

    const llm = new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: apiKey,
        ...(baseURL && {
            // @ts-ignore - apiEndpoint is supported
            apiEndpoint: baseURL,
        }),
    });

    // Build message content
    const content: any[] = [{ type: 'text', text: text }];
    if (images && images.length > 0) {
        for (const img of images) {
            content.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${img}` },
            });
        }
    }

    // Build messages
    const messages: any[] = [];
    if (systemPrompt) {
        messages.push(new SystemMessage(systemPrompt));
    }
    messages.push(new HumanMessage({ content }));

    try {
        // Call model
        const response = await llm.invoke(messages);
        console.log('Nano Banana Response:', response);

        // Extract image base64
        const imageBase64 = getImageBase64FromResponse(response);
        return imageBase64;
    } catch (error) {
        console.error('Error in nano_banana_gen:', error);
        throw error;
    }
}

/**
 * Extract base64 image from AI response
 */
function getImageBase64FromResponse(response: AIMessage): string {
    // Handle string content
    if (typeof response.content === 'string') {
        throw new Error(`Model returned text instead of image: ${response.content}`);
    }

    // Look for image block
    const content = Array.isArray(response.content) ? response.content : [response.content];

    const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;

    const imageBlock = content.find((block: unknown) => {
        if (!isRecord(block)) return false;
        return 'image_url' in block;
    });

    if (imageBlock) {
        const imageUrlValue = (imageBlock as Record<string, unknown>)['image_url'];
        const url =
            typeof imageUrlValue === 'string'
                ? imageUrlValue
                : isRecord(imageUrlValue) && typeof imageUrlValue.url === 'string'
                  ? imageUrlValue.url
                  : undefined;
        if (url) return url.split(',').pop() ?? url;
    }

    // Look for text block to give better error
    const textBlock = content.find(
        (block: any) => typeof block === 'object' && block.text
    );

    if (textBlock) {
        throw new Error(`Model returned text instead of image: ${textBlock.text}`);
    }

    throw new Error('No image generated in response');
}

/**
 * Nano Banana generation with Gemini 2.5 Flash Image
 */
async function nanoBananaGen(
    text: string,
    systemPrompt: string = '',
    base64Images: string[] = [],
    aspectRatio: string = '4:3'
): Promise<string> {
    return baseNanoBananaGen(
        text,
        systemPrompt,
        base64Images,
        aspectRatio,
        'gemini-2.5-flash-image'
    );
}

/**
 * Create nano_banana tool for LangGraph agent
 */
const nanoBananaTool = tool(
    async ({ text, systemPrompt = '', imageNames = [], aspectRatio = '4:3' }) => {
        // Convert image names to base64 data
        const base64Images = imageNames.map((name: string) => getImage(name));

        // Generate image
        const imageData = await nanoBananaGen(
            text,
            systemPrompt,
            base64Images,
            aspectRatio
        );

        // Generate new name based on first input image or "generated"
        const baseName = imageNames.length > 0 ? imageNames[0] : 'generated';
        const newImageName = generateImageName(baseName);

        // Register generated image
        registerImage(newImageName, imageData);

        // Save to file
        const filepath = saveImageToFile(imageData, newImageName);

        return JSON.stringify({
            success: true,
            imageName: newImageName,
            filepath: filepath,
            message: `Image generated and saved as ${newImageName}`,
        });
    },
    {
        name: 'nano_banana_tool',
        description:
            'Generate images using Nano Banana (Gemini 2.5 Flash Image). Use registered image names for reference images.',
        schema: z.object({
            text: z.string().describe('Text prompt for image generation'),
            systemPrompt: z.string().optional().describe('System-level instructions'),
            imageNames: z
                .array(z.string())
                .optional()
                .describe('List of registered image names to use as visual anchors'),
            aspectRatio: z
                .string()
                .optional()
                .describe(
                    'Desired aspect ratio for output image: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9'
                ),
        }),
    }
);

/**
 * Create get_images tool for retrieving registered images
 */
const getImagesTool = tool(
    async ({ imageNames = [] }) => {
        const base64Images = imageNames.map((name: string) => getImage(name));

        return JSON.stringify({
            success: true,
            images: base64Images.map((img: string, index: number) => ({
                name: imageNames[index],
                data: img.substring(0, 50) + '...', // Truncate for display
            })),
            count: base64Images.length,
        });
    },
    {
        name: 'get_images',
        description: 'Retrieve registered images by their names',
        schema: z.object({
            imageNames: z.array(z.string()).describe('List of registered image names to retrieve'),
        }),
    }
);

/**
 * Test agent with nano banana - equivalent to Python version
 */
async function testAgentWithNanoBanana(): Promise<void> {
    console.log('=== Starting Nano Banana Agent Test ===\n');

    try {
        // Step 1: Register images with descriptive names
        console.log('Step 1: Registering test image...');

        // Check if test image exists
        const testImagePath = './assets/cuddly_cat_hat.png';
        if (!fs.existsSync(testImagePath)) {
            console.log(`Test image not found at ${testImagePath}, creating a placeholder...`);
            // Create assets directory if it doesn't exist
            if (!fs.existsSync('./assets')) {
                fs.mkdirSync('./assets', { recursive: true });
            }
            // Create a simple placeholder image (1x1 pixel PNG)
            const placeholderBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            registerImage('cat_original', placeholderBase64);
            console.log('Using placeholder image');
        } else {
            registerImage('cat_original', imageToBase64(testImagePath));
            console.log('Test image registered as "cat_original"');
        }

        // Step 2: Build system prompt with available images
        console.log('\nStep 2: Building system prompt...');
        const systemPrompt = `You are an AI assistant with image generation capabilities.
When generating images, use the nano_banana_tool and reference images by their names in the imageNames parameter.
Available images: ${listRegisteredImages().join(', ')}`;

        console.log('System prompt created');

        // Step 3: Create model
        console.log('\nStep 3: Initializing Google AI model...');
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY environment variable is required');
        }

        const baseURL = process.env.GOOGLE_AI_STUDIO_BASE_URL;

        const model = new ChatGoogleGenerativeAI({
            model: 'gemini-2.0-flash-exp',
            temperature: 0.7,
            apiKey: apiKey,
            ...(baseURL && {
                // @ts-ignore - apiEndpoint is supported
                apiEndpoint: baseURL,
            }),
        });

        console.log('Model initialized');

        // Step 4: Create agent with tools
        console.log('\nStep 4: Creating LangGraph agent...');
        const agent = createReactAgent({
            llm: model,
            tools: [nanoBananaTool, getImagesTool],
        });

        console.log('Agent created');

        // Step 5: Invoke agent
        console.log('\nStep 5: Invoking agent with test query...');
        const result = await agent.invoke({
            messages: [
                new HumanMessage({
                    content: 'What does the image named cat_original look like?',
                }),
            ],
        });

        console.log('\n=== Agent Result ===');
        console.log(JSON.stringify(result, null, 2));

        console.log('\n=== Test Completed Successfully ===');
    } catch (error) {
        console.error('\n=== Test Failed ===');
        console.error('Error:', error);
        throw error;
    } finally {
        // Clean up
        console.log('\nCleaning up image registry...');
        clearImageRegistry();
        console.log('Cleanup complete');
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    console.log('Starting test...\n');
    console.log('Environment:');
    console.log('- GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '✓ Set' : '✗ Not set');
    console.log('- GOOGLE_AI_STUDIO_BASE_URL:', process.env.GOOGLE_AI_STUDIO_BASE_URL || '(not set)');
    console.log('');

    testAgentWithNanoBanana()
        .then(() => {
            console.log('\n✓ All tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n✗ Test failed:', error.message);
            process.exit(1);
        });
}

// Export functions for use in other modules
export {
    registerImage,
    getImage,
    clearImageRegistry,
    listRegisteredImages,
    nanoBananaGen,
    nanoBananaTool,
    getImagesTool,
    testAgentWithNanoBanana,
};
