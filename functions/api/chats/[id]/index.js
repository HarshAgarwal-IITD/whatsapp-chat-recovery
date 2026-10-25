import { chatKey, error, json, validId } from '../../../_lib/http.js';
import { updateIndex } from '../../../_lib/store.js';
import { safeEqual } from '../../../_lib/auth.js';

export async function onRequestGet({ params, env }) {
  if (!validId(params.id)) return error(400, 'Invalid chat id');
  const obj = await env.CHATS.get(chatKey(params.id, 'meta.json'));
  if (!obj) return error(404, 'Chat not found');
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Rename a chat. Re-asks for the password; a wrong one is 403 (401 would log the viewer out) */
export async function onRequestPatch({ params, request, env }) {
  const { id } = params;
  if (!validId(id)) return error(400, 'Invalid chat id');
  let body;
  try { body = await request.json(); } catch { return error(400, 'Invalid JSON'); }
  if (!env.APP_PASSWORD || !(await safeEqual(body?.password ?? '', env.APP_PASSWORD))) {
    return error(403, 'Wrong password');
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 200) return error(400, 'Name must be 1–200 characters');

  const key = chatKey(id, 'meta.json');
  const obj = await env.CHATS.get(key);
  if (!obj) return error(404, 'Chat not found');
  const meta = { ...(await obj.json()), name };
  await env.CHATS.put(key, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });

  await updateIndex(env.CHATS, list => list.map(c => (c.id === id ? { ...c, name } : c)));

  const { media: _media, ...summary } = meta;
  return json(summary);
}

export async function onRequestDelete({ params, env }) {
  const { id } = params;
  if (!validId(id)) return error(400, 'Invalid chat id');
  // Delete everything under chats/<id>/, a page (<= 1000 keys) at a time
  let cursor;
  do {
    const page = await env.CHATS.list({ prefix: chatKey(id, ''), cursor });
    if (page.objects.length) await env.CHATS.delete(page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await updateIndex(env.CHATS, list => list.filter(c => c.id !== id));
  return json({ ok: true });
}
