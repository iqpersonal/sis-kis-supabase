/**
 * Supabase service-role client — use ONLY in server-side code (API routes,
 * Server Actions, etc.). Bypasses Row Level Security. Never expose to browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Creates a new service-role Supabase client.
 * A fresh client is created per call so no session state leaks between requests.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
