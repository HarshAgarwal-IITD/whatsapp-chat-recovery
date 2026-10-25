import { chatKey, error, json, validId } from '../../../_lib/http.js';

export async function onRequestGet({ params, env }) {
  if (!validId(params.id)) return error(400, 'Invalid chat id');
  const obj = await env.CHATS.get(chatKey(params.id, 'chat.txt'));
  if (!obj) return error(404, 'Chat text not found');
  return new Response(obj.body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPut({ params, env, request }) {
  if (!validId(params.id)) return error(400, 'Invalid chat id');
  await env.CHATS.put(chatKey(params.id, 'chat.txt'), await request.text(), {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });
  return json({ ok: true });
}
