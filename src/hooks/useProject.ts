import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoTargetBpm,
  createMix,
  estimateDuration,
  importTrack,
} from "@/audio/engine";
import { MIX_PRESETS } from "@/audio/genres";
import {
  newArrangement,
  orderedTracks,
  type Arrangement,
  type ProjectTrack,
  type TransitionSetting,
} from "@/audio/model";
import type { RenderPlan } from "@/audio/render";
import { saveMashupSession, supabaseEnabled } from "@/lib/supabase";

export type TrackStatus = "loading" | "ready" | "error";

export interface TrackView {
  track: ProjectTrack | null;
  /** set while a file is decoding or failed */
  pendingId: string;
  fileName: string;
  status: TrackStatus;
  error?: string;
}

export interface MixResultState {
  buffer: AudioBuffer;
  wavBlob: Blob;
  url: string;
  plan: RenderPlan;
  summary: string;
  /** preset name captured at render time (immutable metadata for save/display) */
  presetName: string;
  /** arrangement fingerprint this render belongs to */
  fingerprint: string;
}

export type Stage = "idle" | "generating" | "done" | "error";
export type SaveState = "idle" | "saving" | "saved" | "error";

function fingerprintOf(a: Arrangement, presetId: string): string {
  return JSON.stringify({
    presetId,
    targetBpm: a.targetBpm,
    pitchMatch: a.pitchMatch,
    keepUserOrder: a.keepUserOrder,
    tracks: a.tracks.map((t) => [
      t.id,
      t.rev,
      t.trimStart,
      t.trimEnd,
      t.gain,
      t.muted,
      t.bpmOverride,
    ]),
    transitions: a.transitions,
  });
}

export function useProject() {
  const [arrangement, setArrangement] = useState<Arrangement>(newArrangement);
  const [pending, setPending] = useState<TrackView[]>([]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [presetId, setPresetId] = useState("electro");
  const [stage, setStage] = useState<Stage>("idle");
  const [progressStage, setProgressStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MixResultState | null>(null);
  const [resultStale, setResultStale] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // session/request guards: async completions apply only when still current
  const sessionRef = useRef(0);
  const lastRenderRef = useRef(0);
  const resultUrlRef = useRef<string | null>(null);
  // live mirrors so async completions compare against the LATEST state
  const arrangementRef = useRef(arrangement);
  const presetIdRef = useRef(presetId);
  const resultRef = useRef<MixResultState | null>(null);
  useEffect(() => { arrangementRef.current = arrangement; }, [arrangement]);
  useEffect(() => { presetIdRef.current = presetId; }, [presetId]);
  useEffect(() => { resultRef.current = result; }, [result]);
  const replaceSeqRef = useRef(new Map<string, number>());

  /** any arrangement edit marks the existing render stale */
  const mutate = useCallback((fn: (a: Arrangement) => Arrangement) => {
    setArrangement((prev) => fn(prev));
    setResultStale((prev) => (result ? true : prev));
     
  }, [result]);

  // ---------------- file management ----------------

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const session = sessionRef.current;
    const list = [...files];
    for (const file of list) {
      const pendingId = crypto.randomUUID();
      const view: TrackView = { track: null, pendingId, fileName: file.name, status: "loading" };
      setPending((p) => [...p, view]);
      try {
        const track = await importTrack(file);
        if (sessionRef.current !== session) return; // session was reset mid-load
        setPending((p) => p.filter((v) => v.pendingId !== pendingId));
        setArrangement((a) => ({ ...a, tracks: [...a.tracks, track] }));
        setResultStale((s) => (result ? true : s));
      } catch (e) {
        if (sessionRef.current !== session) return;
        setPending((p) =>
          p.map((v) =>
            v.pendingId === pendingId
              ? { ...v, status: "error", error: e instanceof Error ? e.message : "Decode failed" }
              : v,
          ),
        );
      }
    }
     
  }, [result]);

  const removePending = useCallback((pendingId: string) => {
    setPending((p) => p.filter((v) => v.pendingId !== pendingId));
  }, []);

  const removeTrack = useCallback((id: string) => {
    mutate((a) => {
      const transitions = { ...a.transitions };
      delete transitions[id];
      return { ...a, tracks: a.tracks.filter((t) => t.id !== id), transitions };
    });
  }, [mutate]);

  const replaceTrack = useCallback(async (id: string, file: File) => {
    const session = sessionRef.current;
    const seq = (replaceSeqRef.current.get(id) ?? 0) + 1;
    replaceSeqRef.current.set(id, seq);
    try {
      const track = await importTrack(file);
      // ignore if reset happened or a newer replace for this track started
      if (sessionRef.current !== session || replaceSeqRef.current.get(id) !== seq) return;
      mutate((a) => ({
        ...a,
        tracks: a.tracks.map((t) =>
          t.id === id
            ? { ...track, id, rev: crypto.randomUUID(), gain: t.gain, muted: t.muted, bpmOverride: t.bpmOverride }
            : t,
        ),
      }));
    } catch (e) {
      if (sessionRef.current !== session || replaceSeqRef.current.get(id) !== seq) return;
      setError(e instanceof Error ? e.message : "Replace failed");
    }
  }, [mutate]);

  const moveTrack = useCallback((id: string, dir: -1 | 1) => {
    mutate((a) => {
      const idx = a.tracks.findIndex((t) => t.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= a.tracks.length) return a;
      const tracks = [...a.tracks];
      [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
      // manual reorder = user order
      return { ...a, tracks, keepUserOrder: true };
    });
  }, [mutate]);

  const updateTrack = useCallback((id: string, patch: Partial<ProjectTrack>) => {
    mutate((a) => ({
      ...a,
      tracks: a.tracks.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)),
    }));
  }, [mutate]);

  const setTransition = useCallback((intoId: string, patch: Partial<TransitionSetting>) => {
    mutate((a) => ({
      ...a,
      transitions: {
        ...a.transitions,
        [intoId]: {
          style: a.transitions[intoId]?.style ?? "loop-xfade",
          bars: a.transitions[intoId]?.bars ?? 8,
          ...patch,
        },
      },
    }));
  }, [mutate]);

  // ---------------- arrangement-level settings ----------------

  const setTargetBpm = useCallback((bpm: number | null) => {
    mutate((a) => ({ ...a, targetBpm: bpm }));
  }, [mutate]);

  const setPitchMatch = useCallback((v: boolean) => {
    mutate((a) => ({ ...a, pitchMatch: v }));
  }, [mutate]);

  const setKeepUserOrder = useCallback((v: boolean) => {
    mutate((a) => ({ ...a, keepUserOrder: v }));
  }, [mutate]);

  const selectPreset = useCallback((id: string) => {
    setPresetId(id);
    setResultStale((s) => (result ? true : s));
     
  }, [result]);

  // ---------------- derived views ----------------

  const playOrder = useMemo(() => orderedTracks(arrangement), [arrangement]);
  const included = useMemo(() => playOrder.filter((t) => !t.muted), [playOrder]);
  const targetBpm = arrangement.targetBpm ?? autoTargetBpm(included);
  const preset = MIX_PRESETS.find((p) => p.id === presetId) ?? MIX_PRESETS[0];

  const transitionsForEstimate = useMemo(
    () =>
      included.slice(1).map((t) => ({
        intoId: t.id,
        style: arrangement.transitions[t.id]?.style ?? preset.style,
        bars: arrangement.transitions[t.id]?.bars ?? preset.transitionBars,
      })),
    [included, arrangement.transitions, preset],
  );

  const estimatedSeconds = useMemo(
    () => (included.length ? estimateDuration(included, transitionsForEstimate, targetBpm) : 0),
    [included, transitionsForEstimate, targetBpm],
  );

  // ---------------- render ----------------

  const generate = useCallback(async () => {
    if (stage === "generating") return;
    const renderId = ++lastRenderRef.current;
    const session = sessionRef.current;
    setError(null);
    setStage("generating");
    setProgress(0);
    setSaveState("idle");
    const fingerprint = fingerprintOf(arrangement, presetId);
    const presetName = preset.name;
    const isLive = () => sessionRef.current === session && lastRenderRef.current === renderId;
    try {
      const res = await createMix({ arrangement, presetId }, (s, pct) => {
        if (!isLive()) return; // ignore progress from a superseded render
        setProgressStage(s);
        setProgress(pct);
      });
      if (!isLive()) return;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(res.wavBlob);
      resultUrlRef.current = url;
      setResult({ ...res, url, presetName, fingerprint });
      // edits made DURING the render make this result stale immediately
      setResultStale(fingerprintOf(arrangementRef.current, presetIdRef.current) !== fingerprint);
      setStage("done");
      if (supabaseEnabled) {
        setSaveState("saving");
        const { ok } = await saveMashupSession({
          track_a_name: res.plan.entries[0]?.name ?? "",
          track_b_name: res.plan.entries.map((e) => e.name).join(" → "),
          genre: presetName,
          target_bpm: res.plan.targetBpm,
          semitones_b: 0,
          stretch_b: 1,
          bars: 0,
          summary: res.summary,
        });
        if (isLive()) setSaveState(ok ? "saved" : "error");
      }
    } catch (e) {
      if (!isLive()) return;
      setError(e instanceof Error ? e.message : "Mix generation failed");
      setStage("error");
    }
  }, [arrangement, presetId, preset.name, stage]);

  const retrySave = useCallback(async () => {
    const res = resultRef.current;
    if (!res || !supabaseEnabled) return;
    const session = sessionRef.current;
    setSaveState("saving");
    const { ok } = await saveMashupSession({
      track_a_name: res.plan.entries[0]?.name ?? "",
      track_b_name: res.plan.entries.map((e) => e.name).join(" → "),
      genre: res.presetName, // immutable metadata from render time
      target_bpm: res.plan.targetBpm,
      semitones_b: 0,
      stretch_b: 1,
      bars: 0,
      summary: res.summary,
    });
    // apply only if the session and the result are still the ones we saved for
    if (sessionRef.current === session && resultRef.current === res) {
      setSaveState(ok ? "saved" : "error");
    }
  }, []);

  const reset = useCallback(() => {
    sessionRef.current++; // invalidate in-flight loads/renders
    replaceSeqRef.current.clear();
    setArrangement(newArrangement());
    setPending([]);
    setResult(null);
    setResultStale(false);
    setStage("idle");
    setError(null);
    setSaveState("idle");
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
  }, []);

  const isCurrentResult = result !== null && !resultStale && fingerprintOf(arrangement, presetId) === result.fingerprint;

  return {
    arrangement,
    pending,
    mode,
    setMode,
    presetId,
    selectPreset,
    preset,
    playOrder,
    included,
    targetBpm,
    estimatedSeconds,
    stage,
    progressStage,
    progress,
    error,
    result,
    resultStale,
    isCurrentResult,
    saveState,
    addFiles,
    removePending,
    removeTrack,
    replaceTrack,
    moveTrack,
    updateTrack,
    setTransition,
    setTargetBpm,
    setPitchMatch,
    setKeepUserOrder,
    generate,
    retrySave,
    reset,
  };
}
