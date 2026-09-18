// Optional Supabase sync. The app is fully functional without credentials;
// when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set, mashup sessions
// can be saved to the `mashup_sessions` table (see supabase/migrations).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseEnabled = supabase !== null;

export interface MashupSessionRow {
  track_a_name: string;
  track_b_name: string;
  genre: string;
  target_bpm: number;
  semitones_b: number;
  stretch_b: number;
  bars: number;
  summary: string;
}

export async function saveMashupSession(row: MashupSessionRow): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("mashup_sessions").insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listMashupSessions(): Promise<MashupSessionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("mashup_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data as MashupSessionRow[];
}
