// Stateless signed session cookie: session=<expiry ms>.<base64url hmac(expiry)>
const enc = new TextEncoder();
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, seconds

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

/** Constant-time string comparison: compare HMACs of both under a random key */
export async function safeEqual(a, b) {
  const k = crypto.randomUUID();
  const [x, y] = await Promise.all([hmac(k, String(a)), hmac(k, String(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export async function makeSession(secret) {
  const expiry = String(Date.now() + MAX_AGE * 1000);
  return `${expiry}.${b64url(await hmac(secret, expiry))}`;
}

export async function verifySession(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return false;
  const [expiry, sig] = m[1].split('.');
  if (!expiry || !sig || !(Number(expiry) > Date.now())) return false;
  return safeEqual(sig, b64url(await hmac(secret, expiry)));
}

export const sessionCookie = (value, maxAge = MAX_AGE) =>
  `session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
