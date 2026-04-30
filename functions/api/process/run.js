import { json, badRequest } from "../../_utils/http.js";
import { amoFetch, getAccessContext } from "../../_utils/amoApi.js";

// Minimal runner over a simplified graph produced by the editor.
// graph = { nodes: [{id,type,name,doc}], flows: [{from,to,condition}] }

function parseDoc(doc) {
  if (!doc) return {};
  try {
    return JSON.parse(doc);
  } catch {
    return {};
  }
}

function buildIndex(graph) {
  const nodes = new Map();
  for (const n of graph.nodes || []) nodes.set(n.id, n);
  const outgoing = new Map();
  for (const f of graph.flows || []) {
    const arr = outgoing.get(f.from) || [];
    arr.push(f);
    outgoing.set(f.from, arr);
  }
  return { nodes, outgoing };
}

function evalCondition(expr, vars) {
  // Very small safe-ish evaluator: supports ==, !=, contains() and existence
  // Examples:
  // - "var.budget > 100000" is NOT supported yet
  // - "vars.segment == 'vip'"
  // - "exists(vars.phone)"
  // - "contains(vars.tags, 'hot')"
  try {
    const s = String(expr || "").trim();
    if (!s) return true;
    if (s.startsWith("exists(") && s.endsWith(")")) {
      const key = s.slice(7, -1).trim();
      return vars?.[key] != null && String(vars[key]).length > 0;
    }
    const mEq = s.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=)\s*['"]?(.+?)['"]?$/);
    if (mEq) {
      const [, k, op, v] = mEq;
      const cur = vars?.[k];
      return op === "==" ? String(cur) === v : String(cur) !== v;
    }
    const mCont = s.match(/^contains\(\s*([a-zA-Z0-9_.-]+)\s*,\s*['"](.+?)['"]\s*\)$/);
    if (mCont) {
      const [, k, v] = mCont;
      const cur = vars?.[k];
      return String(cur || "").includes(v);
    }
    return false;
  } catch {
    return false;
  }
}

async function runAction({ ctx, accountId, entity, node, vars }) {
  const doc = parseDoc(node.doc);
  const kind = doc.kind || node.name || node.type;

  // Convention:
  // node.doc is JSON, for example:
  // { "kind": "change_stage", "pipeline_id": 123, "status_id": 456 }
  // { "kind": "note", "text": "hello" }
  // { "kind": "webhook", "url": "...", "method": "POST", "json": {...}, "save_to": "hook.result" }
  // { "kind": "timer", "ms": 5000 }

  if (kind === "timer") {
    const ms = Math.max(0, Math.min(30_000, Number(doc.ms || 0))); // MVP: cap to 30s in worker
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return { ok: true, action: "timer", ms };
  }

  if (kind === "webhook") {
    const url = String(doc.url || "");
    if (!url) throw new Error("webhook.url is required");
    const method = String(doc.method || "POST").toUpperCase();
    const headers = new Headers();
    for (const [k, v] of Object.entries(doc.headers || {})) headers.set(k, String(v));
    let body;
    if (doc.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(doc.json);
    } else if (doc.body !== undefined) {
      body = String(doc.body);
    }
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    if (doc.save_to) vars[String(doc.save_to)] = parsed ?? text;
    return { ok: true, action: "webhook", status: res.status };
  }

  if (kind === "change_stage") {
    if (entity.type !== "lead") throw new Error("change_stage supports lead only in MVP");
    const leadId = Number(entity.id);
    const payload = [{ id: leadId }];
    if (doc.status_id) payload[0].status_id = Number(doc.status_id);
    if (doc.pipeline_id) payload[0].pipeline_id = Number(doc.pipeline_id);
    await amoFetch({
      ...ctx,
      method: "PATCH",
      path: "/api/v4/leads",
      body: payload,
    });
    return { ok: true, action: "change_stage" };
  }

  if (kind === "note") {
    const text = String(doc.text || "");
    if (!text) throw new Error("note.text is required");
    if (entity.type !== "lead") throw new Error("note supports lead only in MVP");
    await amoFetch({
      ...ctx,
      method: "POST",
      path: `/api/v4/leads/${Number(entity.id)}/notes`,
      body: [{ note_type: "common", params: { text } }],
    });
    return { ok: true, action: "note" };
  }

  if (kind === "task") {
    // Create a task for an entity (MVP: lead only)
    // doc:
    //  { "kind":"task", "text":"Позвонить", "minutes_from_now": 60, "responsible_user_id": 123, "task_type_id": 1 }
    if (entity.type !== "lead") throw new Error("task supports lead only in MVP");
    const text = String(doc.text || doc.title || "");
    if (!text) throw new Error("task.text is required");

    const minutes = doc.minutes_from_now != null ? Number(doc.minutes_from_now) : 60;
    const completeTill = doc.complete_till
      ? Number(doc.complete_till)
      : Math.floor((Date.now() + Math.max(1, minutes) * 60_000) / 1000);

    const task = {
      entity_id: Number(entity.id),
      entity_type: "leads",
      text,
      complete_till: completeTill,
    };

    if (doc.responsible_user_id) task.responsible_user_id = Number(doc.responsible_user_id);
    if (doc.task_type_id) task.task_type_id = Number(doc.task_type_id);

    const created = await amoFetch({
      ...ctx,
      method: "POST",
      path: "/api/v4/tasks",
      body: [task],
    });

    const id = created?._embedded?.tasks?.[0]?.id;
    return { ok: true, action: "task", task_id: id || null };
  }

  if (kind === "set_var") {
    const k = String(doc.key || "");
    if (!k) throw new Error("set_var.key is required");
    vars[k] = doc.value ?? null;
    return { ok: true, action: "set_var", key: k };
  }

  throw new Error(`Unsupported node kind: ${kind}`);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return badRequest("POST required");
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("JSON body required");

  const accountId = String(body.account_id || "");
  const entity = body.entity || null; // {type:'lead', id:123}
  const graph = body.graph || null;
  const startNodeId = String(body.start_node_id || "");
  const vars = body.vars && typeof body.vars === "object" ? { ...body.vars } : {};

  if (!accountId) return badRequest("account_id is required");
  if (!entity?.type || !entity?.id) return badRequest("entity is required");
  if (!graph?.nodes || !graph?.flows) return badRequest("graph is required");
  if (!startNodeId) return badRequest("start_node_id is required");

  const ctx = await getAccessContext(env, accountId);
  const { nodes, outgoing } = buildIndex(graph);

  let current = nodes.get(startNodeId);
  if (!current) return badRequest("start_node_id not found");

  const trace = [];
  const visited = new Set();

  for (let steps = 0; steps < 50; steps++) {
    if (!current) break;
    if (visited.has(current.id)) break; // prevent loops in MVP
    visited.add(current.id);

    // Execute only “action” nodes; skip start/end/gateways for MVP
    const t0 = Date.now();
    if (current.type !== "bpmn:StartEvent" && current.type !== "bpmn:EndEvent" && current.type !== "bpmn:ExclusiveGateway") {
      const r = await runAction({ ctx, accountId, entity, node: current, vars });
      trace.push({ node: current.id, type: current.type, ms: Date.now() - t0, result: r });
    } else {
      trace.push({ node: current.id, type: current.type, ms: Date.now() - t0, result: { ok: true, action: "noop" } });
    }

    const outs = outgoing.get(current.id) || [];
    if (!outs.length) break;

    if (current.type === "bpmn:ExclusiveGateway") {
      const chosen = outs.find((f) => evalCondition(f.condition, vars)) || outs[0];
      current = nodes.get(chosen.to);
    } else {
      current = nodes.get(outs[0].to);
    }
  }

  return json({ ok: true, trace, vars });
}

