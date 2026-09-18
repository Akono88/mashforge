// High-level orchestration: decode → analyze → process → render.

import { analyzeTrack, keyName, type TrackAnalysis } from "./analysis";
import { GENRES, type GenrePreset } from "./genres";
import { chooseKeyShift, renderMashup, type MashupPlan } from "./render";
import { processTrack } from "./stretch";
import { encodeWav } from "./wav";

export interface LoadedTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
}

export interface MashupResult {
  buffer: AudioBuffer;
  wavBlob: Blob;
  plan: MashupPlan;
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

export async function loadTrack(file: File): Promise<LoadedTrack> {
  const buffer = await decodeFile(file);
  const analysis = analyzeTrack(buffer);
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ""),
    buffer,
    analysis,
  };
}

export interface MashupOptions {
  genreId: string;
  matchKey: boolean;
  /** manual BPM override; null = use track A */
  targetBpm: number | null;
}

export async function createMashup(
  trackA: LoadedTrack,
  trackB: LoadedTrack,
  options: MashupOptions,
  onProgress?: (stage: string, pct: number) => void,
): Promise<MashupResult> {
  const genre: GenrePreset = GENRES.find((g) => g.id === options.genreId) ?? GENRES[0];
  const targetBpm = options.targetBpm ?? trackA.analysis.bpm;

  onProgress?.("Time-stretching guest track", 0.1);
  await tick();

  const stretchB = targetBpm / trackB.analysis.bpm;
  const semisB = options.matchKey
    ? chooseKeyShift(trackA.analysis.key.root, trackB.analysis.key.root)
    : 0;

  const stretchA = targetBpm / trackA.analysis.bpm;
  const processedA = processTrack(trackA.buffer, stretchA, 0);
  onProgress?.("Pitch-matching to " + keyName(trackA.analysis.key), 0.35);
  await tick();
  const processedB = processTrack(trackB.buffer, stretchB, semisB);

  const totalBars = genre.sections.reduce((s, x) => s + x.bars, 0);
  const plan: MashupPlan = {
    genre,
    targetBpm,
    stretchFactorB: stretchB,
    semitonesB: semisB,
    totalBars,
    totalSeconds: totalBars * ((60 / targetBpm) * 4),
  };

  onProgress?.("Rendering the mashup", 0.55);
  const buffer = await renderMashup(processedA, processedB, plan, (p) =>
    onProgress?.("Rendering the mashup", 0.55 + p * 0.35),
  );

  onProgress?.("Encoding WAV", 0.92);
  await tick();
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const wavBlob = encodeWav(channels, buffer.sampleRate);

  const summary =
    `${genre.name} mashup @ ${plan.targetBpm.toFixed(1)} BPM · ` +
    `${trackB.name} stretched ${stretchB.toFixed(2)}×` +
    (semisB !== 0 ? `, pitched ${semisB > 0 ? "+" : ""}${semisB} semitones` : "") +
    ` · ${plan.totalBars} bars`;

  onProgress?.("Done", 1);
  return { buffer, wavBlob, plan, summary };
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
