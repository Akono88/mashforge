# MashForge — AI Music Mashup Studio

Drop two tracks, get a mashup. MashForge analyzes BPM and musical key of both
songs, time-stretches and pitch-matches the guest track, then arranges a full
genre-structured mix — rendered entirely in your browser with the Web Audio API.

## Features

- **Track analysis** — BPM via energy-flux autocorrelation; musical key via
  chromagram + Krumhansl-Schmuckler profiles; peak waveform display
- **Matching** — WSOLA time-stretching locks Track B to the target tempo
  without changing pitch; optional pitch-shift into Track A's key
- **Genre presets** — Electro House, Latin Dance, Hip-Hop Blend, Deep House,
  Loop Blend. Each defines a real arrangement (intro / build / drop /
  breakdown / outro) with sidechain pump, filter sweeps and crossfades
- **Export** — studio-quality WAV download
- **Supabase sync (optional)** — mashup sessions saved to the cloud when env
  keys are configured; fully functional local-only otherwise

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Web Audio API ·
Supabase · deploys as a static site (Vercel-ready)

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # → dist/
```

## Supabase setup (optional)

1. Create a project, then run `supabase/migrations/0001_mashup_sessions.sql`
   in the SQL editor.
2. Copy `.env.example` to `.env.local` and fill in your project URL and
   publishable/anon key.

Without these keys the app runs in local-only mode — nothing else to do.

## How the mashup engine works

| Stage | Technique |
| --- | --- |
| BPM | Spectral energy flux + autocorrelation over 60–180 BPM |
| Key | 12-bin chromagram, Krumhansl-Schmuckler major/minor correlation |
| Time-stretch | WSOLA (waveform-similarity overlap-add), channel-locked |
| Pitch shift | Resample by 2^(n/12), duration compensated by the stretcher |
| Arrangement | OfflineAudioContext: gain/filter automation + per-beat sidechain |
| Export | 16-bit PCM WAV encoder |
