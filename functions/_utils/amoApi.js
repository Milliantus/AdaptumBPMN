import { decryptJson, encryptJson } from "./cryptoBox.js";

async function getStoredTokens(env, accountId) {
  const raw = await env.TOKENS_KV.get(`tokens:${accountId}`);
  if (!raw) return null;
  return await decryptJson(env.TOKENS_SECRET, raw);
}

async function storeTokens(env, accountId, tokenPayload) {
  const enc = await encryptJson(env.TOKENS_SECRET, tokenPayload);
  await env.TOKENS_KV.put(`tokens:${accountId}`, enc);
}

async function refreshTokens(env, baseDomain, refreshToken) {
  const url = new URL("/oauth2/access_token", baseDomain);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.AMO_CLIENT_ID,
      client_secret: env.AMO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: new URL("/oauth/callback", env.PUBLIC_BASE_URL).toString(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.hint || data?.title || `refresh failed (${res.status})`);
  return data;
}

export async function getAccessContext(env, accountId) {
  const t = await getStoredTokens(env, accountId);
  if (!t) throw new Error("Not connected");

  const savedAt = Number(t.saved_at || 0);
  const expiresIn = Number(t.expires_in || 0);
  const expiresAt = savedAt && expiresIn ? savedAt + expiresIn * 1000 : 0;
  const shouldRefresh = expiresAt ? Date.now() > expiresAt - 60_000 : false;

  if (!shouldRefresh) {
    return { baseDomain: t.base_domain, accessToken: t.access_token };
  }

  const refreshed = await refreshTokens(env, t.base_domain, t.refresh_token);
  const next = { ...refreshed, base_domain: t.base_domain, saved_at: Date.now() };
  await storeTokens(env, String(accountId), next);
  return { baseDomain: next.base_domain, accessToken: next.access_token };
}

export async function amoFetch({ baseDomain, accessToken, path, method = "GET", body }) {
  const url = new URL(path, baseDomain);
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  });
  let payload;
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    payload = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.hint || json?.title || `amo api error ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    e.details = json;
    throw e;
  }
  return json;
}

