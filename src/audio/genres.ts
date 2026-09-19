// Transition-style presets. A mix is a SEQUENCE: Track A plays, a crafted
// DJ transition blends them for a handful of bars, then Track B takes over.
// Never "both tracks full-length in parallel" — the transition IS the art.

export type TransitionStyle =
  | "filter-sweep" // long LP/HP swap + snare-build feel (electro)
  | "percussion-blend" // quick percussion-led crossfade (latin)
  | "echo-cut" // drop A with echo-out, slam B in (hip-hop)
  | "long-blend" // patient 16-bar house blend
  | "loop-xfade"; // seamless loopable handoff

export interface MixPreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  style: TransitionStyle;
  /** bars of pure A before the transition */
  leadBarsA: number;
  /** bars the transition spans */
  transitionBars: number;
  /** bars of pure B after the transition */
  leadBarsB: number;
  /** 0..1 how deep the EQ swap cuts A's lows during the handoff */
  eqSwapDepth: number;
  /** echo-out (dub delay) on the outgoing track */
  echoOut: boolean;
  /** brief vocal-over-beat overlay during the middle of the transition */
  overlayBars: number;
}

export const MIX_PRESETS: MixPreset[] = [
  {
    id: "electro",
    name: "Electro House",
    description: "Snare-build energy, filter sweep into the drop",
    emoji: "⚡",
    style: "filter-sweep",
    leadBarsA: 16,
    transitionBars: 12,
    leadBarsB: 16,
    eqSwapDepth: 0.8,
    echoOut: false,
    overlayBars: 4,
  },
  {
    id: "latin",
    name: "Latin Dance",
    description: "Percussion-led quick blend, call-and-response handoff",
    emoji: "💃",
    style: "percussion-blend",
    leadBarsA: 16,
    transitionBars: 8,
    leadBarsB: 16,
    eqSwapDepth: 0.5,
    echoOut: false,
    overlayBars: 2,
  },
  {
    id: "hiphop",
    name: "Hip-Hop Blend",
    description: "Echo-out cut — the beat drops, the next one slams in",
    emoji: "🎤",
    style: "echo-cut",
    leadBarsA: 16,
    transitionBars: 6,
    leadBarsB: 16,
    eqSwapDepth: 0.3,
    echoOut: true,
    overlayBars: 2,
  },
  {
    id: "house",
    name: "Deep House",
    description: "Long hypnotic 16-bar blend, bassline swap",
    emoji: "🌊",
    style: "long-blend",
    leadBarsA: 16,
    transitionBars: 16,
    leadBarsB: 16,
    eqSwapDepth: 0.9,
    echoOut: false,
    overlayBars: 8,
  },
  {
    id: "loop",
    name: "Loop Blend",
    description: "Seamless loopable handoff — DJ tool ready",
    emoji: "🔁",
    style: "loop-xfade",
    leadBarsA: 8,
    transitionBars: 8,
    leadBarsB: 8,
    eqSwapDepth: 0.6,
    echoOut: false,
    overlayBars: 4,
  },
];
