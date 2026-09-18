import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import WaveformCanvas from "@/components/WaveformCanvas";
import { keyName } from "@/audio/analysis";
import type { LoadedTrack } from "@/audio/engine";
import { Music2, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  slot: "A" | "B";
  track: LoadedTrack | null;
  accent: string;
  loading: boolean;
  onFile: (slot: "A" | "B", file: File) => void;
}

export default function TrackCard({ label, slot, track, accent, loading, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(slot, f);
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-2 transition-colors cursor-pointer bg-zinc-900/60",
        dragOver ? "border-cyan-400" : "border-zinc-800 hover:border-zinc-600",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{label}</span>
          {track ? (
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
              analyzed
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400">
              empty
            </Badge>
          )}
        </div>

        {!track && !loading && (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
            <Upload className="w-8 h-8 mb-3" />
            <p className="text-sm font-medium">Drop an MP3 here or click to browse</p>
            <p className="text-xs mt-1 text-zinc-600">MP3 · WAV · OGG · M4A · FLAC</p>
          </div>
        )}

        {loading && !track && (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
            <Loader2 className="w-8 h-8 mb-3 animate-spin" />
            <p className="text-sm">Decoding & analyzing…</p>
          </div>
        )}

        {track && (
          <div>
            <div className="flex items-center gap-2 mb-3 min-w-0">
              <Music2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
              <span className="text-sm font-semibold text-zinc-100 truncate">{track.name}</span>
            </div>
            <div className="h-16 mb-4 rounded bg-zinc-950/70 p-1">
              <WaveformCanvas waveform={track.analysis.waveform} color={accent} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-zinc-950/70 py-2">
                <div className="text-lg font-bold" style={{ color: accent }}>
                  {track.analysis.bpm.toFixed(1)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">BPM</div>
              </div>
              <div className="rounded bg-zinc-950/70 py-2">
                <div className="text-lg font-bold" style={{ color: accent }}>
                  {keyName(track.analysis.key)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Key</div>
              </div>
              <div className="rounded bg-zinc-950/70 py-2">
                <div className="text-lg font-bold" style={{ color: accent }}>
                  {Math.floor(track.analysis.duration / 60)}:{String(Math.floor(track.analysis.duration % 60)).padStart(2, "0")}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Length</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
