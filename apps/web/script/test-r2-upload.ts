import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import { uploadBase64ImageToR2, uploadVideoFromUrlToR2 } from '../lib/r2-upload';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load frontend/.env for R2 credentials
loadEnv({ path: path.join(__dirname, '..', '.env') });

async function main() {
    const projectId = process.env.R2_TEST_PROJECT_ID || 'local-test';
    const timestamp = Date.now();
    const baseName = `r2-test-${timestamp}`;

    console.log('Using projectId:', projectId);

    // Prefer a local image if provided
    const imagePath = process.env.R2_TEST_IMAGE_PATH;
    let imageBase64: string;
    let imageContentType = 'image/png';
    let imageExt = 'png';

    if (imagePath) {
        const resolved = path.isAbsolute(imagePath)
            ? imagePath
            : path.join(process.cwd(), imagePath);
        console.log('\nReading local image:', resolved);
        const file = fs.readFileSync(resolved);
        imageBase64 = file.toString('base64');

        const ext = path.extname(resolved).replace('.', '').toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') {
            imageContentType = 'image/jpeg';
            imageExt = 'jpg';
        } else if (ext === 'gif') {
            imageContentType = 'image/gif';
            imageExt = 'gif';
        } else if (ext === 'webp') {
            imageContentType = 'image/webp';
            imageExt = 'webp';
        } else {
            imageContentType = 'image/png';
            imageExt = 'png';
        }
    } else {
        // 1x1 transparent PNG fallback
        imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y6nZwAAAABJRU5ErkJggg==';
        imageContentType = 'image/png';
        imageExt = 'png';
    }

    console.log('\nUploading test image to R2...');
    const imageResult = await uploadBase64ImageToR2({
        base64Data: imageBase64,
        projectId,
        fileName: `${baseName}.${imageExt}`,
        contentType: imageContentType,
    });
    console.log('Image uploaded:', imageResult);

    const videoUrl = process.env.R2_TEST_VIDEO_URL ||
        'https://sample-videos.com/video321/mp4/240/big_buck_bunny_240p_1mb.mp4';

    console.log('\nUploading test video to R2...');
    const videoResult = await uploadVideoFromUrlToR2({
        videoUrl,
        projectId,
        fileName: `${baseName}`,
    });
    console.log('Video uploaded:', videoResult);
}

main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
