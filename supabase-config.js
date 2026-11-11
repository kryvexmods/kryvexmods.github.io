export const SUPABASE_URL = "https://wujasmzkholgrdovgzlx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_h9BiJehLAQAOcicbvn_ZXA_Y2A4pZEc";

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
