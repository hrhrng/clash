import type { Item, Track } from '@remotion-fast/core';
import { timeline as timelineStyles } from '../../timeline/styles';
import { calculateSnapForItemRange, getAllSnapTargets } from '../utils/snapCalculator';

export type InsertDecision = {
  insertIndex: number | null;
  willCreateNewTrack: boolean;
  targetTrackIdIfMove: string | null;
};

export type PreviewResult = {
  previewTrackId: string;
  previewFrame: number; // adjusted for overlap when moving into a track
  rawPreviewFrame: number; // before overlap push (used when creating new track)
  insertIndex: number | null;
  willCreateNewTrack: boolean;
  snapGuideFrame: number | null; // vertical guide line (only for item-edge snaps)
};

export type DropAction =
  | { type: 'create-track'; insertIndex: number; frame: number }
  | { type: 'move-to-track'; targetTrackId: string; frame: number }
  | { type: 'move-within-track'; targetTrackId: string; frame: number };

// Debug/inspection utility: compute the two trisection lines of the item and the nearest track boundary
export function computeVerticalLandmarks(
  itemTopY: number,
  itemHeightPx: number,
  trackHeight: number
) {
  const q1 = itemTopY + itemHeightPx / 3;
  const q2 = itemTopY + (2 * itemHeightPx) / 3;
  const center = itemTopY + itemHeightPx / 2;
  const nearestBoundaryIndex = Math.round(center / trackHeight);
  const nearestBoundary = nearestBoundaryIndex * trackHeight;
  return { q1, q2, nearestBoundary, nearestBoundaryIndex };
}

export function decideInsertIntent(
  tracks: Track[],
  srcTrackId: string,
  yInViewport: number,
  trackHeight: number,
  thresholdPx: number
): InsertDecision {
  if (tracks.length === 0) {
    return { insertIndex: 0, willCreateNewTrack: true, targetTrackIdIfMove: null };
  }

  const srcIndex = tracks.findIndex((t) => t.id === srcTrackId);
  const rawIdx = Math.floor(yInViewport / trackHeight);
  const clampedIdx = Math.max(0, Math.min(tracks.length - 1, rawIdx));
  const relY = yInViewport % trackHeight;
  let insertIndex: number | null = null;
  if (relY < thresholdPx) insertIndex = clampedIdx;
  else if (relY > trackHeight - thresholdPx) insertIndex = clampedIdx + 1;

  if (insertIndex === null) {
    return { insertIndex: null, willCreateNewTrack: false, targetTrackIdIfMove: null };
  }

  const atTop = insertIndex === 0;
  const atBottom = insertIndex === tracks.length;
  const isBetweenPrevAndSelf = srcIndex > 0 && insertIndex === srcIndex;
  const isBetweenSelfAndNext = srcIndex >= 0 && srcIndex < tracks.length - 1 && insertIndex === srcIndex + 1;

  // Adjacent boundaries → move, not create
  if (isBetweenPrevAndSelf) {
    return {
      insertIndex,
      willCreateNewTrack: false,
      targetTrackIdIfMove: tracks[srcIndex - 1].id,
    };
  }
  if (isBetweenSelfAndNext) {
    return {
      insertIndex,
      willCreateNewTrack: false,
      targetTrackIdIfMove: tracks[srcIndex + 1].id,
    };
  }

  // Top/bottom or non-adjacent → create track
  if (atTop || atBottom || insertIndex < srcIndex || insertIndex > srcIndex + 1) {
    return { insertIndex, willCreateNewTrack: true, targetTrackIdIfMove: null };
  }

  return { insertIndex: null, willCreateNewTrack: false, targetTrackIdIfMove: null };
}

export function preferItemEdgeSnap(
  rawFrom: number,
  duration: number,
  tracks: Track[],
  currentItemId: string,
  currentFrame: number,
  snapEnabled: boolean,
  thresholdFrames: number
): { from: number; guideFrame: number | null } {
  const base = calculateSnapForItemRange(
    rawFrom,
    duration,
    tracks,
    currentItemId,
    currentFrame,
    !!snapEnabled,
    thresholdFrames
  );
  if (!snapEnabled) {
    return { from: Math.max(0, base.snappedFrame), guideFrame: null };
  }

  const itemEdges = getAllSnapTargets(tracks, currentItemId).filter(
    (t) => t.type === 'item-start' || t.type === 'item-end'
  );
  const nearest = (frame: number) => {
    let best: { frame: number; dist: number } | null = null;
    for (const t of itemEdges) {
      const dist = Math.abs(t.frame - frame);
      if (dist <= thresholdFrames && (!best || dist < best.dist)) {
        best = { frame: t.frame, dist };
      }
    }
    return best;
  };

  const leftEdge = nearest(rawFrom);
  const rightEdge = nearest(rawFrom + duration);
  if (leftEdge || rightEdge) {
    if (leftEdge && rightEdge) {
      if (leftEdge.dist <= rightEdge.dist) {
        return { from: leftEdge.frame, guideFrame: leftEdge.frame };
      }
      return { from: rightEdge.frame - duration, guideFrame: rightEdge.frame };
    }
    if (leftEdge) return { from: leftEdge.frame, guideFrame: leftEdge.frame };
    if (rightEdge) return { from: rightEdge.frame - duration, guideFrame: rightEdge.frame };
  }

  if (base.didSnap && base.target && (base.target.type === 'item-start' || base.target.type === 'item-end')) {
    const guide = base.edge === 'right' ? base.snappedFrame + duration : base.snappedFrame;
    return { from: base.snappedFrame, guideFrame: guide };
  }
  return { from: Math.max(0, base.snappedFrame), guideFrame: null };
}

export function resolveNonOverlapInTrack(
  track: Track | undefined,
  startFrame: number,
  duration: number,
  currentItemId: string
): number {
  if (!track) return Math.max(0, startFrame);
  let start = Math.max(0, startFrame);
  let end = start + duration;
  let moved = true;
  while (moved) {
    moved = false;
    for (const it of track.items) {
      if (it.id === currentItemId) continue;
      const itStart = it.from;
      const itEnd = it.from + it.durationInFrames;
      if (end > itStart && start < itEnd) {
        start = itEnd;
        end = start + duration;
        moved = true;
      }
    }
  }
  return Math.max(0, start);
}

export function buildPreview(
  args: {
    leftWithinTracksPx: number;
    itemTopY: number; // Already adjusted with scrollTop in caller
    itemHeightPx: number;
    prevItemTopY?: number;
    pixelsPerFrame: number;
    tracks: Track[];
    item: Item;
    originalTrackId: string;
    currentFrame: number;
    snapEnabled: boolean;
    trackHeight: number;
    insertThresholdPx: number;
  }
): PreviewResult {
  const rawFrom = Math.max(0, Math.round(args.leftWithinTracksPx / args.pixelsPerFrame));
  const duration = args.item.durationInFrames;

  // 3-zone vertical decision
  const zoneH = Math.max(1, Math.floor(args.itemHeightPx / 3));
  const topZone: [number, number] = [args.itemTopY, args.itemTopY + zoneH];
  const midZone: [number, number] = [args.itemTopY + zoneH, args.itemTopY + 2 * zoneH];
  const botZone: [number, number] = [args.itemTopY + 2 * zoneH, args.itemTopY + args.itemHeightPx];
  const tol = Math.max(2, Math.round(args.trackHeight * 0.03));

  const srcIdx = Math.max(0, args.tracks.findIndex((t) => t.id === args.originalTrackId));
  const srcTop = srcIdx * args.trackHeight;
  const srcBottom = (srcIdx + 1) * args.trackHeight;

  const overlaps = (zone: [number, number], boundaryY: number) => {
    return !(zone[1] < boundaryY - tol || zone[0] > boundaryY + tol);
  };

  const topOverlapsSrcBottom = overlaps(topZone, srcBottom);
  const botOverlapsSrcTop = overlaps(botZone, srcTop);

  // First: explicit "between two boundaries" check using the item's visual top/bottom
  const itemTop = args.itemTopY;
  const itemBottom = args.itemTopY + args.itemHeightPx;
  const lowerIdx = Math.floor(itemTop / args.trackHeight);
  const lowerBoundary = lowerIdx * args.trackHeight;
  const upperBoundary = (lowerIdx + 1) * args.trackHeight;
  const overlapsLower = !(itemBottom < lowerBoundary - tol || itemTop > lowerBoundary + tol);
  const overlapsUpper = !(itemBottom < upperBoundary - tol || itemTop > upperBoundary + tol);
  const strictlyBetween = !overlapsLower && !overlapsUpper;

  // Extreme boundaries (topmost and bottommost). If there is any overlap with these,
  // always create a new track at that extreme as requested.
  const firstBoundary = 0;
  const lastBoundary = args.tracks.length * args.trackHeight;
  const overlapsTopExtreme = !(itemBottom < firstBoundary - tol || itemTop > firstBoundary + tol);
  const overlapsBottomExtreme = !(itemBottom < lastBoundary - tol || itemTop > lastBoundary + tol);

  // Scan middle zone for any boundary overlap and classify
  const kStart = Math.max(0, Math.floor((midZone[0] - tol) / args.trackHeight));
  const kEnd = Math.min(args.tracks.length, Math.ceil((midZone[1] + tol) / args.trackHeight));
  let midOverlapK: number | null = null;
  for (let k = kStart; k <= kEnd; k++) {
    const by = k * args.trackHeight;
    if (overlaps(midZone, by)) {
      midOverlapK = k;
      break;
    }
  }

  let willCreateNewTrack = false;
  let insertIndex: number | null = null;
  let previewTrackId = args.originalTrackId;

  // Case A0: overlap with extreme top/bottom boundary → always create at extreme
  if (overlapsTopExtreme) {
    willCreateNewTrack = true;
    insertIndex = 0;
  } else if (overlapsBottomExtreme) {
    willCreateNewTrack = true;
    insertIndex = args.tracks.length;
  }
  // Case A: item strictly between two adjacent boundaries → move into that band (track between those boundaries)
  else if (strictlyBetween) {
    // Use item vertical center to choose the band to avoid bias when itemTop is close to lower boundary
    const centerY = (itemTop + itemBottom) / 2;
    const bandIdx = Math.max(0, Math.min(args.tracks.length - 1, Math.floor(centerY / args.trackHeight)));
    previewTrackId = args.tracks[bandIdx]?.id || previewTrackId;
  }
  // Case B: no overlap with any relevant boundary -> same-track move
  else if (!topOverlapsSrcBottom && !botOverlapsSrcTop && midOverlapK == null) {
    // previewTrackId stays as original
  } else if (topOverlapsSrcBottom) {
    // Case C: overlap top zone with srcBottom -> move to next track (or create at bottom extreme)
    const targetIdx = srcIdx + 1;
    if (targetIdx < args.tracks.length) {
      previewTrackId = args.tracks[targetIdx]?.id || previewTrackId;
    } else {
      willCreateNewTrack = true;
      insertIndex = args.tracks.length;
    }
  } else if (botOverlapsSrcTop) {
    // Case D: overlap bottom zone with srcTop -> move to previous track (or create at top extreme)
    const targetIdx = srcIdx - 1;
    if (targetIdx >= 0) {
      previewTrackId = args.tracks[targetIdx]?.id || previewTrackId;
    } else {
      willCreateNewTrack = true;
      insertIndex = 0;
    }
  } else if (midOverlapK != null) {
    // Case E: middle zone overlap -> create based on position and source track item count
    const extreme = midOverlapK === 0 || midOverlapK === args.tracks.length;
    const nonAdjacent = midOverlapK < srcIdx || midOverlapK > srcIdx + 1;
    const isAdjacent = midOverlapK === srcIdx || midOverlapK === srcIdx + 1;
    const sourceTrack = args.tracks.find((t) => t.id === args.originalTrackId);
    const sourceHasMultipleItems = sourceTrack && sourceTrack.items.length > 1;

    // 如果是极端位置或非相邻位置，总是创建
    if (extreme || nonAdjacent) {
      willCreateNewTrack = true;
      insertIndex = midOverlapK;
    }
    // 如果是相邻位置，只有当源轨道有多个 item 时才创建
    else if (isAdjacent && sourceHasMultipleItems) {
      willCreateNewTrack = true;
      insertIndex = midOverlapK;
    }
    // 否则：相邻位置且只有一个 item → 不创建（保持在原轨道）
  }

  const snapPref = preferItemEdgeSnap(
    rawFrom,
    duration,
    args.tracks,
    args.item.id,
    args.currentFrame,
    args.snapEnabled,
    timelineStyles.snapThreshold
  );

  // Overlap push only when not creating a new track
  const adjustedFrom = !willCreateNewTrack
    ? resolveNonOverlapInTrack(args.tracks.find((t) => t.id === previewTrackId), snapPref.from, duration, args.item.id)
    : snapPref.from;

  const pushed = adjustedFrom !== snapPref.from;
  const snapGuideFrame = pushed ? null : snapPref.guideFrame;

  return {
    previewTrackId,
    previewFrame: adjustedFrom,
    rawPreviewFrame: snapPref.from,
    insertIndex: willCreateNewTrack ? insertIndex : null,
    willCreateNewTrack,
    snapGuideFrame,
  };
}

export function finalizeDrop(preview: PreviewResult, tracks: Track[], originalTrackId: string): DropAction {
  if (preview.willCreateNewTrack && preview.insertIndex != null) {
    return { type: 'create-track', insertIndex: preview.insertIndex, frame: Math.max(0, preview.rawPreviewFrame) };
  }

  if (preview.previewTrackId === originalTrackId) {
    return { type: 'move-within-track', targetTrackId: originalTrackId, frame: Math.max(0, preview.previewFrame) };
  }

  return { type: 'move-to-track', targetTrackId: preview.previewTrackId, frame: Math.max(0, preview.previewFrame) };
}
