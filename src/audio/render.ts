// The mix renderer: builds a DJ-style SEQUENTIAL mix from N processed tracks.
// Each track plays its segment; adjacent pairs overlap for a crafted
// transition (style + length per pair, keyed by the incoming track's stable
// ID). Handoffs are quantized to whole beats so every incoming track lands on
// the shared beat grid. Rendered offline with the Web Audio API.

import type { TransitionStyle } from "./genres";
import type { ProcessedTrack } from "./stretch";

export interface RenderItem {
  id: string;
  name: string;
  track: ProcessedTrack;
  /** 0..1.5 user gain */
  gain: number;
  /** seconds into the processed audio where playback starts (cue = first beat) */
  offset: number;
}

export interface RenderTransition {
  /** stable id of the incoming track */
  intoId: string;
  style: TransitionStyle;
  bars: number;
}

export interface RenderPlanEntry {
  id: string;
  name: string;
  startSec: number;
  seconds: number;
  /** effective transition bars into this track after budgeting */
  transBarsIn: number;
}

export interface RenderPlan {
  targetBpm: number;
  entries: RenderPlanEntry[];
  totalSeconds: number;
}

// ---------------------------------------------------------------------------
// Pure timeline math (unit-testable without Web Audio)
// ---------------------------------------------------------------------------

export const PRE_ROLL = 0.05;
export const TAIL = 0.3;
export const MIN_SOLO_BARS = 2;

export interface TimelineInput {
  /** usable seconds per track (after cue offset) */
  usableSec: number[];
  /** requested transition bars into track i (index 0 unused) */
  wantBarsIn: number[];
  beatSec: number;
}

export interface Timeline {
  ok: boolean;
  /** index of the track that cannot fit, when !ok */
  problemTrack?: number;
  /** seconds that track would need, when !ok */
  neededSec?: number;
  starts: number[];
  /** grid-quantized play length (whole beats) per track */
  playedSec: number[];
  /** effective transition bars into each track after joint budgeting */
  effBarsIn: number[];
  fadeStart: number;
  totalSec: number;
}

export function computeTimeline(inp: TimelineInput): Timeline {
  const n = inp.usableSec.length;
  const barSec = inp.beatSec * 4;
  const beatsAvail = inp.usableSec.map((u) => Math.floor(u / inp.beatSec + 1e-6));

  // 1) budget both adjacent overlaps jointly per track
  const eff = inp.wantBarsIn.map((w, i) => (i === 0 ? 0 : Math.max(0, Math.floor(w))));
  for (let i = 0; i < n; i++) {
    const barsAvail = beatsAvail[i] / 4 - MIN_SOLO_BARS;
    const need = () => (i > 0 ? eff[i] : 0) + (i < n - 1 ? eff[i + 1] : 0);
    while (need() > Math.max(0, barsAvail) && need() > 0) {
      // shrink the larger adjacent transition first
      const inIdx = i > 0 ? i : -1;
      const outIdx = i < n - 1 ? i + 1 : -1;
      if (inIdx >= 0 && (outIdx < 0 || eff[inIdx] >= eff[outIdx]) && eff[inIdx] > 0) eff[inIdx]--;
      else if (outIdx >= 0 && eff[outIdx] > 0) eff[outIdx]--;
      else break;
    }
  }

  // 2) feasibility check
  for (let i = 0; i < n; i++) {
    const needBars = (i > 0 ? eff[i] : 0) + (i < n - 1 ? eff[i + 1] : 0) + MIN_SOLO_BARS;
    if (beatsAvail[i] < needBars * 4) {
      return {
        ok: false,
        problemTrack: i,
        neededSec: needBars * 4 * inp.beatSec,
        starts: [],
        playedSec: [],
        effBarsIn: eff,
        fadeStart: 0,
        totalSec: 0,
      };
    }
  }

  // 3) grid-aligned starts: every track covers a whole number of beats, so
  // each incoming cue lands exactly on the shared beat grid
  const playedSec = beatsAvail.map((b) => b * inp.beatSec);
  const starts: number[] = [PRE_ROLL];
  for (let i = 1; i < n; i++) {
    starts.push(starts[i - 1] + playedSec[i - 1] - eff[i] * barSec);
  }

  // 4) fade the LAST track while its real audio is still playing; the only
  // tail is the intentional limiter-release tail
  const lastAudioEnd = starts[n - 1] + playedSec[n - 1];
  const fadeStart = Math.max(starts[n - 1], lastAudioEnd - 1.5);
  return {
    ok: true,
    starts,
    playedSec,
    effBarsIn: eff,
    fadeStart,
    totalSec: lastAudioEnd + TAIL,
  };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function trackSeconds(t: ProcessedTrack): number {
  return Math.max(...t.channels.map((c) => c.length)) / t.sampleRate;
}

function peakOf(track: ProcessedTrack): number {
  let peak = 0;
  for (const data of track.channels) {
    const stride = Math.max(1, data.length >> 16);
    for (let i = 0; i < data.length; i += stride) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

/** Choose the semitone shift that lands `fromRoot` closest to `toRoot`. */
export function chooseKeyShift(fromRoot: number, toRoot: number): number {
  let d = (toRoot - fromRoot) % 12;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  if (Math.abs(d) > 3) {
    const fifth = (d + 5) % 12;
    const alt = fifth > 6 ? fifth - 12 : fifth;
    if (Math.abs(alt) < Math.abs(d)) return alt;
  }
  return d;
}

const XFADE_TIME = 0.03;

export async function renderMix(
  items: RenderItem[],
  transitions: RenderTransition[],
  targetBpm: number,
  onProgress?: (pct: number) => void,
): Promise<{ buffer: AudioBuffer; plan: RenderPlan }> {
  if (items.length === 0) throw new Error("No tracks to mix — add at least one track.");
  const sr = items[0].track.sampleRate;
  const beatSec = 60 / targetBpm;
  const barSec = beatSec * 4;

  const usable = items.map((it) => Math.max(0, trackSeconds(it.track) - it.offset));

  // transitions keyed by the incoming track's STABLE id (survives reorder)
  const byId = new Map(transitions.map((t) => [t.intoId, t]));
  const wantBarsIn = items.map((it, i) => (i === 0 ? 0 : (byId.get(it.id)?.bars ?? 8)));

  const tl = computeTimeline({ usableSec: usable, wantBarsIn, beatSec });
  if (!tl.ok) {
    const it = items[tl.problemTrack ?? 0];
    throw new Error(
      `"${it.name}" is too short after trimming (${usable[tl.problemTrack ?? 0].toFixed(1)}s usable, ` +
        `needs ~${Math.ceil(tl.neededSec ?? 0)}s at ${targetBpm.toFixed(0)} BPM). ` +
        `Extend its trim, shorten adjacent transitions, or remove it.`,
    );
  }

  const ctx = new OfflineAudioContext(2, Math.ceil(tl.totalSec * sr), sr);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);

  interface TrackNodes {
    gain: GainNode;
    lp: BiquadFilterNode;
    hp: BiquadFilterNode;
    echoSend: GainNode;
  }

  // exactly ONE source per track: wired, started at its cue, stopped at its
  // grid-quantized end
  const nodes: TrackNodes[] = items.map((it, i) => {
    const src = ctx.createBufferSource();
    const len = Math.max(...it.track.channels.map((c) => c.length));
    const buf = ctx.createBuffer(it.track.channels.length, len, sr);
    it.track.channels.forEach((data, ch) => {
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, ch, 0);
    });
    src.buffer = buf;

    const norm = ctx.createGain();
    const p = peakOf(it.track);
    norm.gain.value = (p > 1e-6 ? 0.85 / p : 1) * it.gain;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 20;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 19000;
    const gain = ctx.createGain();
    gain.gain.value = i === 0 ? 1 : 0;

    const echoSend = ctx.createGain();
    echoSend.gain.value = 0;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = beatSec * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoLevel = ctx.createGain();
    echoLevel.gain.value = 0.5;

    src.connect(norm).connect(hp).connect(lp).connect(gain);
    gain.connect(limiter);
    gain.connect(echoSend).connect(delay).connect(echoLevel).connect(limiter);
    delay.connect(feedback).connect(delay);

    const startAt = tl.starts[i];
    src.start(startAt, it.offset);
    src.stop(Math.min(startAt + tl.playedSec[i] + 0.05, tl.totalSec));

    return { gain, lp, hp, echoSend };
  });

  // per-pair transition automation
  for (let i = 1; i < items.length; i++) {
    const style = byId.get(items[i].id)?.style ?? "loop-xfade";
    const bars = tl.effBarsIn[i];
    const outN = nodes[i - 1];
    const inN = nodes[i];
    const tTrans = tl.starts[i];
    const tB = tTrans + bars * barSec;
    const prevEnd = tl.starts[i - 1] + tl.playedSec[i - 1];
    const midTrans = tTrans + Math.max(0.01, prevEnd - tTrans) / 2;

    if (bars <= 0) {
      outN.gain.gain.setValueAtTime(1, tTrans);
      outN.gain.gain.setValueAtTime(0, tTrans + 0.01);
      inN.gain.gain.setValueAtTime(1, tTrans + 0.01);
      continue;
    }

    switch (style) {
      case "filter-sweep": {
        inN.gain.gain.setTargetAtTime(0.5, tTrans, XFADE_TIME * 4);
        inN.hp.frequency.setValueAtTime(600, tTrans);
        inN.hp.frequency.linearRampToValueAtTime(30, midTrans);
        inN.lp.frequency.setValueAtTime(1200, tTrans);
        inN.lp.frequency.linearRampToValueAtTime(19000, midTrans);
        outN.lp.frequency.setValueAtTime(19000, tTrans);
        outN.lp.frequency.linearRampToValueAtTime(600, midTrans);
        outN.gain.gain.setValueAtTime(1, midTrans);
        outN.gain.gain.linearRampToValueAtTime(0, prevEnd);
        inN.gain.gain.setTargetAtTime(1, midTrans, XFADE_TIME * 4);
        break;
      }
      case "percussion-blend": {
        inN.hp.frequency.setValueAtTime(300, tTrans);
        inN.hp.frequency.linearRampToValueAtTime(30, midTrans);
        outN.gain.gain.setValueAtTime(1, tTrans);
        outN.gain.gain.linearRampToValueAtTime(0, prevEnd);
        inN.gain.gain.setValueAtTime(0, tTrans);
        inN.gain.gain.linearRampToValueAtTime(1, tB);
        outN.lp.frequency.setValueAtTime(19000, midTrans);
        outN.lp.frequency.linearRampToValueAtTime(3000, prevEnd);
        break;
      }
      case "echo-cut": {
        outN.gain.gain.setValueAtTime(1, tTrans);
        outN.gain.gain.setValueAtTime(0, tTrans + beatSec);
        outN.echoSend.gain.setValueAtTime(0.9, tTrans);
        outN.echoSend.gain.setTargetAtTime(0, tTrans + bars * barSec * 0.8, 0.2);
        inN.gain.gain.setValueAtTime(0, tTrans);
        inN.gain.gain.setValueAtTime(0, tTrans + beatSec * 2);
        inN.gain.gain.linearRampToValueAtTime(1, tTrans + beatSec * 2.5);
        break;
      }
      case "long-blend": {
        inN.gain.gain.setTargetAtTime(0.6, tTrans, XFADE_TIME * 4);
        outN.lp.frequency.setValueAtTime(19000, tTrans);
        outN.lp.frequency.exponentialRampToValueAtTime(400, prevEnd);
        inN.hp.frequency.setValueAtTime(500, tTrans);
        inN.hp.frequency.exponentialRampToValueAtTime(25, tB);
        inN.lp.frequency.setValueAtTime(2000, tTrans);
        inN.lp.frequency.exponentialRampToValueAtTime(19000, tB);
        outN.gain.gain.setValueAtTime(1, tTrans);
        outN.gain.gain.linearRampToValueAtTime(0, prevEnd);
        inN.gain.gain.setValueAtTime(0.6, midTrans);
        inN.gain.gain.linearRampToValueAtTime(1, tB);
        break;
      }
      case "loop-xfade":
      default: {
        outN.gain.gain.setValueAtTime(1, tTrans);
        outN.gain.gain.linearRampToValueAtTime(0, prevEnd);
        inN.gain.gain.setValueAtTime(0, tTrans);
        inN.gain.gain.linearRampToValueAtTime(1, tB);
        break;
      }
    }
  }

  // fade the last track while its audio is still playing
  const lastGain = nodes[items.length - 1].gain;
  lastGain.gain.setValueAtTime(1, tl.fadeStart);
  lastGain.gain.linearRampToValueAtTime(0.0001, tl.totalSec - TAIL + 0.001);

  onProgress?.(0.4);
  const rendered = await ctx.startRendering();
  onProgress?.(1);

  const plan: RenderPlan = {
    targetBpm,
    entries: items.map((it, i) => ({
      id: it.id,
      name: it.name,
      startSec: tl.starts[i],
      seconds: tl.playedSec[i],
      transBarsIn: tl.effBarsIn[i],
    })),
    totalSeconds: tl.totalSec,
  };
  return { buffer: rendered, plan };
}
