import { badRequest, json } from "../_utils/http.js";
import { decryptJson, encryptJson } from "../_utils/cryptoBox.js";

function getCookie(request, name) {
  const h = request.headers.get("cookie") || "";
  const parts = h.split(";").map((s) => s.trim());
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

async function exchangeCodeForToken({ baseDomain, clientId, clientSecret, redirectUri, code }) {
  const url = new URL("/oauth2/access_token", baseDomain);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.hint || data?.title || `token exchange failed (${res.status})`);
  return data;
}

async function getAccountInfo({ baseDomain, accessToken }) {
  const url = new URL("/api/v4/account", baseDomain);
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`account fetch failed (${res.status})`);
  return data;
}

export async function onRequest({ request, env }) {
  try {
    const u = new URL(request.url);
    const code = String(u.searchParams.get("code") || "");
    const state = String(u.searchParams.get("state") || "");
    const cookieState = String(getCookie(request, "oauth_state") || "");

    // amoCRM может прислать домен аккаунта как:
    // - referer (sic) или referrer
    // - иногда без схемы (например "2453.amocrm.ru")
    const rawDomain = String(
      u.searchParams.get("referer") ||
        u.searchParams.get("referrer") ||
        u.searchParams.get("base_domain") ||
        u.searchParams.get("baseDomain") ||
        "",
    ).trim();
    const baseDomain = rawDomain
      ? rawDomain.startsWith("http")
        ? rawDomain
        : `https://${rawDomain.replace(/^\/+/, "")}`
      : "";

    if (!code) return badRequest("Missing code");
    if (!state || state !== cookieState) return badRequest("Invalid state");
    if (!baseDomain.startsWith("https://")) return badRequest("Missing base_domain");

    const redirectUri = new URL("/oauth/callback", env.PUBLIC_BASE_URL).toString();
    const tokenPayload = await exchangeCodeForToken({
      baseDomain,
      clientId: env.AMO_CLIENT_ID,
      clientSecret: env.AMO_CLIENT_SECRET,
      redirectUri,
      code,
    });

    const account = await getAccountInfo({ baseDomain, accessToken: tokenPayload.access_token });
    const accountId = String(account?.id || "");
    if (!accountId) return json({ ok: false, error: "Cannot detect account id" }, { status: 500 });

    const toStore = await encryptJson(env.TOKENS_SECRET, {
      ...tokenPayload,
      base_domain: baseDomain,
      saved_at: Date.now(),
    });
    await env.TOKENS_KV.put(`tokens:${accountId}`, toStore);

    return new Response(
      `<html><body><h3>OK</h3><p>Account connected: ${accountId}</p><script>window.close?.()</script></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

