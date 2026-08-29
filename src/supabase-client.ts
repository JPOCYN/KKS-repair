import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase-types.js";

export interface SupabaseServerConfig {
  url: string;
  secretKey: string;
}

export function projectRefFromSupabaseUrl(url: string): string {
  const hostname = new URL(url).hostname;
  const suffix = ".supabase.co";
  if (!hostname.endsWith(suffix)) throw new Error("SUPABASE_URL must be the standard project URL for migration");
  const projectRef = hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9]+$/.test(projectRef)) throw new Error("SUPABASE_URL must contain a valid project ref");
  return projectRef;
}

export function requireExpectedSupabaseProject(
  config: SupabaseServerConfig,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const actual = projectRefFromSupabaseUrl(config.url);
  const expected = environment.SUPABASE_EXPECTED_PROJECT_REF?.trim();
  if (!expected) throw new Error("SUPABASE_EXPECTED_PROJECT_REF is required for writes");
  if (expected !== actual) throw new Error("SUPABASE_EXPECTED_PROJECT_REF does not match SUPABASE_URL");
  return actual;
}

export function readSupabaseServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseServerConfig {
  const url = environment.SUPABASE_URL?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS");
  }
  return { url: parsed.origin, secretKey };
}

export function createSupabaseServerClient(
  config: SupabaseServerConfig = readSupabaseServerConfig(),
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { "X-Client-Info": "kks-repair-server" },
    },
  });
}
