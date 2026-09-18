import { useCallback, useEffect, useRef, useState } from "react";

/** Play an AudioBuffer through Web Audio with pause/resume + progress. */
export function useAudioBufferPlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const startCtxTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const bufferRef = useRef<AudioBuffer | null>(null);

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0); // seconds

  const stopSource = useCallback(() => {
    if (srcRef.current) {
      try { srcRef.current.onended = null; srcRef.current.stop(); } catch { /* already stopped */ }
      srcRef.current.disconnect();
      srcRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
  }, []);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    const buf = bufferRef.current;
    if (!ctx || !buf) return;
    const pos = offsetRef.current + (ctx.currentTime - startCtxTimeRef.current);
    setPosition(Math.min(pos, buf.duration));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startFrom = useCallback((offset: number) => {
    const buf = bufferRef.current;
    if (!buf) return;
    stopSource();
    if (!ctxRef.current || ctxRef.current.state === "closed") ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => {
      // natural end (not manual stop)
      if (srcRef.current === src) {
        offsetRef.current = 0;
        setPosition(0);
        setPlaying(false);
        srcRef.current = null;
        cancelAnimationFrame(rafRef.current);
      }
    };
    src.start(0, offset);
    srcRef.current = src;
    startCtxTimeRef.current = ctx.currentTime;
    offsetRef.current = offset;
    setPlaying(true);
    tick();
  }, [stopSource, tick]);

  const load = useCallback((buffer: AudioBuffer | null) => {
    stopSource();
    bufferRef.current = buffer;
    offsetRef.current = 0;
    setPosition(0);
    setPlaying(false);
  }, [stopSource]);

  const toggle = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf) return;
    if (playing) {
      const ctx = ctxRef.current;
      if (ctx) offsetRef.current = Math.min(offsetRef.current + (ctx.currentTime - startCtxTimeRef.current), buf.duration);
      stopSource();
      setPlaying(false);
    } else {
      const offset = offsetRef.current >= buf.duration - 0.05 ? 0 : offsetRef.current;
      startFrom(offset);
    }
  }, [playing, startFrom, stopSource]);

  useEffect(() => () => {
    stopSource();
    void ctxRef.current?.close();
    ctxRef.current = null;
  }, [stopSource]);

  return { playing, position, duration: bufferRef.current?.duration ?? 0, load, toggle };
}
