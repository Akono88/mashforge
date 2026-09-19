import { useCallback, useEffect, useRef } from "react";
import { MIX_PRESETS } from "@/audio/genres";
import { useProject } from "@/hooks/useProject";
import { supabaseEnabled } from "@/lib/supabase";
import Playlist from "@/components/Playlist";
import ResultDeck from "@/components/ResultDeck";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/format";
import {
  AudioWaveform,
  Cloud,
  CloudOff,
  FolderOpen,
  Sparkles,
  Wand2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "../App.css";

export default function Home() {
  const p = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = p.stage === "generating";

  // debug/testing handles (also used by automated end-to-end checks)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__mfResult = p.result ?? null;
    w.__mf = p;
  });

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) void p.addFiles(e.dataTransfer.files);
    },
    [p],
  );

  const canGenerate = p.included.length > 0 && !busy;

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
                <Cloud className="w-3 h-3" /> cloud save on
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 gap-1">
                <CloudOff className="w-3 h-3" /> local only
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* intro */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">
            Drop your tracks.{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Get a DJ mix.
            </span>
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm">
            MashForge detects BPM and key, beat-matches every song, and arranges them into one
            seamless mix — track by track, with crafted transitions — rendered entirely in your browser.
          </p>
        </div>

        {/* dropzone */}
        <div
          data-testid="dropzone"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-zinc-700 hover:border-cyan-400/60 bg-zinc-900/40 px-6 py-8 text-center cursor-pointer transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              if (e.target.files?.length) void p.addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <FolderOpen className="w-8 h-8 mx-auto mb-2 text-zinc-500" />
          <p className="text-sm font-semibold">Drop audio files here, or click to browse</p>
          <p className="text-xs text-zinc-500 mt-1">
            Add as many tracks as you like — MP3, WAV, OGG… each at least ~6 seconds
          </p>
        </div>

        {/* mode tabs */}
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 w-fit mx-auto" data-testid="mode-tabs">
          <button
            data-testid="mode-auto"
            onClick={() => p.setMode("auto")}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-bold transition-all",
              p.mode === "auto"
                ? "bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <Wand2 className="w-4 h-4" /> Auto Remix
          </button>
          <button
            data-testid="mode-manual"
            onClick={() => p.setMode("manual")}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-bold transition-all",
              p.mode === "manual"
                ? "bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <SlidersHorizontal className="w-4 h-4" /> Manual
          </button>
        </div>

        {/* playlist (both modes edit the same arrangement) */}
        {(p.playOrder.length > 0 || p.pending.length > 0) && (
          <Playlist
            mode={p.mode}
            playOrder={p.playOrder}
            pending={p.pending}
            transitions={p.arrangement.transitions}
            preset={p.preset}
            plan={p.result?.plan ?? null}
            busy={busy}
            onRemove={p.removeTrack}
            onRemovePending={p.removePending}
            onMove={p.moveTrack}
            onReplace={p.replaceTrack}
            onUpdate={p.updateTrack}
            onSetTransition={p.setTransition}
          />
        )}

        {p.error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300" data-testid="error-banner">
            {p.error}
          </div>
        )}

        {/* AUTO panel */}
        {p.mode === "auto" && (
          <Card className="bg-zinc-900/60 border-zinc-800" data-testid="auto-panel">
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                    Pick a mix style
                  </h3>
                  <p className="text-xs text-zinc-600">add tracks → pick a style → generate — that&apos;s it</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {MIX_PRESETS.map((g) => (
                    <button
                      key={g.id}
                      data-testid={`preset-${g.id}`}
                      onClick={() => p.selectPreset(g.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        p.presetId === g.id
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

              {/* proposed arrangement */}
              {p.included.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 space-y-2" data-testid="auto-proposal">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs uppercase tracking-wider text-zinc-500">Proposed mix</span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="keep-order" className="text-xs text-zinc-400">Keep my track order</Label>
                      <Switch
                        id="keep-order"
                        checked={p.arrangement.keepUserOrder}
                        onCheckedChange={p.setKeepUserOrder}
                        data-testid="keep-order"
                      />
                    </div>
                  </div>
                  <p className="text-sm">
                    <span className="text-zinc-300">{p.included.map((t) => t.fileName).join(" → ")}</span>
                  </p>
                  <p className="text-xs text-zinc-500 font-mono" data-testid="auto-estimate">
                    {p.preset.emoji} {p.preset.name} · {p.targetBpm.toFixed(1)} BPM · ≈ {formatTime(p.estimatedSeconds)}
                  </p>
                </div>
              )}

              {/* fine-tune (collapsed advanced controls) */}
              <FineTune p={p} />
            </CardContent>
          </Card>
        )}

        {/* MANUAL mode: same tempo/pitch controls + editing hint */}
        {p.mode === "manual" && p.playOrder.length > 0 && (
          <>
            <p className="text-center text-xs text-zinc-500" data-testid="manual-hint">
              Manual mode — expand a track to trim, set volume, mute or correct its BPM. Edit the transition
              strips between tracks. Everything here shapes the same mix Auto Remix creates.
            </p>
            <Card className="bg-zinc-900/60 border-zinc-800" data-testid="manual-panel">
              <CardContent className="p-6">
                <FineTune p={p} defaultOpen />
              </CardContent>
            </Card>
          </>
        )}

        {/* generate */}
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            disabled={!canGenerate}
            onClick={() => void p.generate()}
            data-testid="generate"
            className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-zinc-950 font-bold px-10 hover:opacity-90 disabled:opacity-30"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {busy ? "Forging…" : "Generate Mix"}
          </Button>
          {p.playOrder.length === 0 && p.pending.length === 0 && (
            <p className="text-xs text-zinc-600">Add at least one track to enable the forge</p>
          )}
          {busy && (
            <div className="w-full max-w-md space-y-2">
              <Progress value={p.progress * 100} className="h-2" />
              <p className="text-xs text-center text-zinc-400">{p.progressStage}</p>
            </div>
          )}
        </div>

        {/* result */}
        {p.result && (
          <ResultDeck
            result={p.result}
            stale={!p.isCurrentResult}
            saveState={p.saveState}
            cloudEnabled={supabaseEnabled}
            onRetrySave={() => void p.retrySave()}
            onReset={p.reset}
          />
        )}

        {/* how it works */}
        <div className="grid md:grid-cols-3 gap-4 pb-10">
          {[
            { icon: "🎯", title: "Analyze", text: "Energy-flux autocorrelation finds the BPM; a chromagram with Krumhansl-Schmuckler profiles finds the key of every track." },
            { icon: "🧬", title: "Match", text: "WSOLA time-stretching locks each track to the mix tempo without changing pitch — optional key-matching blends them harmonically." },
            { icon: "🎛️", title: "Arrange", text: "Tracks play one after another on a shared beat grid, glued by DJ-style transitions — filter sweeps, echo cuts, long blends." },
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

/** Advanced tempo/key controls — shared by Auto (collapsed) and Manual. */
function FineTune({ p, defaultOpen = false }: { p: ReturnType<typeof useProject>; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-950/40" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-zinc-400 hover:text-zinc-200 select-none">
        <span>Fine-tune (optional)</span>
        <span className="text-xs text-zinc-600 group-open:hidden">show</span>
        <span className="text-xs text-zinc-600 hidden group-open:inline">hide</span>
      </summary>
      <div className="grid md:grid-cols-2 gap-6 px-4 pb-4">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
          <div>
            <Label htmlFor="pitch-match" className="text-sm font-semibold">Pitch-match tracks</Label>
            <p className="text-xs text-zinc-500 mt-0.5">Shift every track toward the first track&apos;s key</p>
          </div>
          <Switch
            id="pitch-match"
            checked={p.arrangement.pitchMatch}
            onCheckedChange={p.setPitchMatch}
            data-testid="pitch-match"
          />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
          <div className="flex justify-between items-baseline mb-2">
            <Label className="text-sm font-semibold">Target BPM</Label>
            <span className="text-sm font-mono text-cyan-300" data-testid="target-bpm-val">{p.targetBpm.toFixed(1)}</span>
          </div>
          <Slider
            value={[p.targetBpm]}
            min={80}
            max={160}
            step={0.5}
            disabled={p.included.length === 0}
            data-testid="target-bpm"
            onValueChange={([v]) => p.setTargetBpm(v)}
          />
          <button
            className="text-[11px] text-zinc-500 hover:text-zinc-300 mt-1"
            onClick={() => p.setTargetBpm(null)}
            data-testid="target-bpm-reset"
          >
            reset to auto (median of tracks)
          </button>
        </div>
      </div>
    </details>
  );
}
