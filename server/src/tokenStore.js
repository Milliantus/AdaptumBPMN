import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { decryptJson, encryptJson } from "./cryptoBox.js";
import { env } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, "..", "data");
const tokensFile = path.join(dataDir, "tokens.enc.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readAll() {
  ensureDataDir();
  if (!fs.existsSync(tokensFile)) return { byAccountId: {} };
  const raw = fs.readFileSync(tokensFile, "utf8");
  if (!raw.trim()) return { byAccountId: {} };
  return decryptJson(env.TOKENS_SECRET, raw);
}

function writeAll(db) {
  ensureDataDir();
  fs.writeFileSync(tokensFile, encryptJson(env.TOKENS_SECRET, db), "utf8");
}

/**
 * accountId = amo account id (numeric as string)
 * tokenPayload = { access_token, refresh_token, expires_in, token_type, ... }
 */
export function putTokens(accountId, tokenPayload) {
  const db = readAll();
  db.byAccountId ??= {};
  db.byAccountId[String(accountId)] = {
    ...tokenPayload,
    saved_at: Date.now(),
  };
  writeAll(db);
}

export function getTokens(accountId) {
  const db = readAll();
  return db.byAccountId?.[String(accountId)] ?? null;
}

