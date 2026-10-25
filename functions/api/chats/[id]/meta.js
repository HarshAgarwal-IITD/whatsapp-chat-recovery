import { chatKey, error, json, validId } from '../../../_lib/http.js';
import { updateIndex } from '../../../_lib/store.js';

// Body: ChatMeta without id/uploadedAt. Writes meta.json and upserts the summary into index.json.
export async function onRequestPut({ params, env, request }) {
  const { id } = params;
  if (!validId(id)) return error(400, 'Invalid chat id');
  let body;
  try { body = await request.json(); } catch { return error(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'Invalid meta');

  const meta = {
    ...body,
    id,
    uploadedAt: new Date().toISOString(),
    media: Array.isArray(body.media) ? body.media : [],
  };
  const summary = { ...meta };
  delete summary.media;

  await env.CHATS.put(chatKey(id, 'meta.json'), JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  });
  await updateIndex(env.CHATS, list => [...list.filter(c => c.id !== id), summary]);
  return json(summary);
}
