// Shared project/arrangement model. BOTH Auto and Manual modes edit this same
// structure; the engine consumes it verbatim for preview and WAV export.

import type { TransitionStyle } from "./genres";
import type { TrackAnalysis } from "./analysis";

export interface ProjectTrack {
  /** stable identity — survives reorder, mode switches, re-renders */
  id: string;
  /** immutable source revision — changes when the underlying file is replaced */
  rev: string;
  fileName: string;
  /** decoded source — never mutated; trims are applied on read */
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
  /** seconds into the source where this track's segment starts */
  trimStart: number;
  /** seconds into the source where this track's segment ends (exclusive) */
  trimEnd: number;
  /** 0..1.5 */
  gain: number;
  muted: boolean;
  /** user-corrected BPM; null = trust detection */
  bpmOverride: number | null;
}

/** Transition between track i and track i+1, keyed by the INCOMING track id. */
export interface TransitionSetting {
  style: TransitionStyle;
  bars: number;
}

export interface Arrangement {
  tracks: ProjectTrack[]; // array order = play order
  transitions: Record<string, TransitionSetting>;
  /** null = auto (median of track BPMs) */
  targetBpm: number | null;
  pitchMatch: boolean;
  /** true = keep upload order; false = use the proposed (key/tempo) order */
  keepUserOrder: boolean;
}

export function effectiveBpm(t: ProjectTrack): number {
  return t.bpmOverride ?? t.analysis.bpm;
}

export function trimLength(t: ProjectTrack): number {
  return Math.max(0, t.trimEnd - t.trimStart);
}

export function newArrangement(): Arrangement {
  return {
    tracks: [],
    transitions: {},
    targetBpm: null,
    pitchMatch: true,
    keepUserOrder: false,
  };
}

/**
 * Propose a play order from analysis: greedy nearest-neighbor over key
 * distance (with tempo as tie-break), starting from the first uploaded track.
 */
export function proposeOrder(tracks: ProjectTrack[]): ProjectTrack[] {
  if (tracks.length <= 2) return [...tracks];
  const remaining = [...tracks];
  const out = [remaining.shift()!];
  const keyDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % 12;
    return Math.min(d, 12 - d);
  };
  while (remaining.length) {
    const last = out[out.length - 1];
    let bestIdx = 0;
    let bestScore = Infinity;
    remaining.forEach((t, i) => {
      const score =
        keyDist(last.analysis.key.root, t.analysis.key.root) * 10 +
        (last.analysis.key.mode === t.analysis.key.mode ? 0 : 4) +
        Math.abs(effectiveBpm(last) - effectiveBpm(t)) / 20;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    out.push(remaining.splice(bestIdx, 1)[0]);
  }
  return out;
}

/** Tracks in play order according to arrangement settings. */
export function orderedTracks(a: Arrangement): ProjectTrack[] {
  return a.keepUserOrder ? [...a.tracks] : proposeOrder(a.tracks);
}
