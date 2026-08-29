import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";
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
    await repository.createMember({
      email: "customer@example.com",
      name: "Customer",
      contactAddress: null,
      passwordHash: hashPassword("customer-test-password"),
      status: true,
      vipStatus: false,
      vipExpiresAt: null,
    });
    const member = (await repository.listMembers()).find((item) => item.email === "customer@example.com");
    assert.ok(member);
    const extended = await repository.extendMemberVip(Number(member.id), 30);
    assert.ok(extended);
    assert.ok(new Date(extended).valueOf() > Date.now() + 29 * 24 * 60 * 60 * 1000);
    const updatedMember = await repository.getMember(Number(member.id));
    assert.equal(updatedMember?.vip_status, 1);
    assert.equal(updatedMember?.vip_expires_at, extended);
  } finally {
    await repository.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("unknown data backends fail closed", async () => {
  await assert.rejects(() => createAppRepository({ DATA_BACKEND: "unknown" }), /sqlite or supabase/);
});
