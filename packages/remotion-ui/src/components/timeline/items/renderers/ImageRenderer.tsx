import React from 'react';
import type { Item, Asset, ImageItem } from '@remotion-fast/core';
import type { ItemRenderProps } from '../registry';
import { colors } from '../../styles';

export const ImageRenderer: React.FC<ItemRenderProps> = ({ item, asset, width, height }) => {
  const image = item as ImageItem;
  const src = asset?.thumbnail || image.src;
  return (
    <div style={{ position: 'relative', width, height, background: colors.bg.primary, overflow: 'hidden' }}>
      {src ? (
        <img src={src} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>Image</div>
      )}
    </div>
  );
};

