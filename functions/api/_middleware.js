import { verifySession } from '../_lib/auth.js';
import { error } from '../_lib/http.js';

// Every /api/* route except /api/login needs a valid session cookie.
export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/login' || pathname === '/api/login/') return next();
  if (!(await verifySession(request, env.SESSION_SECRET))) return error(401, 'Not logged in');
  return next();
}
