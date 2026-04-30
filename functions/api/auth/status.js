import { badRequest, json } from "../../_utils/http.js";
import { decryptJson } from "../../_utils/cryptoBox.js";

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const accountId = String(u.searchParams.get("account_id") || "");
  if (!accountId) return badRequest("account_id is required");

  const raw = await env.TOKENS_KV.get(`tokens:${accountId}`);
  if (!raw) return json({ ok: true, connected: false, account_id: accountId });

  try {
    await decryptJson(env.TOKENS_SECRET, raw);
    return json({ ok: true, connected: true, account_id: accountId });
  } catch {
    return json({ ok: true, connected: false, account_id: accountId });
  }
}

