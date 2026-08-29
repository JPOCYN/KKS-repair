import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });
  return ["scrypt", cost, blockSize, parallelization, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [algorithm, costValue, blockValue, parallelValue, saltValue, hashValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const parameters = [costValue, blockValue, parallelValue].map(Number);
    if (parameters.some((value) => !Number.isSafeInteger(value) || value <= 0)) return false;

    const expected = Buffer.from(hashValue, "base64url");
    if (!expected.length) return false;
    const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length, {
      N: parameters[0],
      r: parameters[1],
      p: parameters[2],
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
