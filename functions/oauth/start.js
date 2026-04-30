import { badRequest } from "../_utils/http.js";

function getAuthorizeUrl({ baseDomain, clientId, redirectUri, state }) {
  const u = new URL("/oauth", baseDomain);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("state", state);
  // amoCRM/Kommo expects mode=popup|post_message (affects redirect behavior).
  // We use post_message to keep auth inside the opened window.
  u.searchParams.set("mode", "post_message");
  return u.toString();
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const baseDomain = String(url.searchParams.get("base_domain") || "");
  if (!baseDomain.startsWith("https://")) return badRequest("base_domain is required");

  const state = crypto.randomUUID().replace(/-/g, "");
  const redirectUri = new URL("/oauth/callback", env.PUBLIC_BASE_URL).toString();
  const authUrl = getAuthorizeUrl({
    baseDomain,
    clientId: env.AMO_CLIENT_ID,
    redirectUri,
    state,
  });

  const headers = new Headers();
  headers.set("location", authUrl);
  headers.append("set-cookie", `oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);

  return new Response(null, { status: 302, headers });
}

