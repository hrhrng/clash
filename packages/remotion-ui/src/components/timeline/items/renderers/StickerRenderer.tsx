import React from 'react';
import type { Item } from '@remotion-fast/core';
import type { ItemRenderProps } from '../registry';
import { colors } from '../../styles';

// Placeholder for future sticker support (webp animations, image sequences)
// This keeps the integration point stable so adding sticker is incremental.
export const StickerRenderer: React.FC<ItemRenderProps> = ({ width, height }) => {
  return (
    <div style={{ width, height, background: colors.bg.primary, color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Sticker (coming soon)
    </div>
  );
};

