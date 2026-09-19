// High-level orchestration: decode → analyze → arrangement → render → WAV.
// The engine consumes the SAME arrangement the UI edits (Auto and Manual).

import { analyzeTrack, type TrackAnalysis } from "./analysis";
import { MIX_PRESETS, type MixPreset } from "./genres";
import {
  effectiveBpm,
  orderedTracks,
  trimLength,
  type Arrangement,
  type ProjectTrack,
} from "./model";
import {
  chooseKeyShift,
  computeTimeline,
  renderMix,
  type RenderItem,
  type RenderPlan,
  type RenderTransition,
} from "./render";
import { processTrack } from "./stretch";
import { encodeWav } from "./wav";

export interface LoadedTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
}

export interface MixResult {
  buffer: AudioBuffer;
  wavBlob: Blob;
  plan: RenderPlan;
  summary: string;
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

/** Decode + analyze one file, and build its ProjectTrack with full trims. */
export async function importTrack(file: File): Promise<ProjectTrack> {
  const buffer = await decodeFile(file);
  if (buffer.duration < 6) {
    throw new Error(`"${file.name}" is only ${buffer.duration.toFixed(1)}s — mixes need at least ~6s of music per track.`);
  }
  const analysis = analyzeTrack(buffer);
  return {
    id: crypto.randomUUID(),
    rev: crypto.randomUUID(),
    fileName: file.name.replace(/\.[^.]+$/, ""),
    buffer,
    analysis,
    trimStart: 0,
    trimEnd: buffer.duration,
    gain: 1,
    muted: false,
    bpmOverride: null,
  };
}

/** Median BPM of the included tracks — the Auto target tempo. */
export function autoTargetBpm(tracks: ProjectTrack[]): number {
  const bpms = tracks.map(effectiveBpm).sort((a, b) => a - b);
  if (!bpms.length) return 120;
  return Math.round(bpms[Math.floor(bpms.length / 2)] * 10) / 10;
}

/**
 * Seconds from trimStart to the first beat that survives the trim.
 * When trimStart moves past analysis.firstBeat, the beat grid continues at
 * effective-BPM intervals — the cue is the NEXT beat at/after trimStart,
 * so the rendered audio still starts on a beat (preserves beat phase).
 */
export function cueOffset(t: ProjectTrack): number {
  const fb = t.analysis.firstBeat;
  if (t.trimStart <= fb) return fb - t.trimStart;
  const beat = 60 / effectiveBpm(t);
  const k = Math.ceil((t.trimStart - fb) / beat - 1e-9);
  return fb + k * beat - t.trimStart;
}

/** Estimated total mix duration without rendering (for the Auto proposal). */
export function estimateDuration(
  tracks: ProjectTrack[],
  transitions: RenderTransition[],
  targetBpm: number,
): number {
  const beatSec = 60 / targetBpm;
  const usable = tracks.map((t) => {
    const speed = targetBpm / effectiveBpm(t);
    return Math.max(0, (trimLength(t) - cueOffset(t)) / speed);
  });
  const tl = computeTimeline({
    usableSec: usable,
    wantBarsIn: tracks.map((t, i) => (i === 0 ? 0 : (transitions.find((x) => x.intoId === t.id)?.bars ?? 8))),
    beatSec,
  });
  return tl.ok ? tl.totalSec : 0;
}

function sliceChannels(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const s = Math.max(0, Math.floor(startSec * sr));
  const e = Math.min(buffer.length, Math.ceil(endSec * sr));
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: Math.max(1, e - s), sampleRate: sr });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).slice(s, e) as Float32Array<ArrayBuffer>, ch);
  }
  return out;
}

export interface CreateMixOptions {
  arrangement: Arrangement;
  /** default transition style+bars for pairs without explicit settings (Auto) */
  presetId: string;
}

export async function createMix(
  options: CreateMixOptions,
  onProgress?: (stage: string, pct: number) => void,
): Promise<MixResult> {
  const { arrangement } = options;
  const preset: MixPreset = MIX_PRESETS.find((g) => g.id === options.presetId) ?? MIX_PRESETS[0];

  const included = orderedTracks(arrangement).filter((t) => !t.muted);
  if (included.length === 0) throw new Error("Every track is muted — unmute at least one to mix.");

  const targetBpm = arrangement.targetBpm ?? autoTargetBpm(included);
  const beatSec = 60 / targetBpm;

  // transitions: explicit per-pair settings win; preset style is the default
  const transitions: RenderTransition[] = included.slice(1).map((t) => {
    const explicit = arrangement.transitions[t.id];
    return {
      intoId: t.id,
      style: explicit?.style ?? preset.style,
      bars: explicit?.bars ?? preset.transitionBars,
    };
  });

  // ---- cheap feasibility check BEFORE any heavy DSP ----
  const speedOf = (t: ProjectTrack) => targetBpm / effectiveBpm(t);
  const usableEst = included.map((t) => Math.max(0, (trimLength(t) - cueOffset(t)) / speedOf(t)));
  const tlCheck = computeTimeline({
    usableSec: usableEst,
    wantBarsIn: [0, ...transitions.map((x) => x.bars)], // N entries; index 0 unused
    beatSec,
  });
  if (!tlCheck.ok) {
    const t = included[tlCheck.problemTrack ?? 0];
    throw new Error(
      `"${t.fileName}" is too short after trimming (${usableEst[tlCheck.problemTrack ?? 0].toFixed(1)}s usable, ` +
        `needs ~${Math.ceil(tlCheck.neededSec ?? 0)}s at ${targetBpm.toFixed(0)} BPM). ` +
        `Extend its trim, shorten adjacent transitions, or remove it.`,
    );
  }

  // ---- process tracks (pitch + tempo), then render ----
  const rootKey = included[0].analysis.key.root;
  const items: RenderItem[] = [];
  for (let i = 0; i < included.length; i++) {
    const t = included[i];
    onProgress?.(`Processing ${t.fileName}`, 0.05 + (0.55 * i) / included.length);
    await tick();
    const speed = speedOf(t);
    const semis = arrangement.pitchMatch && i > 0 ? chooseKeyShift(t.analysis.key.root, rootKey) : 0;
    const trimmed = sliceChannels(t.buffer, t.trimStart, t.trimEnd);
    const processed = processTrack(trimmed, speed, semis);
    items.push({
      id: t.id,
      name: t.fileName,
      track: processed,
      gain: t.gain,
      offset: cueOffset(t) / speed,
    });
  }

  onProgress?.("Mixing transitions", 0.65);
  const { buffer, plan } = await renderMix(items, transitions, targetBpm, (p) =>
    onProgress?.("Mixing transitions", 0.65 + p * 0.25),
  );

  onProgress?.("Encoding WAV", 0.93);
  await tick();
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const wavBlob = encodeWav(channels, buffer.sampleRate);

  const names = included.map((t) => t.fileName).join(" → ");
  const summary =
    `${preset.name} mix @ ${plan.targetBpm.toFixed(1)} BPM · ${names} · ` +
    `${included.length} tracks · ${formatSeconds(plan.totalSeconds)}`;

  onProgress?.("Done", 1);
  return { buffer, wavBlob, plan, summary };
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
