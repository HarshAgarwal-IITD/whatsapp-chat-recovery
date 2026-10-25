// index.json = ChatSummary[] (ChatMeta minus `media`)
const INDEX = 'index.json';

export async function readIndex(bucket) {
  const obj = await bucket.get(INDEX);
  return obj ? obj.json() : [];
}

/**
 * Read-modify-write index.json with `fn(list) => newList`. The write only lands if nobody
 * else wrote in between (R2 etag precondition), otherwise it re-reads and retries, so a
 * rename and an upload finishing together can't drop each other's change.
 */
export async function updateIndex(bucket, fn) {
  for (let attempt = 0; attempt < 10; attempt++) {
    // Random, growing pause so competing writers stop colliding
    if (attempt) await new Promise(r => setTimeout(r, Math.random() * 50 * 2 ** Math.min(attempt, 5)));
    const obj = await bucket.get(INDEX);
    const list = obj ? await obj.json() : [];
    const written = await bucket.put(INDEX, JSON.stringify(fn(list)), {
      httpMetadata: { contentType: 'application/json' },
      ...(obj && { onlyIf: { etagMatches: obj.etag } }),
    });
    if (written) return;
  }
  throw new Error('Chat list is busy, please try again');
}

/** Newest lastDate first, chats without a date last */
export const sortChats = list => list.sort((a, b) =>
  (b.lastDate ? Date.parse(b.lastDate) : -Infinity) - (a.lastDate ? Date.parse(a.lastDate) : -Infinity)
  || 0);
