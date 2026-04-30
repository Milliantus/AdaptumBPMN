import { env, redirectUri } from "./env.js";

export function getAuthorizeUrl({ baseDomain, state }) {
  // baseDomain example: https://example.amocrm.ru
  const u = new URL("/oauth", baseDomain);
  u.searchParams.set("client_id", env.AMO_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCodeForToken({ baseDomain, code }) {
  const url = new URL("/oauth2/access_token", baseDomain);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.AMO_CLIENT_ID,
      client_secret: env.AMO_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.hint || json?.title || `amoCRM token exchange failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function getAccountInfo({ baseDomain, accessToken }) {
  const url = new URL("/api/v4/account", baseDomain);
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`amoCRM account fetch failed (${res.status})`);
  return json;
}

