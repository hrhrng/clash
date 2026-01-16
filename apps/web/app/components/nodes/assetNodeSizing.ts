import type { AssetStatus } from '../../../lib/assetStatus';

export const MAX_MEDIA_DIMENSION = 500;
export const DEFAULT_MEDIA_DIMENSION = 400;
export const MIN_MEDIA_WIDTH = 240;
export const MIN_MEDIA_HEIGHT = 180;

export type MediaSize = { width: number; height: number };

const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const hasValidMeasuredSize = (width: unknown, height: unknown): boolean => {
    const widthValue = toNumber(width);
    const heightValue = toNumber(height);
    if (widthValue === null || heightValue === null) return false;
    return widthValue >= MIN_MEDIA_WIDTH && heightValue >= MIN_MEDIA_HEIGHT;
};

export const getMeasuredSize = (width: unknown, height: unknown): MediaSize | null => {
    const widthValue = toNumber(width);
    const heightValue = toNumber(height);
    if (widthValue === null || heightValue === null) return null;
    return { width: widthValue, height: heightValue };
};

export function calculateScaledDimensions(naturalWidth: number, naturalHeight: number): MediaSize {
    if (!naturalWidth || !naturalHeight) {
        return { width: DEFAULT_MEDIA_DIMENSION, height: DEFAULT_MEDIA_DIMENSION };
    }

    const scale = Math.min(1, MAX_MEDIA_DIMENSION / Math.max(naturalWidth, naturalHeight));
    return {
        width: Math.round(naturalWidth * scale),
        height: Math.round(naturalHeight * scale),
    };
}

export function calculateDimensionsFromAspectRatio(aspectRatio?: string): MediaSize {
    if (!aspectRatio) {
        return { width: DEFAULT_MEDIA_DIMENSION, height: DEFAULT_MEDIA_DIMENSION };
    }

    const parts = aspectRatio.split(':');
    if (parts.length !== 2) {
        return { width: DEFAULT_MEDIA_DIMENSION, height: DEFAULT_MEDIA_DIMENSION };
    }

    const widthRatio = parseFloat(parts[0]);
    const heightRatio = parseFloat(parts[1]);

    if (!widthRatio || !heightRatio) {
        return { width: DEFAULT_MEDIA_DIMENSION, height: DEFAULT_MEDIA_DIMENSION };
    }

    if (widthRatio >= heightRatio) {
        const width = MAX_MEDIA_DIMENSION;
        const height = Math.round((heightRatio / widthRatio) * MAX_MEDIA_DIMENSION);
        return { width, height };
    }

    const height = MAX_MEDIA_DIMENSION;
    const width = Math.round((widthRatio / heightRatio) * MAX_MEDIA_DIMENSION);
    return { width, height };
}

type ResolveInitialSizeParams = {
    status: AssetStatus;
    hasPreview: boolean;
    measuredWidth?: unknown;
    measuredHeight?: unknown;
    naturalDimensions: MediaSize | null;
    aspectRatioDimensions: MediaSize;
};

export const resolveInitialMediaSize = ({
    status,
    hasPreview,
    measuredWidth,
    measuredHeight,
    naturalDimensions,
    aspectRatioDimensions,
}: ResolveInitialSizeParams): MediaSize => {
    if (hasValidMeasuredSize(measuredWidth, measuredHeight)) {
        return getMeasuredSize(measuredWidth, measuredHeight) ?? aspectRatioDimensions;
    }

    const useAspectRatioOnly =
        status === 'generating' ||
        (status === 'uploading' && !hasPreview && !naturalDimensions) ||
        (!hasPreview && !naturalDimensions);

    if (useAspectRatioOnly) {
        return aspectRatioDimensions;
    }

    if (naturalDimensions && status === 'uploading') {
        return naturalDimensions;
    }

    return naturalDimensions ?? aspectRatioDimensions;
};
