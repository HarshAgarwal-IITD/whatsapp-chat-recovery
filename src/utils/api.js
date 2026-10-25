/**
 * Client for the Cloudflare Pages Functions backend (functions/api/*).
 * Every call except login() throws an UnauthorizedError on a 401 so the app
 * can drop back to the login screen.
 *
 * Shapes:
 *   ChatSummary = { id, name, primaryUser, lastMessage, lastSender, lastDate, messageCount, mediaCount, uploadedAt }
 *                 (lastDate / uploadedAt are ISO strings, lastDate may be null)
 *   ChatMeta    = ChatSummary & { media: string[] }   // attachment file names
 */

export class UnauthorizedError extends Error {
  constructor() { super('Not logged in'); this.name = 'UnauthorizedError'; }
}

async function request(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res;
}

const json = (path, method, body) => request(path, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const chatPath = id => `/api/chats/${encodeURIComponent(id)}`;

/** Resolves true on success, false on wrong ID/password */
export async function login(username, password) {
  try {
    await json('/api/login', 'POST', { username, password });
    return true;
  } catch (e) {
    if (e instanceof UnauthorizedError) return false;
    throw e;
  }
}

export async function logout() {
  await request('/api/logout', { method: 'POST' });
}

/** ChatSummary[] sorted newest lastDate first */
export async function listChats() {
  return (await request('/api/chats')).json();
}

/** ChatMeta for one chat */
export async function getChat(id) {
  return (await request(chatPath(id))).json();
}

/** Raw WhatsApp transcript text */
export async function getChatText(id) {
  return (await request(`${chatPath(id)}/text`)).text();
}

/** URL the browser can use directly in <img>/<video>/<a> (auth goes via cookie) */
export function mediaUrl(id, name) {
  return `${chatPath(id)}/media/${encodeURIComponent(name)}`;
}

/** { [fileName]: url } in the shape ChatView expects */
export function buildMediaMap(id, names) {
  return Object.fromEntries(names.map(n => [n, mediaUrl(id, n)]));
}

export async function deleteChat(id) {
  await request(chatPath(id), { method: 'DELETE' });
}

// ── Upload (called in this order; the chat only appears in the list after putChatMeta) ──

export async function putChatText(id, text) {
  await request(`${chatPath(id)}/text`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  });
}

/** blob: a Blob/File; contentType is guessed from the file extension if the blob has none */
export async function putMedia(id, name, blob, contentType) {
  await request(mediaUrl(id, name), {
    method: 'PUT',
    headers: { 'Content-Type': contentType || blob.type || 'application/octet-stream' },
    body: blob,
  });
}

/** meta: ChatMeta without id/uploadedAt (the server fills those in) */
export async function putChatMeta(id, meta) {
  await json(`${chatPath(id)}/meta`, 'PUT', meta);
}
