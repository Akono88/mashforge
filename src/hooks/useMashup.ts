import { useCallback, useRef, useState } from "react";
import { createMashup, loadTrack, type LoadedTrack, type MashupResult } from "@/audio/engine";
import { saveMashupSession, supabaseEnabled } from "@/lib/supabase";

export type Stage = "idle" | "loading" | "ready" | "generating" | "done" | "error";

export function useMashup() {
  const [trackA, setTrackA] = useState<LoadedTrack | null>(null);
  const [trackB, setTrackB] = useState<LoadedTrack | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progressStage, setProgressStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<MashupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedToCloud, setSavedToCloud] = useState<boolean | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const loadSlot = useCallback(async (slot: "A" | "B", file: File) => {
    setError(null);
    setStage("loading");
    try {
      const track = await loadTrack(file);
      if (slot === "A") setTrackA(track);
      else setTrackB(track);
      setStage("ready");
    } catch (e) {
      setError(`Could not decode "${file.name}". Use MP3, WAV, or OGG.`);
      setStage("error");
    }
  }, []);

  const generate = useCallback(
    async (genreId: string, matchKey: boolean, targetBpm: number | null) => {
      if (!trackA || !trackB) return;
      setError(null);
      setStage("generating");
      setProgress(0);
      setSavedToCloud(null);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      try {
        const res = await createMashup(trackA, trackB, { genreId, matchKey, targetBpm }, (stage, pct) => {
          setProgressStage(stage);
          setProgress(pct);
        });
        setResult(res);
        setStage("done");
        if (supabaseEnabled) {
          const { ok } = await saveMashupSession({
            track_a_name: trackA.name,
            track_b_name: trackB.name,
            genre: res.plan.genre.name,
            target_bpm: res.plan.targetBpm,
            semitones_b: res.plan.semitonesB,
            stretch_b: res.plan.stretchFactorB,
            bars: res.plan.totalBars,
            summary: res.summary,
          });
          setSavedToCloud(ok);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Mashup generation failed");
        setStage("error");
      }
    },
    [trackA, trackB],
  );

  const reset = useCallback(() => {
    setTrackA(null);
    setTrackB(null);
    setResult(null);
    setStage("idle");
    setError(null);
    setProgress(0);
    setSavedToCloud(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
  }, []);

  return {
    trackA,
    trackB,
    stage,
    progressStage,
    progress,
    result,
    error,
    savedToCloud,
    loadSlot,
    generate,
    reset,
  };
}
