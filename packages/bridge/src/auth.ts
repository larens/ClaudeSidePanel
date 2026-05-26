import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TOKEN_FILE = join(homedir(), ".claude-web-token");

export function getOrCreateToken(): string {
  if (existsSync(TOKEN_FILE)) {
    return readFileSync(TOKEN_FILE, "utf-8").trim();
  }
  const token = randomBytes(32).toString("hex");
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

export function verifyToken(token: string): boolean {
  const expected = getOrCreateToken();
  return token === expected;
}
