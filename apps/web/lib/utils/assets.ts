/**
 * Asset Utility
 * Helper functions for handling R2 asset keys and URLs.
 */

/**
 * Check if a string is an R2 key (starts with "projects/").
 */
// Regex to match R2 keys: projects/{projectId}/{folder}/{fileName}
// Matches 'assets' (uploads) and 'generated' (tasks)
// const R2_KEY_REGEX = /^\/?projects\/[\w-]+\/(assets|generated)\/.+/;

export function isR2Key(src: string): boolean {
    if (typeof src !== 'string' || !src) return false;
    
    const normalized = src.trim();
    const isKey = normalized.startsWith('projects/') || normalized.startsWith('/projects/');
    return isKey;
}

/**
 * Resolve an asset source to a usable URL.
 * If it's an R2 key, returns "/assets/{key}".
 * If it's already a URL (http, blob, data), returns it as is.
 */
export function resolveAssetUrl(src: string): string {
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
    return src;
}
