// Audio analysis: BPM detection (energy-flux autocorrelation), first-beat
// offset, musical key estimation (chromagram + Krumhansl-Schmuckler), loudness.

import { magnitudeSpectrum } from "./fft";

export interface KeyEstimate {
  /** 0 = C, 1 = C#, ... 11 = B */
  root: number;
  mode: "major" | "minor";
  /** 0..1 confidence */
  confidence: number;
}

export interface TrackAnalysis {
  bpm: number;
  bpmConfidence: number;
  /** seconds of first strong beat */
  firstBeat: number;
  key: KeyEstimate;
  /** RMS loudness 0..1 */
  loudness: number;
  duration: number;
  /** downsampled peak waveform for display, values 0..1 */
  waveform: Float32Array;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function keyName(k: KeyEstimate): string {
  return `${NOTE_NAMES[k.root]} ${k.mode}`;
}

/** Mix an AudioBuffer down to mono Float32Array. */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / Math.max(1, buffer.numberOfChannels);
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

/** Peak waveform for display. */
export function computeWaveform(mono: Float32Array, buckets = 800): Float32Array {
  const out = new Float32Array(buckets);
  const per = Math.max(1, Math.floor(mono.length / buckets));
  for (let b = 0; b < buckets; b++) {
    const start = b * per;
    let peak = 0;
    for (let i = start; i < Math.min(start + per, mono.length); i++) {
      const v = Math.abs(mono[i]);
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }
  return out;
}

/**
 * BPM detection via spectral energy flux + autocorrelation.
 * Works on the mono signal; returns BPM in [60, 180].
 */
function detectTempo(mono: Float32Array, sampleRate: number): { bpm: number; confidence: number; firstBeat: number } {
  const hop = 512;
  const win = 1024;
  const frames = Math.floor((mono.length - win) / hop);
  if (frames < 64) return { bpm: 120, confidence: 0, firstBeat: 0 };

  // energy envelope
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let e = 0;
    for (let i = 0; i < win; i += 2) {
      const s = mono[off + i];
      e += s * s;
    }
    energy[f] = e;
  }
  // half-wave rectified flux
  const flux = new Float64Array(frames);
  for (let f = 1; f < frames; f++) {
    const d = energy[f] - energy[f - 1];
    flux[f] = d > 0 ? d : 0;
  }
  // normalize
  let mean = 0;
  for (let f = 0; f < frames; f++) mean += flux[f];
  mean /= frames;
  for (let f = 0; f < frames; f++) flux[f] -= mean;

  const fps = sampleRate / hop; // envelope frames per second
  const minLag = Math.floor((60 / 180) * fps); // 180 BPM
  const maxLag = Math.ceil((60 / 60) * fps); // 60 BPM

  let bestLag = minLag;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    let count = 0;
    for (let f = 0; f + lag < frames; f++) {
      score += flux[f] * flux[f + lag];
      count++;
    }
    score /= Math.max(1, count);
    // slight preference for common dance tempos 110-130
    const bpm = 60 / (lag / fps);
    const bias = bpm >= 110 && bpm <= 130 ? 1.06 : 1;
    score *= bias;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  let bpm = 60 / (bestLag / fps);
  // fold into a sane range
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  const confidence = bestScore > 0 ? Math.max(0, Math.min(1, 1 - secondScore / bestScore)) : 0;

  // first beat: first frame where flux exceeds 3x stddev-ish threshold
  let variance = 0;
  for (let f = 0; f < frames; f++) variance += flux[f] * flux[f];
  const std = Math.sqrt(variance / frames);
  let firstBeat = 0;
  for (let f = 0; f < frames; f++) {
    if (flux[f] > std * 1.5) {
      firstBeat = (f * hop) / sampleRate;
      break;
    }
  }
  return { bpm: Math.round(bpm * 10) / 10, confidence, firstBeat };
}

/** Krumhansl-Schmuckler key profiles. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function detectKey(mono: Float32Array, sampleRate: number): KeyEstimate {
  const N = 4096;
  const chroma = new Float64Array(12);
  const hann = new Float64Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));

  // sample frames across the middle 80% of the track
  const usable = Math.max(0, mono.length - N);
  const frameCount = Math.min(200, Math.floor(usable / N));
  if (frameCount < 4) return { root: 0, mode: "major", confidence: 0 };

  const frame = new Float32Array(N);
  const start = Math.floor(usable * 0.1);
  const step = Math.floor((usable * 0.8) / frameCount);

  for (let f = 0; f < frameCount; f++) {
    const off = start + f * step;
    for (let i = 0; i < N; i++) frame[i] = mono[off + i] * hann[i];
    const mag = magnitudeSpectrum(frame);
    for (let bin = 1; bin < mag.length; bin++) {
      const freq = (bin * sampleRate) / N;
      if (freq < 55 || freq > 4000) continue;
      // map to pitch class
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag[bin];
    }
  }

  const correlate = (profile: number[], shift: number): number => {
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    for (let i = 0; i < 12; i++) {
      const a = chroma[(i + shift) % 12];
      const b = profile[i];
      sumA += a; sumB += b; sumAB += a * b; sumA2 += a * a; sumB2 += b * b;
    }
    const num = 12 * sumAB - sumA * sumB;
    const den = Math.sqrt((12 * sumA2 - sumA * sumA) * (12 * sumB2 - sumB * sumB));
    return den === 0 ? 0 : num / den;
  };

  let best: { root: number; mode: "major" | "minor"; score: number } = { root: 0, mode: "major", score: -Infinity };
  let second = -Infinity;
  for (let root = 0; root < 12; root++) {
    const maj = correlate(MAJOR_PROFILE, root);
    if (maj > best.score) { second = best.score; best = { root, mode: "major", score: maj }; }
    else if (maj > second) second = maj;
    const min = correlate(MINOR_PROFILE, root);
    if (min > best.score) { second = best.score; best = { root, mode: "minor", score: min }; }
    else if (min > second) second = min;
  }
  const confidence = best.score > 0 ? Math.max(0, Math.min(1, (best.score - second) / Math.max(1e-9, best.score))) : 0;
  return { root: best.root, mode: best.mode, confidence };
}

/** Full analysis pipeline for one decoded track. */
export function analyzeTrack(buffer: AudioBuffer): TrackAnalysis {
  const mono = mixToMono(buffer);
  const tempo = detectTempo(mono, buffer.sampleRate);
  const key = detectKey(mono, buffer.sampleRate);
  let sum = 0;
  const stride = Math.max(1, Math.floor(mono.length / 200000));
  let count = 0;
  for (let i = 0; i < mono.length; i += stride) {
    sum += mono[i] * mono[i];
    count++;
  }
  const loudness = Math.sqrt(sum / Math.max(1, count));
  return {
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    firstBeat: tempo.firstBeat,
    key,
    loudness,
    duration: buffer.duration,
    waveform: computeWaveform(mono),
  };
}
