import React from 'react';
import type { Item, Asset, AudioItem } from '@remotion-fast/core';
import type { ItemRenderProps } from '../registry';
import { colors } from '../../styles';

export const AudioRenderer: React.FC<ItemRenderProps> = ({ item, asset, width, height }) => {
  const audio = item as AudioItem;
  const waveform = asset?.waveform;

  return (
    <div style={{ position: 'relative', width, height, background: colors.bg.primary }}>
      {waveform ? (
        <Waveform waveform={waveform} width={width} height={height} />
      ) : (
        <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>
          Waveform loading...
        </div>
      )}
    </div>
  );
};

const Waveform: React.FC<{ waveform: number[]; width: number; height: number }> = ({ waveform, width, height }) => {
  const barCount = waveform.length;
  const barWidth = width / Math.max(1, barCount);
  return (
    <svg width={width} height={height} style={{ display: 'block' }} preserveAspectRatio="none">
      {waveform.map((peak, i) => {
        const h = Math.min(peak * height, height);
        const x = i * barWidth;
        return <rect key={i} x={x} y={height - h} width={Math.max(barWidth, 1)} height={h} fill="rgba(200,200,200,0.9)" />;
      })}
    </svg>
  );
};

