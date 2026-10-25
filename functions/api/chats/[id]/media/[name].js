import { chatKey, error, json, mediaName, validId } from '../../../../_lib/http.js';

function target({ params, request }) {
  if (!validId(params.id)) return { err: error(400, 'Invalid chat id') };
  const name = mediaName(request);
  if (!name) return { err: error(400, 'Invalid file name') };
  return { key: chatKey(params.id, `media/${name}`) };
}

function baseHeaders(obj) {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  if (!h.has('Content-Type')) h.set('Content-Type', 'application/octet-stream');
  h.set('ETag', obj.httpEtag);
  h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', 'private, max-age=31536000, immutable');
  return h;
}

// Streams from R2 with Range + conditional support (Safari needs proper 206s to seek video).
export async function onRequestGet(ctx) {
  const { key, err } = target(ctx);
  if (err) return err;
  const { request, env } = ctx;
  const ranged = request.headers.has('Range');

  // If R2 rejects the Range header (e.g. multi-range), fall back to the whole file (a valid 200)
  let obj;
  try {
    obj = await env.CHATS.get(key, { range: request.headers, onlyIf: request.headers });
  } catch {
    obj = await env.CHATS.get(key, { onlyIf: request.headers });
  }
  if (!obj) return error(404, 'File not found');

  const headers = baseHeaders(obj);
  if (!('body' in obj) || !obj.body) {
    // Precondition failed: If-None-Match / If-Modified-Since → 304, If-Match etc. → 412
    const notModified = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since');
    return new Response(null, { status: notModified ? 304 : 412, headers });
  }

  const size = obj.size;
  const start = /^bytes=(\d+)-/.exec(request.headers.get('Range') || '');
  if (start && Number(start[1]) >= size) { // R2 would just return the whole file
    await obj.body.cancel();
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  if (ranged && obj.range) {
    let offset, length;
    if ('suffix' in obj.range) {
      length = Math.min(obj.range.suffix, size);
      offset = size - length;
    } else {
      offset = obj.range.offset ?? 0;
      length = Math.min(obj.range.length ?? Infinity, size - offset);
    }
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${size}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(obj.body, { status: 200, headers });
}

export async function onRequestHead(ctx) {
  const { key, err } = target(ctx);
  if (err) return new Response(null, { status: err.status });
  const obj = await ctx.env.CHATS.head(key);
  if (!obj) return new Response(null, { status: 404 });
  const headers = baseHeaders(obj);
  headers.set('Content-Length', String(obj.size));
  return new Response(null, { status: 200, headers });
}

export async function onRequestPut(ctx) {
  const { key, err } = target(ctx);
  if (err) return err;
  const { request, env } = ctx;
  if (!request.body) return error(400, 'Empty body');
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  await env.CHATS.put(key, request.body, { httpMetadata: { contentType } });
  return json({ ok: true });
}
