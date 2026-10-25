import { json } from '../../_lib/http.js';
import { readIndex, sortChats } from '../../_lib/store.js';

export async function onRequestGet({ env }) {
  return json(sortChats(await readIndex(env.CHATS)), 200, { 'Cache-Control': 'no-store' });
}
