import { useEffect, useMemo, useState } from "react";
import { GENRES } from "@/audio/genres";
import { useMashup } from "@/hooks/useMashup";
import { useAudioBufferPlayer } from "@/hooks/useAudioBufferPlayer";
import { supabaseEnabled } from "@/lib/supabase";
import TrackCard from "@/components/TrackCard";
import WaveformCanvas from "@/components/WaveformCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { computeWaveform, mixToMono } from "@/audio/analysis";
import {
  AudioWaveform,
  Cloud,
  CloudOff,
  Download,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "../App.css";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const {
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
  } = useMashup();

  const [genreId, setGenreId] = useState("electro");
  const [matchKey, setMatchKey] = useState(true);
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);

  // result playback (Web Audio — robust for large rendered buffers)
  const player = useAudioBufferPlayer();
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result.wavBlob) : null), [result]);
  const resultWaveform = useMemo(() => {
    if (!result) return null;
    return computeWaveform(mixToMono(result.buffer), 1200);
  }, [result]);

  useEffect(() => {
    player.load(result?.buffer ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const effectiveBpm = bpmOverride ?? trackA?.analysis.bpm ?? 120;
  const ready = trackA && trackB && stage !== "generating" && stage !== "loading";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-cyan-400 flex items-center justify-center">
              <AudioWaveform className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none">MashForge</h1>
              <p className="text-[11px] text-zinc-500">AI Music Mashup Studio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {supabaseEnabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                <Cloud className="w-3 h-3" /> Supabase sync
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 gap-1">
                <CloudOff className="w-3 h-3" /> local only
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* intro */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">
            Drop two tracks.{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Get a mashup.
            </span>
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm">
            MashForge analyzes BPM and musical key of both songs, time-stretches and pitch-matches
            the guest track, then arranges a full genre-structured mix — electro, latin dance,
            hip-hop, house — rendered entirely in your browser.
          </p>
        </div>

        {/* upload deck */}
        <div className="grid md:grid-cols-2 gap-4">
          <TrackCard
            label="Track A — Base"
            slot="A"
            track={trackA}
            accent="#22d3ee"
            loading={stage === "loading"}
            onFile={loadSlot}
          />
          <TrackCard
            label="Track B — Guest"
            slot="B"
            track={trackB}
            accent="#e879f9"
            loading={stage === "loading"}
            onFile={loadSlot}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* genre + controls */}
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">
                Genre preset
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGenreId(g.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      genreId === g.id
                        ? "border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(217,70,239,0.15)]"
                        : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-600",
                    )}
                  >
                    <div className="text-xl mb-1">{g.emoji}</div>
                    <div className="text-sm font-semibold">{g.name}</div>
                    <div className="text-[11px] text-zinc-500 leading-tight mt-1">{g.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <div>
                  <Label htmlFor="match-key" className="text-sm font-semibold">
                    Pitch-match guest track
                  </Label>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Shifts Track B into {trackA ? `the key of Track A` : "Track A's key"}
                  </p>
                </div>
                <Switch id="match-key" checked={matchKey} onCheckedChange={setMatchKey} />
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <div className="flex justify-between items-baseline mb-2">
                  <Label className="text-sm font-semibold">Target BPM</Label>
                  <span className="text-sm font-mono text-cyan-300">{effectiveBpm.toFixed(1)}</span>
                </div>
                <Slider
                  value={[effectiveBpm]}
                  min={80}
                  max={160}
                  step={0.5}
                  onValueChange={([v]) => setBpmOverride(v)}
                  disabled={!trackA}
                />
                <button
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 mt-1"
                  onClick={() => setBpmOverride(null)}
                >
                  reset to Track A tempo
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <Button
                size="lg"
                disabled={!ready}
                onClick={() => generate(genreId, matchKey, bpmOverride)}
                className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-zinc-950 font-bold px-10 hover:opacity-90 disabled:opacity-30"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {stage === "generating" ? "Forging…" : "Forge Mashup"}
              </Button>
              {!trackA || !trackB ? (
                <p className="text-xs text-zinc-600">Load both tracks to enable the forge</p>
              ) : null}

              {stage === "generating" && (
                <div className="w-full max-w-md space-y-2">
                  <Progress value={progress * 100} className="h-2" />
                  <p className="text-xs text-center text-zinc-400">{progressStage}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* result */}
        {result && resultUrl && (
          <Card className="bg-zinc-900/60 border-zinc-800 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-fuchsia-500 to-cyan-400" />
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-bold">Your mashup is ready 🔥</h3>
                  <p className="text-xs text-zinc-400">{result.summary}</p>
                </div>
                <div className="flex items-center gap-2">
                  {savedToCloud === true && (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                      saved to cloud
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={reset} className="border-zinc-700">
                    <RotateCcw className="w-4 h-4 mr-1" /> New session
                  </Button>
                  <a href={resultUrl} download={`mashforge-${result.plan.genre.id}-${result.plan.targetBpm.toFixed(0)}bpm.wav`}>
                    <Button size="sm" className="bg-cyan-500 text-zinc-950 font-semibold hover:bg-cyan-400">
                      <Download className="w-4 h-4 mr-1" /> Download WAV
                    </Button>
                  </a>
                </div>
              </div>

              <div className="h-24 rounded bg-zinc-950/70 p-2">
                <WaveformCanvas waveform={resultWaveform} color="#a3e635" />
              </div>

              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-zinc-700 rounded-full w-11 h-11 shrink-0"
                  onClick={player.toggle}
                >
                  {player.playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-100"
                      style={{ width: player.duration > 0 ? `${(player.position / player.duration) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-500 mt-1 font-mono">
                    <span>{formatTime(player.position)}</span>
                    <span>{formatTime(player.duration)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* how it works */}
        <div className="grid md:grid-cols-3 gap-4 pb-10">
          {[
            { icon: "🎯", title: "Analyze", text: "Energy-flux autocorrelation finds the BPM; a chromagram with Krumhansl-Schmuckler profiles finds the key." },
            { icon: "🧬", title: "Match", text: "WSOLA time-stretching locks the guest track to your target tempo without changing pitch — then shifts it into key." },
            { icon: "🎛️", title: "Arrange", text: "Genre presets build a real structure: intro, build, drop, breakdown — with sidechain pump, filters and crossfades." },
          ].map((f) => (
            <Card key={f.title} className="bg-zinc-900/40 border-zinc-800/70">
              <CardContent className="p-5">
                <div className="text-2xl mb-2">{f.icon}</div>
                <h4 className="font-bold text-sm mb-1">{f.title}</h4>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
