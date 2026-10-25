import { makeSession, safeEqual, sessionCookie } from '../_lib/auth.js';
import { error, json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.APP_USERNAME || !env.APP_PASSWORD || !env.SESSION_SECRET) {
    return error(500, 'Server is not configured');
  }
  let body;
  try { body = await request.json(); } catch { return error(400, 'Invalid JSON'); }
  const [userOk, passOk] = await Promise.all([
    safeEqual(body?.username ?? '', env.APP_USERNAME),
    safeEqual(body?.password ?? '', env.APP_PASSWORD),
  ]);
  if (!(userOk && passOk)) return error(401, 'Wrong ID or password');
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await makeSession(env.SESSION_SECRET)) });
}
