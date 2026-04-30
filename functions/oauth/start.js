import { badRequest } from "../_utils/http.js";

function getAuthorizeUrl({ baseDomain, clientId, redirectUri, state }) {
  const u = new URL("/oauth", baseDomain);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
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

