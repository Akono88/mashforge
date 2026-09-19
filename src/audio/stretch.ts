// WSOLA offline time-stretching and pitch shifting on AudioBuffers.
// Pure DSP on Float32Arrays so the mix can be rendered with sample accuracy.
//
// Terminology: `speed` is a SPEED ratio (target BPM / source BPM).
//   speed > 1 → faster → SHORTER output (outputLen = inputLen / speed)
//   speed < 1 → slower → LONGER output
//
// The stretcher is channel-locked: window positions are computed once from a
// mono reference and applied identically to every channel, so the stereo image
// never de-correlates.

export interface StretchMap {
  /** output position of each window */
  outPos: number[];
  /** input offset each window is taken from (WSOLA-aligned) */
  inOff: number[];
  /** window size in samples */
  win: number;
  /** exact output length in samples */
  outLen: number;
}

/**
 * Compute WSOLA window positions for `speed` on a mono reference signal.
 * Synthesis hop is fixed at win/2 (COLA with Hann). The analysis position
 * advances nominally by synHop*speed per frame; WSOLA search only picks the
 * extraction offset within ±maxShift of the nominal position, so global timing
 * never drifts.
 */
export function computeStretchMap(ref: Float32Array, speed: number, sampleRate: number): StretchMap {
  const outLen = Math.max(1, Math.round(ref.length / speed));
  if (Math.abs(speed - 1) < 0.001) {
    return { outPos: [0], inOff: [0], win: 0, outLen };
  }

  const win = Math.round((40 / 1000) * sampleRate) & ~1; // ~40 ms, even
  const synHop = win >> 1;
  const anaHop = synHop * speed;
  const maxShift = synHop >> 1;

  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / win));

  // Track the overlap region so the WSOLA search can match against what the
  // previous window actually left at [outPos, outPos+synHop).
  const outPos: number[] = [0];
  const inOff: number[] = [0];

  // incremental overlay of the reference, used ONLY for similarity matching
  const overlay = new Float32Array(outLen + win);
  for (let i = 0; i < win && i < ref.length; i++) overlay[i] += ref[i] * hann[i];

  let frame = 1;
  let nominal = anaHop;
  let out = synHop;
  while (out + win <= overlay.length && nominal + win < ref.length) {
    const center = Math.round(nominal);
    const from = Math.max(0, center - maxShift);
    const to = Math.min(ref.length - win, center + maxShift);
    let best = center;
    let bestCorr = -Infinity;
    // overlap region of the new window is [out, out+synHop) — the tail of the
    // previous window — matched against the candidate's first synHop samples
    for (let off = from; off <= to; off += 2) {
      let corr = 0;
      for (let i = 0; i < synHop; i += 2) {
        corr += overlay[out + i] * ref[off + i];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        best = off;
      }
    }
    outPos.push(out);
    inOff.push(best);
    for (let i = 0; i < win; i++) overlay[out + i] += ref[best + i] * hann[i];
    nominal += anaHop; // nominal timing — the search offset does NOT accumulate
    out += synHop;
    frame++;
  }
  void frame;
  return { outPos, inOff, win, outLen };
}

/** Apply a precomputed stretch map to one channel. */
export function applyStretchMap(input: Float32Array, map: StretchMap): Float32Array {
  if (map.win === 0) return input.slice(0, map.outLen);
  const { outPos, inOff, win, outLen } = map;
  const out = new Float32Array(outLen + win);
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / win));
  for (let f = 0; f < outPos.length; f++) {
    const o = outPos[f];
    const s = inOff[f];
    if (s + win > input.length) break;
    for (let i = 0; i < win; i++) out[o + i] += input[s + i] * hann[i];
  }
  const trimmed = out.slice(0, outLen);

  // Level preservation: restore original peak (COLA ≈ 1, edge effects drift it)
  const stride = Math.max(1, input.length >> 16);
  let inPeak = 0;
  for (let i = 0; i < input.length; i += stride) {
    const v = Math.abs(input[i]);
    if (v > inPeak) inPeak = v;
  }
  let outPeak = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const v = Math.abs(trimmed[i]);
    if (v > outPeak) outPeak = v;
  }
  if (outPeak > 1e-6 && inPeak > 1e-6) {
    const g = Math.min(2, Math.max(0.5, inPeak / outPeak));
    for (let i = 0; i < trimmed.length; i++) trimmed[i] *= g;
  }
  return trimmed;
}

/** Convenience: single-channel stretch (computes its own map). */
export function stretchChannel(input: Float32Array, speed: number, sampleRate: number): Float32Array {
  return applyStretchMap(input, computeStretchMap(input, speed, sampleRate));
}

/**
 * Resample by ratio for pitch shift. ratio > 1 = higher pitch (shorter output).
 * 4-point Catmull-Rom cubic interpolation — dramatically less aliasing than
 * linear interpolation on harmonic-rich music content.
 */
export function resampleChannel(input: Float32Array, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 0.0001) return input.slice();
  const n = input.length;
  const outLen = Math.max(1, Math.round(n / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const t = pos - idx;
    const i0 = Math.max(0, idx - 1);
    const i1 = Math.min(idx, n - 1);
    const i2 = Math.min(idx + 1, n - 1);
    const i3 = Math.min(idx + 2, n - 1);
    const p0 = input[i0], p1 = input[i1], p2 = input[i2], p3 = input[i3];
    const t2 = t * t;
    const t3 = t2 * t;
    out[i] = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }
  return out;
}

export interface ProcessedTrack {
  channels: Float32Array[];
  sampleRate: number;
  /** total semitone shift applied */
  semitones: number;
  /** speed ratio applied (target/source tempo) */
  speedRatio: number;
}

/**
 * Pitch-shift + tempo-match a full AudioBuffer.
 *
 * Pitch: resample by 2^(semitones/12) (duration shortens by that ratio).
 * Tempo: WSOLA with a single channel-locked map computed from the mono mix,
 * using the COMBINED speed so the final duration is input/speedRatio exactly.
 */
export function processTrack(
  buffer: AudioBuffer,
  speedRatio: number,
  semitones: number,
): ProcessedTrack {
  const sr = buffer.sampleRate;
  const pitchRatio = Math.pow(2, semitones / 12);
  // resampling by pitchRatio multiplies speed by pitchRatio; WSOLA must cover
  // the remaining speed so total speed = speedRatio
  const wsolaSpeed = speedRatio / pitchRatio;

  // mono reference AFTER pitch resample — the map is computed on what channels
  // will actually contain
  const refChannels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    let data: Float32Array = buffer.getChannelData(ch);
    if (Math.abs(pitchRatio - 1) > 0.0001) data = resampleChannel(data, pitchRatio);
    refChannels.push(data);
  }
  const mono = new Float32Array(refChannels[0].length);
  for (const c of refChannels) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / refChannels.length;

  const map = computeStretchMap(mono, wsolaSpeed, sr);
  const channels = refChannels.map((c) => applyStretchMap(c, map));

  return { channels, sampleRate: sr, semitones, speedRatio };
}
