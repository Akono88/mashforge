// Genre presets: each defines the mashup arrangement, mixing moves, and vibe.

export interface ArrangementSection {
  name: string;
  /** length in bars (4 beats each) */
  bars: number;
  /** gain of base track (A) 0..1 */
  gainA: number;
  /** gain of guest track (B) 0..1 */
  gainB: number;
  /** sidechain pump depth on B against A's beat grid, 0 = off */
  pump: number;
  /** lowpass cutoff applied to B (Hz), null = full range */
  lowpassB: number | null;
  /** highpass cutoff applied to B (Hz), null = none */
  highpassB: number | null;
  /** lowpass cutoff applied to A (Hz) */
  lowpassA: number | null;
}

export interface GenrePreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** which track drives: 'A' keeps its tempo */
  sections: ArrangementSection[];
  /** crossfade seconds between sections */
  crossfade: number;
  /** master ducking of B under A transients */
  glue: number;
}

export const GENRES: GenrePreset[] = [
  {
    id: "electro",
    name: "Electro House",
    description: "Four-on-the-floor energy, big drops, sidechain pump",
    emoji: "⚡",
    crossfade: 0.5,
    glue: 0.25,
    sections: [
      { name: "Intro", bars: 8, gainA: 1, gainB: 0.35, pump: 0, lowpassB: 900, highpassB: null, lowpassA: null },
      { name: "Build", bars: 8, gainA: 1, gainB: 0.6, pump: 0.3, lowpassB: 2400, highpassB: 200, lowpassA: null },
      { name: "Drop", bars: 16, gainA: 0.95, gainB: 1, pump: 0.75, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Breakdown", bars: 8, gainA: 0.5, gainB: 0.85, pump: 0, lowpassB: 1200, highpassB: 300, lowpassA: 3000 },
      { name: "Drop 2", bars: 16, gainA: 1, gainB: 1, pump: 0.8, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Outro", bars: 8, gainA: 0.9, gainB: 0.3, pump: 0.2, lowpassB: 800, highpassB: null, lowpassA: null },
    ],
  },
  {
    id: "latin",
    name: "Latin Dance",
    description: "Dembow groove, call-and-response vocals, percussive",
    emoji: "💃",
    crossfade: 0.25,
    glue: 0.15,
    sections: [
      { name: "Intro", bars: 8, gainA: 1, gainB: 0.4, pump: 0, lowpassB: null, highpassB: 250, lowpassA: null },
      { name: "Verse", bars: 16, gainA: 0.9, gainB: 1, pump: 0.15, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Coro", bars: 16, gainA: 1, gainB: 1, pump: 0.35, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Percussion Break", bars: 8, gainA: 1, gainB: 0.25, pump: 0, lowpassB: 2000, highpassB: 400, lowpassA: null },
      { name: "Coro 2", bars: 16, gainA: 1, gainB: 1, pump: 0.35, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Outro", bars: 8, gainA: 0.8, gainB: 0.4, pump: 0, lowpassB: 1600, highpassB: 250, lowpassA: null },
    ],
  },
  {
    id: "hiphop",
    name: "Hip-Hop Blend",
    description: "Acapella-over-beat style, chopped and smooth",
    emoji: "🎤",
    crossfade: 0.15,
    glue: 0.4,
    sections: [
      { name: "Intro", bars: 4, gainA: 1, gainB: 0, pump: 0, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Verse 1", bars: 16, gainA: 0.85, gainB: 1, pump: 0, lowpassB: null, highpassB: 120, lowpassA: null },
      { name: "Hook", bars: 8, gainA: 1, gainB: 0.9, pump: 0.1, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Verse 2", bars: 16, gainA: 0.85, gainB: 1, pump: 0, lowpassB: null, highpassB: 120, lowpassA: null },
      { name: "Hook 2", bars: 8, gainA: 1, gainB: 0.9, pump: 0.1, lowpassB: null, highpassB: null, lowpassA: null },
      { name: "Outro", bars: 4, gainA: 0.7, gainB: 0.2, pump: 0, lowpassB: null, highpassB: null, lowpassA: 2500 },
    ],
  },
  {
    id: "house",
    name: "Deep House",
    description: "Hypnotic loops, warm low end, long blends",
    emoji: "🌊",
    crossfade: 1.5,
    glue: 0.2,
    sections: [
      { name: "Intro", bars: 16, gainA: 1, gainB: 0.25, pump: 0.2, lowpassB: 700, highpassB: null, lowpassA: null },
      { name: "Groove", bars: 16, gainA: 0.95, gainB: 0.9, pump: 0.4, lowpassB: 5000, highpassB: 100, lowpassA: null },
      { name: "Deep", bars: 16, gainA: 0.8, gainB: 1, pump: 0.5, lowpassB: 3500, highpassB: null, lowpassA: 8000 },
      { name: "Groove 2", bars: 16, gainA: 1, gainB: 0.9, pump: 0.4, lowpassB: 6000, highpassB: 80, lowpassA: null },
      { name: "Outro", bars: 16, gainA: 0.85, gainB: 0.2, pump: 0.2, lowpassB: 600, highpassB: null, lowpassA: null },
    ],
  },
  {
    id: "loop",
    name: "Loop Blend",
    description: "Seamless 16-bar loop of the two tracks, DJ-tool ready",
    emoji: "🔁",
    crossfade: 0,
    glue: 0.3,
    sections: [
      { name: "Loop", bars: 16, gainA: 1, gainB: 1, pump: 0.3, lowpassB: null, highpassB: null, lowpassA: null },
    ],
  },
];
