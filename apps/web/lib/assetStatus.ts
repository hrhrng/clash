/**
 * Unified Asset Status Machine
 * 
 * Simple status machine for all AIGC assets (images, videos, etc.)
 * Both frontend and backend should use these exact values.
 * 
 * Status Flow:
 * uploading -> generating -> completed
 *           \            \-> failed
 *            \-> completed (for direct uploads)
 */

// Canonical status values used by both frontend and backend
export type AssetStatus = 'uploading' | 'generating' | 'completed' | 'fin' | 'failed';

// Status descriptions for UI display
export const StatusDisplay: Record<AssetStatus, { label: string; description: string }> = {
  fin: {
    label: 'Done',
    description: 'All processing finished',
  },
  uploading: {
    label: 'Uploading',
    description: 'Asset is being uploaded',
  },
  generating: {
    label: 'Generating',
    description: 'Asset is being generated',
  },
  completed: {
    label: 'Completed',
    description: 'Generation finished successfully',
  },
  failed: {
    label: 'Failed',
    description: 'Generation failed',
  },
};

// Helper to check if status represents an "active" state (not final)
export function isActiveStatus(status: AssetStatus): boolean {
  return status === 'uploading' || status === 'generating';
}

// Helper to check if status represents a "final" state
export function isFinalStatus(status: AssetStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'fin';
}

// Normalize legacy/old status values to the new 4-state system
export function normalizeStatus(status: string | undefined): AssetStatus {
  if (!status) return 'generating';
  
  const statusLower = status.toLowerCase();
  
  // Uploading state
  if (statusLower === 'uploading') {
    return 'uploading';
  }
  
  // Legacy mappings - all "in progress" states become 'generating'
  if (['pending', 'processing', 'generating'].includes(statusLower)) {
    return 'generating';
  }
  
  // Error/failed states
  if (['error', 'failed'].includes(statusLower)) {
    return 'failed';
  }
  
  // Completed state
  if (statusLower === 'completed') {
    return 'completed';
  }

  // Fin state
  if (statusLower === 'fin') {
    return 'fin';
  }
  
  // Default to generating for unknown statuses
  return 'generating';
}
