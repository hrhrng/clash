
// Mock regex and functions from assets.ts
function isR2Key(src: string): boolean {
    if (typeof src !== 'string' || !src) return false;
    
    const normalized = src.trim();
    const isKey = normalized.startsWith('projects/') || normalized.startsWith('/projects/');
    
    console.log(`[isR2Key] Testing '${src}' -> normalized '${normalized}' -> ${isKey}`);
    return isKey;
}

function resolveAssetUrl(src: string): string {
    if (!src) return '';
    
    // Normalize source
    const s = src.trim();

    // If it's an R2 key, convert to local proxy URL
    if (isR2Key(s)) {
        // Ensure we don't double-slash if key somehow starts with /
        const cleanKey = s.startsWith('/') ? s.slice(1) : s;
        // const resolved = `/assets/${cleanKey}`;
        // Pointing to Next.js API route to match upload environment
        const resolved = `/api/assets/view/${cleanKey}`;
        // console.log(`[resolveAssetUrl] Resolved R2 key: ${src} -> ${resolved}`);
        return resolved;
    }

    // console.log(`[resolveAssetUrl] Not an R2 key: ${src}`);
    // Otherwise return as is (absolute URL, blob URL, data URI, etc.)
    return src;
}

// Test cases
const testKeys = [
    "projects/c02348dc-2bb9-4627-8a6c-be0c606de2cf/generated/task_1d7f4f887eeb.png",
    "/projects/c02348dc-2bb9-4627-8a6c-be0c606de2cf/generated/task_1d7f4f887eeb.png",
    "projects/c02348dc-2bb9-4627-8a6c-be0c606de2cf/assets/image-123.png",
    "https://example.com/image.png"
];

console.log("--- Starting Verification ---");
testKeys.forEach(key => {
    console.log(`Input: "${key}"`);
    console.log(`Resolved: "${resolveAssetUrl(key)}"`);
    console.log("---");
});
