// WSOLA-inspired offline time-stretching and pitch shifting on AudioBuffers.
// Pure DSP on Float32Arrays so the mashup can be rendered with sample accuracy.

/**
 * Time-stretch a mono channel by `factor` (factor > 1 = slower/longer)
 * without changing pitch, using waveform-similarity overlap-add.
 */
export function stretchChannel(input: Float32Array, factor: number, sampleRate: number): Float32Array {
  if (Math.abs(factor - 1) < 0.001) return input.slice();

  const winMs = 28;
  const win = Math.round((winMs / 1000) * sampleRate) & ~1; // even
  const maxShift = win >> 1;

  const outLen = Math.round(input.length * factor);
  const out = new Float32Array(outLen + win * 2);

  const inHop = win >> 1;
  const outHop = Math.round(inHop * factor);

  // Hann window
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / win));

  let inPos = 0;
  let outPos = 0;
  // prime with first window
  for (let i = 0; i < win && i < input.length; i++) out[i] += input[i] * hann[i];
  inPos += inHop;
  outPos += outHop;

  while (inPos + win < input.length && outPos + win < out.length) {
    // WSOLA search: find offset around inPos whose waveform best matches the
    // tail of what we already wrote.
    const searchFrom = Math.max(0, inPos - maxShift);
    const searchTo = Math.min(input.length - win, inPos + maxShift);
    let bestOff = inPos;
    let bestCorr = -Infinity;
    const compareLen = Math.min(maxShift, win >> 1);
    for (let off = searchFrom; off <= searchTo; off += 4) {
      let corr = 0;
      for (let i = 0; i < compareLen; i += 2) {
        corr += out[outPos - outHop + i + outHop - compareLen] * input[off + i];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOff = off;
      }
    }
    for (let i = 0; i < win; i++) {
      out[outPos + i] += input[bestOff + i] * hann[i];
    }
    inPos = bestOff + inHop;
    outPos += outHop;
  }
  return out.slice(0, outLen);
}

/**
 * Resample by ratio for pitch shift. ratio > 1 = higher pitch (shorter output).
 * Linear interpolation is sufficient at small shifts (± few semitones).
 */
export function resampleChannel(input: Float32Array, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 0.0001) return input.slice();
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[Math.min(idx, input.length - 1)];
    const b = input[Math.min(idx + 1, input.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export interface ProcessedTrack {
  channels: Float32Array[];
  sampleRate: number;
  /** total semitone shift applied */
  semitones: number;
  /** time-stretch factor applied */
  stretchFactor: number;
}

/**
 * Stretch + pitch-shift a full AudioBuffer. Channel-locked: the stretch
 * positions are computed on the mono mix and reused per channel for coherence.
 */
export function processTrack(
  buffer: AudioBuffer,
  stretchFactor: number,
  semitones: number,
): ProcessedTrack {
  const sr = buffer.sampleRate;
  const channels: Float32Array[] = [];
  const pitchRatio = Math.pow(2, semitones / 12);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    let data: Float32Array = buffer.getChannelData(ch);
    if (Math.abs(pitchRatio - 1) > 0.0001) {
      // pitch shift = resample, then stretch back to compensate duration
      data = resampleChannel(data, pitchRatio);
    }
    const totalStretch = stretchFactor / pitchRatio;
    if (Math.abs(totalStretch - 1) > 0.001) {
      data = stretchChannel(data, totalStretch, sr);
    }
    channels.push(data);
  }
  return { channels, sampleRate: sr, semitones, stretchFactor };
}

/** Semitone distance between two keys (root numbers 0-11). */
export function semitoneDistance(fromRoot: number, toRoot: number): number {
  let d = (toRoot - fromRoot) % 12;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}
