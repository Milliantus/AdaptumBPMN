import { badRequest, json } from "../_utils/http.js";
import { amoFetch, getAccessContext } from "../_utils/amoApi.js";

function pickFirst(v) {
  return Array.isArray(v) ? v[0] : v;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function parsePayload(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  // JSON webhooks (newer style)
  if (ct.includes("application/json")) {
    const body = await request.json().catch(() => null);
    return body || {};
  }

  // form-urlencoded / multipart (classic amoCRM style)
  const fd = await request.formData().catch(() => null);
  if (!fd) return {};

  const flat = {};
  for (const [k, v] of fd.entries()) flat[k] = v;

  // Try to extract leads status change from keys like:
  // leads[status][0][id], leads[status][0][status_id], leads[status][0][old_status_id], leads[status][0][pipeline_id]
  const out = { leads: { status: [] } };
  const idxMap = new Map();

  for (const [k, v] of Object.entries(flat)) {
    const m = k.match(/^leads\[status\]\[(\d+)\]\[([a-z_]+)\]$/i);
    if (!m) continue;
    const idx = Number(m[1]);
    const field = m[2];
    const row = idxMap.get(idx) || {};
    row[field] = v;
    idxMap.set(idx, row);
  }

  const rows = [...idxMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r);
  out.leads.status = rows;
  // also keep account id if present
  if (flat["account[id]"]) out.account = { id: flat["account[id]"] };
  if (flat["account_id"]) out.account_id = flat["account_id"];
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return badRequest("POST required");

  const u = new URL(request.url);
  const secret = String(u.searchParams.get("secret") || "");
  if (!env.WEBHOOK_SECRET) return json({ ok: false, error: "WEBHOOK_SECRET not configured" }, { status: 500 });
  if (secret !== env.WEBHOOK_SECRET) return json({ ok: false, error: "invalid secret" }, { status: 401 });

  const payload = await parsePayload(request);

  // Determine account id
  const accountId =
    String(payload?.account_id || payload?.account?.id || env.DEFAULT_ACCOUNT_ID || "").trim() || null;
  if (!accountId) return badRequest("account_id missing (set DEFAULT_ACCOUNT_ID env var)");

  // We only care about lead status changes
  const statusEvents = payload?.leads?.status || payload?.leads?.status?.[0] || [];
  const arr = Array.isArray(statusEvents) ? statusEvents : [statusEvents];
  const ev = arr[0] || {};

  const leadId = toNum(ev.id || ev.lead_id);
  const statusId = toNum(ev.status_id);
  const oldStatusId = toNum(ev.old_status_id);
  const pipelineId = toNum(ev.pipeline_id);

  if (!leadId || !statusId) {
    return json({ ok: true, ignored: true, reason: "no lead status change in payload", payload_keys: Object.keys(payload || {}) });
  }

  // idempotency: one task per lead per status per ~5 minutes
  const key = `idemp:lead:${leadId}:status:${statusId}`;
  const already = await env.TOKENS_KV.get(key);
  if (already) return json({ ok: true, skipped: true, reason: "duplicate", lead_id: leadId, status_id: statusId });
  await env.TOKENS_KV.put(key, "1", { expirationTtl: 300 });

  const ctx = await getAccessContext(env, accountId);

  // Prefer responsible from lead itself to be accurate
  const lead = await amoFetch({
    ...ctx,
    path: `/api/v4/leads/${leadId}`,
    method: "GET",
  });

  const responsibleUserId = toNum(lead?.responsible_user_id);
  const minutes = env.TASK_MINUTES_FROM_NOW ? Number(env.TASK_MINUTES_FROM_NOW) : 60;
  const completeTill = Math.floor((Date.now() + Math.max(1, minutes) * 60_000) / 1000);
  const taskTypeId = env.TASK_TYPE_ID ? Number(env.TASK_TYPE_ID) : undefined;
  const textTemplate = String(env.TASK_TEXT || "Связаться с клиентом");

  const text = textTemplate
    .replaceAll("{{lead_id}}", String(leadId))
    .replaceAll("{{status_id}}", String(statusId))
    .replaceAll("{{old_status_id}}", String(oldStatusId ?? ""))
    .replaceAll("{{pipeline_id}}", String(pipelineId ?? ""));

  const task = {
    entity_id: leadId,
    entity_type: "leads",
    text,
    complete_till: completeTill,
  };
  if (responsibleUserId) task.responsible_user_id = responsibleUserId;
  if (Number.isFinite(taskTypeId)) task.task_type_id = taskTypeId;

  const created = await amoFetch({
    ...ctx,
    path: "/api/v4/tasks",
    method: "POST",
    body: [task],
  });

  const taskId = created?._embedded?.tasks?.[0]?.id || null;
  return json({
    ok: true,
    lead_id: leadId,
    status_id: statusId,
    task_id: taskId,
  });
}

