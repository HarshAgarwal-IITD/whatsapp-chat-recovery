// Shared helpers for the Pages Functions (not routed: no onRequest exports).

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

export const error = (status, message) => json({ error: message }, status);

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const validId = id => typeof id === 'string' && ID_RE.test(id);

/** Media name taken from the raw URL path (so we decode exactly once), or null if unsafe */
export function mediaName(request) {
  const raw = new URL(request.url).pathname.split('/media/')[1] ?? '';
  let name;
  try { name = decodeURIComponent(raw); } catch { return null; }
  // No separators, so "." / ".." are the only traversal risks left
  if (!name || name.length > 255 || name === '.' || name === '..'
    || /[/\\\0]/.test(name)) return null;
  return name;
}

export const chatKey = (id, rest) => `chats/${id}/${rest}`;
