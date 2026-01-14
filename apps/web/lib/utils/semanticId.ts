/**
 * Semantic ID Generation Utilities
 *
 * Provides utilities to generate human-readable, memorable IDs
 * like "alpha-ocean-square" for nodes and assets.
 */

// Backend base URL for semantic ID generation (frontend-exposed)
const API_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_API_URL || // fallback for server contexts
    'http://localhost:8888';

interface GenerateIDResponse {
    ids: string[];
    project_id: string;
}

/**
 * Word lists for generating human-readable IDs client-side
 */
const ADJECTIVES = [
    'alpha', 'bright', 'coral', 'deep', 'emerald', 'frost', 'golden', 'hazy',
    'ivory', 'jade', 'keen', 'lunar', 'misty', 'noble', 'ocean', 'pearl',
    'quiet', 'rustic', 'silver', 'teal', 'ultra', 'vivid', 'warm', 'zen'
];

const NOUNS = [
    'aurora', 'breeze', 'crystal', 'dawn', 'echo', 'flame', 'glacier', 'horizon',
    'island', 'jungle', 'kite', 'lagoon', 'meadow', 'nebula', 'oasis', 'prism',
    'quartz', 'river', 'storm', 'temple', 'umbra', 'valley', 'wave', 'zenith'
];

const SHAPES = [
    'arc', 'bloom', 'cube', 'dome', 'edge', 'fold', 'grid', 'helix',
    'iris', 'jewel', 'knot', 'loop', 'mesh', 'node', 'orb', 'peak',
    'quad', 'ring', 'star', 'tower', 'unity', 'vortex', 'wave', 'zest'
];

/**
 * Generate a semantic ID locally (fallback when backend unavailable)
 */
function generateLocalSemanticId(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${adj}-${noun}-${shape}-${suffix}`;
}

/**
 * Generate semantic IDs from the backend API
 *
 * @param projectId - Project ID for scoping
 * @param count - Number of IDs to generate (default: 1)
 * @returns Array of generated semantic IDs
 */
export async function generateSemanticIds(projectId: string, count: number = 1): Promise<string[]> {
    try {
        const response = await fetch(`${API_URL}/api/generate-ids`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                project_id: projectId,
                count,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to generate IDs: ${response.statusText}`);
        }

        const data: GenerateIDResponse = await response.json();
        return data.ids;
    } catch (error) {
        console.warn('[SemanticID] Backend unavailable, using local generation:', error);
        // Fallback to local generation with human-readable IDs
        return Array.from({ length: count }, () => generateLocalSemanticId());
    }
}

/**
 * Generate a single semantic ID
 *
 * @param projectId - Project ID for scoping
 * @returns A semantic ID string
 */
export async function generateSemanticId(projectId: string): Promise<string> {
    const ids = await generateSemanticIds(projectId, 1);
    return ids[0];
}

/**
 * Cache for batched ID generation to reduce API calls
 */
class SemanticIdCache {
    private cache: Map<string, string[]> = new Map();
    private batchSize = 10;

    async getId(projectId: string): Promise<string> {
        const cached = this.cache.get(projectId);
        if (cached && cached.length > 0) {
            return cached.shift()!;
        }

        const ids = await generateSemanticIds(projectId, this.batchSize);
        this.cache.set(projectId, ids.slice(1)); // Store remaining
        return ids[0];
    }

    clear(projectId?: string) {
        if (projectId) {
            this.cache.delete(projectId);
        } else {
            this.cache.clear();
        }
    }
}

export const semanticIdCache = new SemanticIdCache();

/**
 * Get a semantic ID with caching
 * This is more efficient for generating many IDs in succession
 *
 * @param projectId - Project ID for scoping
 * @returns A semantic ID string
 */
export async function getCachedSemanticId(projectId: string): Promise<string> {
    return semanticIdCache.getId(projectId);
}

