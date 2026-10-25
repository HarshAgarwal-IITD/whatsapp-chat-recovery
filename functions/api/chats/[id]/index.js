import { chatKey, error, json, validId } from '../../../_lib/http.js';
import { readIndex, writeIndex } from '../../../_lib/store.js';

export async function onRequestGet({ params, env }) {
  if (!validId(params.id)) return error(400, 'Invalid chat id');
  const obj = await env.CHATS.get(chatKey(params.id, 'meta.json'));
  if (!obj) return error(404, 'Chat not found');
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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

  const list = await readIndex(env.CHATS);
  const next = list.filter(c => c.id !== id);
  if (next.length !== list.length) await writeIndex(env.CHATS, next);
  return json({ ok: true });
}
