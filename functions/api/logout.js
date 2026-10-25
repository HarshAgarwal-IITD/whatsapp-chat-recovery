import { sessionCookie } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

export const onRequestPost = () => json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
