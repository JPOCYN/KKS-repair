import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";

test("requires server-only Supabase settings", () => {
  assert.throws(() => readSupabaseServerConfig({}), /SUPABASE_URL and SUPABASE_SECRET_KEY/);
  assert.throws(() => readSupabaseServerConfig({
    SUPABASE_URL: "http://project.supabase.co",
    SUPABASE_SECRET_KEY: "secret",
  }), /must use HTTPS/);
});

test("creates a non-persistent server client without a network request", () => {
  const config = readSupabaseServerConfig({
    SUPABASE_URL: "https://project.supabase.co/path-that-is-ignored",
    SUPABASE_SECRET_KEY: "sb_secret_test",
  });
  assert.deepEqual(config, {
    url: "https://project.supabase.co",
    secretKey: "sb_secret_test",
  });
  assert.ok(createSupabaseServerClient(config));
  assert.equal(requireExpectedSupabaseProject(config, {
    SUPABASE_EXPECTED_PROJECT_REF: "project",
  }), "project");
  assert.throws(() => requireExpectedSupabaseProject(config, {
    SUPABASE_EXPECTED_PROJECT_REF: "another-project",
  }), /does not match/);
  assert.throws(() => requireExpectedSupabaseProject({
    url: "https://nested.project.supabase.co",
    secretKey: "sb_secret_test",
  }, { SUPABASE_EXPECTED_PROJECT_REF: "nested.project" }), /valid project ref/);
});
