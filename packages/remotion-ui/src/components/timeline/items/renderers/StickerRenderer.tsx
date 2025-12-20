import React from 'react';
import type { ItemRenderProps } from '../registry';


// Placeholder for future sticker support (webp animations, image sequences)
// This keeps the integration point stable so adding sticker is incremental.
export const StickerRenderer: React.FC<ItemRenderProps> = ({ width, height }) => {
  return (
    <div style={{ width, height, background: 'transparent', color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Sticker (coming soon)
    </div>
  );
};
