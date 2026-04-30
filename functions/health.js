import { json } from "./_utils/http.js";

export async function onRequest() {
  return json({ ok: true });
}

