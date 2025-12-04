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
    'http://localhost:8000';

interface GenerateIDResponse {
    ids: string[];
    project_id: string;
}

/**
 * Generate semantic IDs from the backend API
 *
 * @param projectId - Project ID for scoping
 * @param count - Number of IDs to generate (default: 1)
 * @returns Array of generated semantic IDs
 */
export async function generateSemanticIds(
    projectId: string,
    count: number = 1
): Promise<string[]> {
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
        console.error('Error generating semantic IDs:', error);
        // Fallback to timestamp-based IDs if API fails
        return Array.from({ length: count }, (_, i) =>
            `fallback-${Date.now()}-${i}`
        );
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
        // Check cache
        const cached = this.cache.get(projectId);
        if (cached && cached.length > 0) {
            return cached.shift()!;
        }

        // Refill cache
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

// Singleton cache instance
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
