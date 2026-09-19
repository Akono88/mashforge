// Node regression harness for the mix timeline math + cue offset.
// Compile: tsc the audio modules to commonjs, then run this file with node.

const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
};

const { computeTimeline, PRE_ROLL, TAIL } = require("./compiled/render.js");
const { cueOffset } = require("./compiled/engine.js");

const beat120 = 0.5; // 120 BPM
const bar120 = 2;

// --- scenario 1: three 24s tracks @120 BPM, wants 8/8 bars (spec fixture) ---
{
  const tl = computeTimeline({ usableSec: [24, 24, 24], wantBarsIn: [0, 8, 8], beatSec: beat120 });
  assert(tl.ok, "3x24s @120 fits after joint budgeting");
  assert(tl.effBarsIn[1] + tl.effBarsIn[2] <= 10, `middle overlaps jointly budgeted (got ${tl.effBarsIn})`);
  assert(tl.effBarsIn[1] === tl.effBarsIn[2], `shrink is symmetric (got ${tl.effBarsIn})`);
  // grid: every start lands on a whole beat relative to PRE_ROLL
  for (let i = 1; i < 3; i++) {
    const rel = tl.starts[i] - PRE_ROLL;
    assert(Math.abs(rel / beat120 - Math.round(rel / beat120)) < 1e-9, `start[${i}] on beat grid (${rel}s)`);
  }
  // total = sum(played) - overlaps + PRE_ROLL + TAIL
  const expect = PRE_ROLL + 24 * 3 - (tl.effBarsIn[1] + tl.effBarsIn[2]) * bar120 + TAIL;
  assert(Math.abs(tl.totalSec - expect) < 1e-9, `total ${tl.totalSec} == ${expect}`);
  // effective bars reported for UI
  assert(tl.effBarsIn[1] <= 8 && tl.effBarsIn[1] > 0, `eff bars into B sane (${tl.effBarsIn[1]})`);
}

// --- scenario 2: supervisor's 30.3s case — handoff must not drift off grid ---
{
  const tl = computeTimeline({ usableSec: [30.3, 30.3], wantBarsIn: [0, 8], beatSec: beat120 });
  assert(tl.ok, "30.3s pair fits");
  const handoff = tl.starts[1] - PRE_ROLL;
  assert(Math.abs(handoff / beat120 - Math.round(handoff / beat120)) < 1e-9, `handoff on grid (${handoff}s = ${handoff / beat120} beats)`);
  assert(Math.abs(handoff - 14) < 1e-9, `handoff at 14s exactly (got ${handoff})`);
}

// --- scenario 3: too-short middle track is rejected with the right track ---
{
  const tl = computeTimeline({ usableSec: [24, 3, 24], wantBarsIn: [0, 8, 8], beatSec: beat120 });
  assert(!tl.ok, "3s middle track rejected");
  assert(tl.problemTrack === 1, `problem track is the middle one (got ${tl.problemTrack})`);
  assert(Math.abs((tl.neededSec ?? 0) - 4) < 1e-9, `neededSec 4 (got ${tl.neededSec})`);
}

// --- scenario 4: short middle track fits after joint shrink (no false reject) ---
{
  const tl = computeTimeline({ usableSec: [24, 10, 24], wantBarsIn: [0, 8, 8], beatSec: beat120 });
  assert(tl.ok, `10s middle fits by shrinking both overlaps (eff ${tl.effBarsIn})`);
  assert(tl.effBarsIn[1] + tl.effBarsIn[2] <= 3, `joint budget ≤ 3 bars for 5-bar track (got ${tl.effBarsIn})`);
}

// --- scenario 5: final fade happens while real audio still plays ---
{
  const tl = computeTimeline({ usableSec: [24, 24], wantBarsIn: [0, 8], beatSec: beat120 });
  const lastEnd = tl.starts[1] + tl.playedSec[1];
  assert(tl.fadeStart < lastEnd - 1, `fade starts ${(lastEnd - tl.fadeStart).toFixed(2)}s before audio end`);
  assert(Math.abs(tl.totalSec - (lastEnd + TAIL)) < 1e-9, "tail is exactly TAIL after last audio");
}

// --- scenario 6: cueOffset preserves beat phase past firstBeat ---
{
  const mk = (firstBeat, bpm, trimStart, trimEnd = 24) => ({
    id: "x", fileName: "x", buffer: null,
    analysis: { firstBeat, bpm, key: { root: 0, mode: "major" } },
    trimStart, trimEnd, gain: 1, muted: false, bpmOverride: null,
  });
  // supervisor's example: 120 BPM, firstBeat 0.1, trimStart 0.2 → next beat at 0.6 → cue 0.4
  const c1 = cueOffset(mk(0.1, 120, 0.2));
  assert(Math.abs(c1 - 0.4) < 1e-9, `trim past firstBeat → next beat cue 0.4 (got ${c1})`);
  // trim lands exactly on a beat → cue 0
  const c2 = cueOffset(mk(0.1, 120, 0.6));
  assert(Math.abs(c2 - 0) < 1e-9, `trim on a beat → cue 0 (got ${c2})`);
  // trim before firstBeat → distance to firstBeat
  const c3 = cueOffset(mk(0.1, 120, 0.0));
  assert(Math.abs(c3 - 0.1) < 1e-9, `trim at 0 → cue = firstBeat (got ${c3})`);
  // bpmOverride changes the beat grid
  const t4 = mk(0.1, 120, 0.2); t4.bpmOverride = 60; // beats at 0.1, 1.1, ...
  const c4 = cueOffset(t4);
  assert(Math.abs(c4 - 0.9) < 1e-9, `bpmOverride respected in cue grid (got ${c4})`);
}

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
