import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPassword } from "./password.js";
import { createAppRepository } from "./repository.js";

test("SQLite remains the default repository and persists application sessions", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "kks-repository-test-"));
  const repository = await createAppRepository({
    DATA_BACKEND: "sqlite",
    DATA_DIR: temporary,
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "a-long-test-password",
  });
  try {
    assert.equal(repository.backend, "sqlite");
    await repository.health();
    const administrator = await repository.findLoginUser("OWNER@example.com");
    assert.ok(administrator);
    assert.equal(administrator.role, "admin");
    assert.ok(verifyPassword("a-long-test-password", administrator.passwordHash));
    const session = await repository.createSession(administrator.id);
    const sessionUser = await repository.getSessionUser(session.token);
    assert.equal(sessionUser?.email, "owner@example.com");
    await repository.deleteSession(session.token);
    assert.equal(await repository.getSessionUser(session.token), null);
  } finally {
    await repository.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("unknown data backends fail closed", async () => {
  await assert.rejects(() => createAppRepository({ DATA_BACKEND: "unknown" }), /sqlite or supabase/);
});
