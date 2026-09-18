// The mashup renderer: takes two processed tracks and a genre preset,
// and renders the arranged mix offline at sample accuracy.

import type { GenrePreset } from "./genres";
import type { ProcessedTrack } from "./stretch";

export interface MashupPlan {
  genre: GenrePreset;
  targetBpm: number;
  /** stretch factor applied to B to match A */
  stretchFactorB: number;
  /** semitones applied to B for key compatibility */
  semitonesB: number;
  totalBars: number;
  totalSeconds: number;
}

/** Choose the semitone shift for B that lands closest to A's key. */
export function chooseKeyShift(rootA: number, rootB: number): number {
  let d = (rootA - rootB) % 12;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  // prefer small shifts; perfect fifth/fourth are also safe if unshifted is far
  if (Math.abs(d) > 3) {
    const fifth = (d + 5) % 12;
    const alt = fifth > 6 ? fifth - 12 : fifth;
    if (Math.abs(alt) < Math.abs(d)) return alt;
  }
  return d;
}

/**
 * Render the mashup. Track A stays native; track B is already stretched +
 * pitch-shifted by the caller via processTrack().
 */
export async function renderMashup(
  a: ProcessedTrack,
  b: ProcessedTrack,
  plan: MashupPlan,
  onProgress?: (pct: number) => void,
): Promise<AudioBuffer> {
  const sr = a.sampleRate;
  const secondsPerBar = (60 / plan.targetBpm) * 4;

  let cursorSec = 0;
  interface Placed {
    startSec: number;
    section: (typeof plan.genre.sections)[number];
  }
  const placed: Placed[] = [];
  for (const section of plan.genre.sections) {
    placed.push({ startSec: cursorSec, section });
    cursorSec += section.bars * secondsPerBar;
  }
  const totalSec = cursorSec + 0.05;

  const ctx = new OfflineAudioContext(2, Math.ceil(totalSec * sr), sr);

  const makeSource = (track: ProcessedTrack): AudioBufferSourceNode => {
    const len = Math.max(...track.channels.map((c) => c.length));
    const buf = ctx.createBuffer(track.channels.length, len, sr);
    track.channels.forEach((data, ch) => {
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, ch, 0);
    });
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true; // tile under the whole arrangement
    return src;
  };

  const masterA = ctx.createGain();
  const masterB = ctx.createGain();
  const pumpGain = ctx.createGain();
  const filterA = ctx.createBiquadFilter();
  const filterB = ctx.createBiquadFilter();
  filterA.type = "lowpass";
  filterA.frequency.value = 19000;
  filterB.type = "lowpass";
  filterB.frequency.value = 19000;
  const hpB = ctx.createBiquadFilter();
  hpB.type = "highpass";
  hpB.frequency.value = 20;

  const srcA = makeSource(a);
  const srcB = makeSource(b);

  srcA.connect(filterA).connect(masterA).connect(ctx.destination);
  srcB.connect(filterB).connect(hpB).connect(pumpGain).connect(masterB).connect(ctx.destination);

  // Per-section gain/filter automation
  for (const { startSec, section } of placed) {
    const t = startSec;
    const end = startSec + section.bars * secondsPerBar;
    const cf = Math.min(plan.genre.crossfade, (end - t) / 2);

    masterA.gain.setTargetAtTime(section.gainA, t, Math.max(0.05, cf / 2));
    masterB.gain.setTargetAtTime(section.gainB, t, Math.max(0.05, cf / 2));

    if (section.lowpassA) filterA.frequency.setTargetAtTime(section.lowpassA, t, cf / 2 || 0.1);
    else filterA.frequency.setTargetAtTime(19000, t, cf / 2 || 0.1);

    if (section.lowpassB) filterB.frequency.setTargetAtTime(section.lowpassB, t, cf / 2 || 0.1);
    else filterB.frequency.setTargetAtTime(19000, t, cf / 2 || 0.1);

    if (section.highpassB) hpB.frequency.setTargetAtTime(section.highpassB, t, cf / 2 || 0.1);
    else hpB.frequency.setTargetAtTime(20, t, cf / 2 || 0.1);

    // Sidechain pump on B: duck on every beat of this section
    if (section.pump > 0) {
      const beatSec = secondsPerBar / 4;
      const depth = section.pump;
      for (let beat = 0; beat < section.bars * 4; beat++) {
        const bt = t + beat * beatSec;
        pumpGain.gain.setValueAtTime(1 - depth, bt);
        pumpGain.gain.linearRampToValueAtTime(1, bt + beatSec * 0.55);
      }
    }
  }

  // Glue: gentle overall level of B relative to A
  masterB.gain.value = 1 - plan.genre.glue * 0.3;

  // Fade out the very end
  const fadeStart = Math.max(0, totalSec - 2);
  masterA.gain.setValueAtTime(1, fadeStart);
  masterA.gain.linearRampToValueAtTime(0.0001, totalSec);

  srcA.start(0);
  srcB.start(0);
  srcA.stop(totalSec);
  srcB.stop(totalSec);

  onProgress?.(0.5);
  const rendered = await ctx.startRendering();
  onProgress?.(1);
  return rendered;
}
