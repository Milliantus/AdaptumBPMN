import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import { env } from "./env.js";
import { getAuthorizeUrl, exchangeCodeForToken, getAccountInfo } from "./amoOAuth.js";
import { putTokens, getTokens } from "./tokenStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Serve widget static files (for dev and for marketplace hosting)
const widgetDir = path.resolve(__dirname, "..", "..", "widget");
app.use("/widget", express.static(widgetDir));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * Start OAuth from amoCRM settings page.
 * Query:
 * - base_domain: https://{subdomain}.amocrm.ru
 */
app.get("/oauth/start", (req, res) => {
  const baseDomain = String(req.query.base_domain || "");
  if (!baseDomain.startsWith("https://")) return res.status(400).send("base_domain is required");

  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.PUBLIC_BASE_URL.startsWith("https://"),
    maxAge: 10 * 60 * 1000,
  });

  const url = getAuthorizeUrl({ baseDomain, state });
  res.redirect(url);
});

/**
 * OAuth callback configured in amoCRM app settings:
 * {PUBLIC_BASE_URL}{AMO_REDIRECT_PATH}
 */
app.get(env.AMO_REDIRECT_PATH, async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const cookieState = String(req.cookies.oauth_state || "");
    const baseDomain = String(req.query.referer || req.query.base_domain || "");

    if (!code) return res.status(400).send("Missing code");
    if (!state || state !== cookieState) return res.status(400).send("Invalid state");
    if (!baseDomain.startsWith("https://")) return res.status(400).send("Missing base_domain");

    const tokenPayload = await exchangeCodeForToken({ baseDomain, code });
    const account = await getAccountInfo({ baseDomain, accessToken: tokenPayload.access_token });
    const accountId = String(account?.id || "");
    if (!accountId) return res.status(500).send("Cannot detect account id");

    putTokens(accountId, { ...tokenPayload, base_domain: baseDomain });

    // This page can be improved to close the popup and notify widget
    res.send(
      `<html><body><h3>OK</h3><p>Account connected: ${accountId}</p><script>window.close?.()</script></body></html>`,
    );
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
});

/**
 * Example API endpoint used by widget to check auth.
 * Query: account_id
 */
app.get("/api/auth/status", (req, res) => {
  const accountId = String(req.query.account_id || "");
  if (!accountId) return res.status(400).json({ ok: false, error: "account_id is required" });
  const t = getTokens(accountId);
  res.json({ ok: true, connected: Boolean(t), account_id: accountId });
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${env.PORT}`);
});

