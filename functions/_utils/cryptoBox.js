import { base64ToBytes, bytesToBase64 } from "./base64.js";

async function keyFromSecret(secret) {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", secretBytes);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(secret, obj) {
  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const cipher = new Uint8Array(cipherBuf);

  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return bytesToBase64(out);
}

export async function decryptJson(secret, b64) {
  const key = await keyFromSecret(secret);
  const all = base64ToBytes(b64);
  const iv = all.subarray(0, 12);
  const cipher = all.subarray(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plainBuf));
}

