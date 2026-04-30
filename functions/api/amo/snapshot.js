import { badRequest, json } from "../../_utils/http.js";
import { amoFetch, getAccessContext } from "../../_utils/amoApi.js";
import { encryptJson } from "../../_utils/cryptoBox.js";

async function fetchAllPipelines(ctx) {
  const data = await amoFetch({ ...ctx, path: "/api/v4/leads/pipelines" });
  return data?._embedded?.pipelines || [];
}

async function fetchAllUsers(ctx) {
  const data = await amoFetch({ ...ctx, path: "/api/v4/users" });
  return data?._embedded?.users || [];
}

async function fetchAllCustomFields(ctx) {
  // Leads custom fields (most useful for processes)
  const data = await amoFetch({ ...ctx, path: "/api/v4/leads/custom_fields" });
  return data?._embedded?.custom_fields || [];
}

async function fetchAllTags(ctx) {
  // Tags for leads
  const data = await amoFetch({ ...ctx, path: "/api/v4/leads/tags" });
  return data?._embedded?.tags || [];
}

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const accountId = String(u.searchParams.get("account_id") || "");
  if (!accountId) return badRequest("account_id is required");

  // Optional protection: require secret if configured
  const provided = String(u.searchParams.get("secret") || "").trim();
  const expected = env.API_SECRET ? String(env.API_SECRET).trim() : "";
  if (expected && provided !== expected) {
    return json({ ok: false, error: "invalid secret" }, { status: 401 });
  }

  const store = u.searchParams.get("store") === "1";

  const ctx = await getAccessContext(env, accountId);

  const [pipelines, users, customFields, tags] = await Promise.all([
    fetchAllPipelines(ctx),
    fetchAllUsers(ctx),
    fetchAllCustomFields(ctx),
    fetchAllTags(ctx),
  ]);

  const snapshot = {
    saved_at: Date.now(),
    account_id: accountId,
    base_domain: ctx.baseDomain,
    pipelines,
    users,
    leads_custom_fields: customFields,
    leads_tags: tags,
  };

  if (store) {
    const enc = await encryptJson(env.TOKENS_SECRET, snapshot);
    await env.TOKENS_KV.put(`snapshot:${accountId}`, enc);
  }

  return json({
    ok: true,
    stored: store,
    saved_at: snapshot.saved_at,
    counts: {
      pipelines: pipelines.length,
      users: users.length,
      leads_custom_fields: customFields.length,
      leads_tags: tags.length,
    },
  });
}

