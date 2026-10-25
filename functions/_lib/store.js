// index.json = ChatSummary[] (ChatMeta minus `media`)
const INDEX = 'index.json';

export async function readIndex(bucket) {
  const obj = await bucket.get(INDEX);
  if (!obj) return [];
  try { return await obj.json(); } catch { return []; }
}

export const writeIndex = (bucket, list) =>
  bucket.put(INDEX, JSON.stringify(list), { httpMetadata: { contentType: 'application/json' } });

/** Newest lastDate first, chats without a date last */
export const sortChats = list => list.sort((a, b) =>
  (b.lastDate ? Date.parse(b.lastDate) : -Infinity) - (a.lastDate ? Date.parse(a.lastDate) : -Infinity)
  || 0);
