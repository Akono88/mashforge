import { useEffect, useMemo } from "react";
import type { MixResultState, SaveState } from "@/hooks/useProject";
import { useAudioBufferPlayer } from "@/hooks/useAudioBufferPlayer";
import { computeWaveform, mixToMono } from "@/audio/analysis";
import WaveformCanvas from "@/components/WaveformCanvas";
import PlayerBar from "@/components/PlayerBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Cloud, Download, Loader2, RotateCcw } from "lucide-react";

interface Props {
  result: MixResultState;
  stale: boolean;
  saveState: SaveState;
  cloudEnabled: boolean;
  onRetrySave: () => void;
  onReset: () => void;
}

export default function ResultDeck({ result, stale, saveState, cloudEnabled, onRetrySave, onReset }: Props) {
  const player = useAudioBufferPlayer();

  useEffect(() => {
    player.load(result.buffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const waveform = useMemo(() => computeWaveform(mixToMono(result.buffer), 1200), [result]);

  const fileName = `mashforge-${result.plan.targetBpm.toFixed(0)}bpm-${result.plan.entries.length}tracks.wav`;

  return (
    <Card className="bg-zinc-900/60 border-zinc-800 overflow-hidden" data-testid="result-deck">
      <div className="h-1 bg-gradient-to-r from-fuchsia-500 to-cyan-400" />
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold">Your mix is ready 🔥</h3>
            <p className="text-xs text-zinc-400" data-testid="result-summary">{result.summary}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cloudEnabled && saveState === "saving" && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> saving…
              </Badge>
            )}
            {cloudEnabled && saveState === "saved" && (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                <Cloud className="w-3 h-3" /> saved to cloud
              </Badge>
            )}
            {cloudEnabled && saveState === "error" && (
              <button onClick={onRetrySave} data-testid="retry-save">
                <Badge className="bg-red-500/15 text-red-300 border-red-500/30 cursor-pointer hover:bg-red-500/25">
                  cloud save failed — retry
                </Badge>
              </button>
            )}
            <Button variant="outline" size="sm" onClick={onReset} className="border-zinc-700" data-testid="reset-session">
              <RotateCcw className="w-4 h-4 mr-1" /> New session
            </Button>
            {stale ? (
              <Button size="sm" disabled className="bg-zinc-700 text-zinc-400" data-testid="download-wav" title="Arrangement changed — generate again to export">
                <Download className="w-4 h-4 mr-1" /> Generate to update
              </Button>
            ) : (
              <a href={result.url} download={fileName} data-testid="download-wav">
                <Button size="sm" className="bg-cyan-500 text-zinc-950 font-semibold hover:bg-cyan-400">
                  <Download className="w-4 h-4 mr-1" /> Download WAV
                </Button>
              </a>
            )}
          </div>
        </div>

        {stale && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300" data-testid="stale-banner">
            You changed the arrangement after this render — press <b>Generate Mix</b> again to hear and export the latest version.
          </div>
        )}

        {/* segment map */}
        <div className="space-y-1.5">
          <div className="h-24 rounded bg-zinc-950/70 p-2">
            <WaveformCanvas waveform={waveform} color="#a3e635" />
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px" data-testid="segment-map">
            {result.plan.entries.map((e, i) => (
              <div
                key={e.id}
                title={`${e.name} · starts ${e.startSec.toFixed(1)}s · ${e.seconds.toFixed(1)}s · transition in: ${e.transBarsIn} bars`}
                style={{
                  width: `${(e.seconds / result.plan.totalSeconds) * 100}%`,
                  backgroundColor: ["#22d3ee", "#e879f9", "#a3e635", "#fbbf24", "#f87171", "#818cf8"][i % 6],
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
            {result.plan.entries.map((e) => (
              <span key={e.id} className="truncate max-w-32">{e.name} ({e.transBarsIn}b in)</span>
            ))}
          </div>
        </div>

        <PlayerBar player={player} />
      </CardContent>
    </Card>
  );
}
