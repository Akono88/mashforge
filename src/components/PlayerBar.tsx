import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import { formatTime } from "@/lib/format";
import type { useAudioBufferPlayer } from "@/hooks/useAudioBufferPlayer";

type Player = ReturnType<typeof useAudioBufferPlayer>;

interface Props {
  player: Player;
  accent?: string;
  small?: boolean;
}

/** Play/pause + click-to-seek progress bar for an AudioBuffer player. */
export default function PlayerBar({ player, small = false }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const onSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = barRef.current;
      if (!el || player.duration <= 0) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      player.seek(frac * player.duration);
    },
    [player],
  );

  const pct = player.duration > 0 ? (player.position / player.duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        data-testid="player-toggle"
        className={`border-zinc-700 rounded-full shrink-0 ${small ? "w-8 h-8" : "w-11 h-11"}`}
        onClick={player.toggle}
      >
        {player.playing ? (
          <Pause className={small ? "w-3.5 h-3.5" : "w-5 h-5"} />
        ) : (
          <Play className={`${small ? "w-3.5 h-3.5" : "w-5 h-5"} ml-0.5`} />
        )}
      </Button>
      <div className="flex-1">
        <div
          ref={barRef}
          data-testid="player-progress"
          className={`${small ? "h-1.5" : "h-2"} rounded-full bg-zinc-800 overflow-hidden cursor-pointer`}
          onClick={onSeek}
        >
          <div
            className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500 mt-1 font-mono">
          <span data-testid="player-position">{formatTime(player.position)}</span>
          <span data-testid="player-duration">{formatTime(player.duration)}</span>
        </div>
      </div>
    </div>
  );
}
