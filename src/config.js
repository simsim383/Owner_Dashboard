// ═══════════════════════════════════════════════════════════════════
// CONFIG — All keys from Vercel environment variables
// ═══════════════════════════════════════════════════════════════════
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";
export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";
export const AI_MODEL = "claude-haiku-4-5-20251001";
export const AI_HDR = ANTHROPIC_KEY
  ? { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-dangerous-direct-browser-access": "true", "anthropic-version": "2023-06-01" }
  : { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" };
