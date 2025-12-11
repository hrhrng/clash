import React from 'react';
import type { Item, Asset } from '@remotion-fast/core';

// Each item renderer receives the item, its bound asset (if any),
// and layout info precomputed by the parent container.
export type ItemRenderProps = {
  item: Item;
  asset: Asset | null;
  width: number; // pixels
  height: number; // pixels (inner content area)
  pixelsPerFrame: number;
};

export type ItemRenderer = React.FC<ItemRenderProps>;

// Renderers (implemented per type)
import { VideoRenderer } from './renderers/VideoRenderer';
import { AudioRenderer } from './renderers/AudioRenderer';
import { ImageRenderer } from './renderers/ImageRenderer';
import { TextRenderer } from './renderers/TextRenderer';
import { SolidRenderer } from './renderers/SolidRenderer';
import { StickerRenderer } from './renderers/StickerRenderer';

// Registry: map item.type to its renderer.
// Adding a new type only requires wiring here and implementing its renderer.
export const itemRendererRegistry: Record<string, ItemRenderer> = {
  video: VideoRenderer,
  audio: AudioRenderer,
  image: ImageRenderer,
  text: TextRenderer,
  solid: SolidRenderer,
  // Future: animated stickers (webp, image sequences)
  sticker: StickerRenderer,
} as const;

export function getRendererForItem(item: Item): ItemRenderer {
  const Renderer = itemRendererRegistry[item.type] as ItemRenderer | undefined;
  // Default to SolidRenderer if unknown type to avoid runtime crash.
  return Renderer ?? SolidRenderer;
}

