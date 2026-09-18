import { useEffect, useRef } from "react";

interface Props {
  waveform: Float32Array | null;
  className?: string;
  color?: string;
}

/** Lightweight canvas waveform display. */
export default function WaveformCanvas({ waveform, className, color = "#22d3ee" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!waveform || waveform.length === 0) {
      ctx.strokeStyle = "#3f3f46";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const mid = height / 2;
    const bars = waveform.length;
    const barWidth = width / bars;
    ctx.fillStyle = color;
    for (let i = 0; i < bars; i++) {
      const v = Math.min(1, waveform[i]);
      const h = Math.max(1, v * height * 0.92);
      ctx.fillRect(i * barWidth, mid - h / 2, Math.max(1, barWidth * 0.7), h);
    }
  }, [waveform, color]);

  return <canvas ref={ref} className={className} style={{ width: "100%", height: "100%" }} />;
}
