import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("passwords are salted and verifiable", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("correct horse battery staple", first), true);
  assert.equal(verifyPassword("wrong", first), false);
});

test("malformed password hashes fail closed", () => {
  assert.equal(verifyPassword("anything", "not-a-hash"), false);
  assert.equal(verifyPassword("anything", "scrypt$bad$8$1$salt$hash"), false);
});
