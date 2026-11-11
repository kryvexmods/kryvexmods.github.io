import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

let clientPromise;

export async function getSupabase() {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    );
  }

  return clientPromise;
}

export { isSupabaseConfigured };
