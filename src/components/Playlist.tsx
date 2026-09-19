import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectTrack, TransitionSetting } from "@/audio/model";
import { effectiveBpm, trimLength } from "@/audio/model";
import type { MixPreset, TransitionStyle } from "@/audio/genres";
import type { RenderPlan } from "@/audio/render";
import { computeWaveform, keyName, mixToMono } from "@/audio/analysis";
import type { TrackView } from "@/hooks/useProject";
import { useAudioBufferPlayer } from "@/hooks/useAudioBufferPlayer";
import WaveformCanvas from "@/components/WaveformCanvas";
import PlayerBar from "@/components/PlayerBar";
import { formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Replace,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TRANSITION_STYLES: { id: TransitionStyle; name: string }[] = [
  { id: "filter-sweep", name: "Filter Sweep" },
  { id: "percussion-blend", name: "Percussion Blend" },
  { id: "echo-cut", name: "Echo Cut" },
  { id: "long-blend", name: "Long Blend" },
  { id: "loop-xfade", name: "Loop X-Fade" },
];

const ROW_COLORS = ["#22d3ee", "#e879f9", "#a3e635", "#fbbf24", "#f87171", "#818cf8"];

export interface PlaylistProps {
  mode: "auto" | "manual";
  playOrder: ProjectTrack[];
  pending: TrackView[];
  transitions: Record<string, TransitionSetting>;
  preset: MixPreset;
  plan: RenderPlan | null;
  busy: boolean;
  onRemove: (id: string) => void;
  onRemovePending: (pendingId: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReplace: (id: string, file: File) => void;
  onUpdate: (id: string, patch: Partial<ProjectTrack>) => void;
  onSetTransition: (intoId: string, patch: Partial<TransitionSetting>) => void;
}

function TrackWaveform({ track, color }: { track: ProjectTrack; color: string }) {
  const wf = useMemo(() => computeWaveform(mixToMono(track.buffer), 320), [track.buffer]);
  return <WaveformCanvas waveform={wf} color={color} />;
}

export default function Playlist(p: PlaylistProps) {
  const preview = useAudioBufferPlayer();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const togglePreview = useCallback(
    (t: ProjectTrack) => {
      if (previewId === t.id) {
        preview.toggle();
        return;
      }
      preview.load(t.buffer);
      setPreviewId(t.id);
      // start the audition at the trim start
      setTimeout(() => {
        preview.seek(t.trimStart);
        if (!preview.playing) preview.toggle();
      }, 0);
    },
    [preview, previewId],
  );

  const onReplaceFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const id = replaceTargetRef.current;
      if (file && id) p.onReplace(id, file);
      e.target.value = "";
    },
    [p],
  );

  return (
    <div data-testid="playlist" className="space-y-2">
      <input
        ref={replaceInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onReplaceFile}
        data-testid="replace-input"
      />

      {p.playOrder.map((t, i) => {
        const color = ROW_COLORS[i % ROW_COLORS.length];
        const expanded = p.mode === "manual" && expandedId === t.id;
        const isPreview = previewId === t.id;
        return (
          <div key={t.id}>
            {/* transition editor between this track and the previous one */}
            {p.mode === "manual" && i > 0 && (
              <TransitionRow
                prev={p.playOrder[i - 1]}
                next={t}
                setting={p.transitions[t.id]}
                preset={p.preset}
                plan={p.plan}
                busy={p.busy}
                onChange={(patch) => p.onSetTransition(t.id, patch)}
              />
            )}

            <div
              data-testid={`track-row-${i}`}
              className={cn(
                "rounded-lg border bg-zinc-900/60 px-4 py-3",
                t.muted ? "border-zinc-800 opacity-50" : "border-zinc-800",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-black text-zinc-950 shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate max-w-56">{t.fileName}</span>
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                      {effectiveBpm(t).toFixed(1)} BPM{t.bpmOverride != null ? " ✎" : ""}
                    </Badge>
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px]">
                      {keyName(t.analysis.key)}
                    </Badge>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {formatTime(trimLength(t))}
                    </span>
                  </div>
                  <div className="h-8 mt-1.5 rounded bg-zinc-950/70 px-1 py-0.5">
                    <TrackWaveform track={t} color={color} />
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-zinc-400 hover:text-cyan-300"
                    title="Preview source (from trim start)"
                    data-testid={`preview-${i}`}
                    onClick={() => togglePreview(t)}
                  >
                    {isPreview && preview.playing ? (
                      <span className="w-2.5 h-2.5 bg-cyan-300 rounded-sm" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  {p.mode === "manual" && (
                    <>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-zinc-500" disabled={p.busy || i === 0}
                        title="Move up" data-testid={`move-up-${i}`} onClick={() => p.onMove(t.id, -1)}>
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-zinc-500"
                        disabled={p.busy || i === p.playOrder.length - 1}
                        title="Move down" data-testid={`move-down-${i}`} onClick={() => p.onMove(t.id, 1)}>
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-zinc-500" disabled={p.busy}
                        title="Replace file" data-testid={`replace-${i}`}
                        onClick={() => { replaceTargetRef.current = t.id; replaceInputRef.current?.click(); }}>
                        <Replace className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-zinc-500"
                        title={expanded ? "Hide editor" : "Edit track"}
                        data-testid={`expand-${i}`}
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                      >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-zinc-500 hover:text-red-400"
                    disabled={p.busy} title="Remove track" data-testid={`remove-${i}`}
                    onClick={() => { if (isPreview) { preview.load(null); setPreviewId(null); } p.onRemove(t.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* manual editor */}
              {expanded && (
                <div className="mt-4 pt-4 border-t border-zinc-800 grid md:grid-cols-2 gap-x-8 gap-y-5" data-testid={`editor-${i}`}>
                  {/* trim */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <Label className="text-zinc-400">Start trim</Label>
                        <span className="font-mono text-cyan-300" data-testid={`trim-start-val-${i}`}>{t.trimStart.toFixed(1)}s</span>
                      </div>
                      <Slider
                        value={[t.trimStart]}
                        min={0}
                        max={t.buffer.duration}
                        step={0.1}
                        disabled={p.busy}
                        data-testid={`trim-start-${i}`}
                        onValueChange={([v]) =>
                          p.onUpdate(t.id, { trimStart: Math.min(v, t.trimEnd - 1) })
                        }
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <Label className="text-zinc-400">End trim</Label>
                        <span className="font-mono text-cyan-300" data-testid={`trim-end-val-${i}`}>{t.trimEnd.toFixed(1)}s</span>
                      </div>
                      <Slider
                        value={[t.trimEnd]}
                        min={0}
                        max={t.buffer.duration}
                        step={0.1}
                        disabled={p.busy}
                        data-testid={`trim-end-${i}`}
                        onValueChange={([v]) =>
                          p.onUpdate(t.id, { trimEnd: Math.max(v, t.trimStart + 1) })
                        }
                      />
                    </div>
                    {isPreview && (
                      <div className="pt-1">
                        <PlayerBar player={preview} small />
                      </div>
                    )}
                  </div>

                  {/* gain / mute / bpm */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <Label className="text-zinc-400">Volume</Label>
                        <span className="font-mono text-cyan-300" data-testid={`gain-val-${i}`}>{Math.round(t.gain * 100)}%</span>
                      </div>
                      <Slider
                        value={[t.gain]}
                        min={0}
                        max={1.5}
                        step={0.05}
                        disabled={p.busy}
                        data-testid={`gain-${i}`}
                        onValueChange={([v]) => p.onUpdate(t.id, { gain: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.muted}
                          disabled={p.busy}
                          data-testid={`mute-${i}`}
                          onCheckedChange={(v) => p.onUpdate(t.id, { muted: v })}
                        />
                        <Label className="text-xs text-zinc-400">Mute</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-zinc-400 whitespace-nowrap">
                          BPM <span className="text-zinc-600">(detected {t.analysis.bpm.toFixed(1)})</span>
                        </Label>
                        <Input
                          type="number"
                          min={40}
                          max={240}
                          step={0.5}
                          placeholder={t.analysis.bpm.toFixed(1)}
                          value={t.bpmOverride ?? ""}
                          disabled={p.busy}
                          data-testid={`bpm-override-${i}`}
                          className="w-20 h-8 bg-zinc-950 border-zinc-700 text-xs font-mono"
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            p.onUpdate(t.id, {
                              bpmOverride: Number.isFinite(v) && v >= 40 && v <= 240 ? v : null,
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* pending / failed uploads */}
      {p.pending.map((v) => (
        <div key={v.pendingId} className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-3 flex items-center gap-3">
          {v.status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin text-cyan-300 shrink-0" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{v.fileName}</div>
            {v.status === "error" && <div className="text-xs text-red-400">{v.error}</div>}
            {v.status === "loading" && <div className="text-xs text-zinc-500">decoding &amp; analyzing…</div>}
          </div>
          {v.status === "error" && (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-zinc-500" onClick={() => p.onRemovePending(v.pendingId)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function TransitionRow({
  prev,
  next,
  setting,
  preset,
  plan,
  busy,
  onChange,
}: {
  prev: ProjectTrack;
  next: ProjectTrack;
  setting: TransitionSetting | undefined;
  preset: MixPreset;
  plan: RenderPlan | null;
  busy: boolean;
  onChange: (patch: Partial<TransitionSetting>) => void;
}) {
  const style = setting?.style ?? preset.style;
  const bars = setting?.bars ?? preset.transitionBars;
  const effBars = plan?.entries.find((e) => e.id === next.id)?.transBarsIn;
  const clamped = effBars != null && effBars !== bars;

  return (
    <div className="flex items-center gap-3 px-4 py-2 mx-6 rounded-md border border-zinc-800/70 bg-zinc-950/50" data-testid={`transition-${next.id}`}>
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 whitespace-nowrap">
        {prev.fileName} → {next.fileName}
      </span>
      <Select value={style} disabled={busy} onValueChange={(v) => onChange({ style: v as TransitionStyle })}>
        <SelectTrigger className="h-7 w-36 bg-zinc-900 border-zinc-700 text-xs" data-testid={`transition-style-${next.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRANSITION_STYLES.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Slider
          value={[bars]}
          min={2}
          max={16}
          step={1}
          disabled={busy}
          className="flex-1"
          data-testid={`transition-bars-${next.id}`}
          onValueChange={([v]) => onChange({ bars: v })}
        />
        <span className="text-xs font-mono text-cyan-300 w-14 text-right whitespace-nowrap" data-testid={`transition-bars-val-${next.id}`}>
          {bars} bars
        </span>
      </div>
      {clamped && (
        <span className="text-[10px] text-amber-400 whitespace-nowrap" title="Shortened automatically because an adjacent track is too short">
          rendered {effBars}
        </span>
      )}
    </div>
  );
}
