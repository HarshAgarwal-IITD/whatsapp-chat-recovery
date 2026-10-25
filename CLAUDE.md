# WhatsApp Chat Viewer — notes for Claude

Personal site: the owner uploads WhatsApp export ZIPs; their father logs in with one shared ID/password and reads the chats WhatsApp-style, mostly on a phone. React 19 + Vite 8 SPA (plain JSX, no TypeScript, no router lib) with a Cloudflare Pages Functions backend and R2 storage.

## Hosting (production)
- Live: https://whatsapp-chats-cdx.pages.dev (Cloudflare Pages project `whatsapp-chats`, direct upload — NOT connected to Git).
- Frontend (`dist/`) and backend (`functions/`) deploy together with `npm run deploy` (`wrangler pages deploy dist`).
- Data: R2 bucket `whatsapp-chats`, bound as `env.CHATS` in `wrangler.toml`.
- Secrets on the Pages project: `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SECRET`. Changing a secret only takes effect after a redeploy.
- The GitHub repo also has a Vercel integration from before; Vercel can't run `functions/` or reach R2, so a Vercel build only serves a broken static shell. The Cloudflare URL is the real site.

## Commands
- `npm run pages:dev` — build and serve the full app (frontend + functions + local R2 in `.wrangler/`) at http://localhost:8788. Local creds live in `.dev.vars` (gitignored).
- `npm run dev` — Vite only; proxies `/api` to :8788, so run `pages:dev` alongside.
- `npm run lint` (oxlint), `npm run build`, `node test_parser.js` (parser tests).

## Layout
- `functions/api/_middleware.js` — every `/api/*` except `/api/login` requires the signed `session` cookie.
- `functions/api/login.js`, `logout.js`; `functions/api/chats/index.js` (list), `chats/[id]/index.js` (meta GET, DELETE), `chats/[id]/text.js`, `chats/[id]/meta.js`, `chats/[id]/media/[name].js` (GET/HEAD with Range, PUT).
- `functions/_lib/` — shared helpers (auth/cookie HMAC, JSON responses + validation, index.json store). Not routed.
- `src/utils/api.js` — the single frontend client and the API contract (shapes documented at the top). Keep backend and this file in sync.
- `src/App.jsx` — auth state, `/upload` vs list routing (pathname + history), opening chats.
- `src/components/` — `Login`, `ChatList`, `ChatView` (virtualised-ish paging, don't break its scroll logic), `Upload` (owner's page), plus modals/lightbox. `FileUpload` is the old local-only uploader, no longer used by App.
- `src/utils/parser.js` (WhatsApp transcript parsing), `src/utils/zip.js` (ZIP helpers + upload metadata), `src/utils/exporter.js`.

## R2 layout
`index.json` (chat list, summaries without `media`), `chats/<id>/chat.txt`, `chats/<id>/meta.json` (includes `media: string[]` and `primaryUser`), `chats/<id>/media/<file name>`. A chat appears in the list only after `meta` is PUT, so failed uploads stay hidden.

## Gotchas
- Pages Functions request bodies are capped at 100 MB: Upload skips files > 95 MB.
- `index.json` is read-modify-write with no locking; fine for one uploader.
- One shared login for viewing and uploading by design (owner chose not to have a separate upload password). Keep the "Upload a chat" menu item.
- Mobile is the primary target: keep 100dvh layout, safe-area insets, ≥44px tap targets, 16px inputs, no horizontal scroll at 360px.
- `.env` holds the owner's personal notes and is gitignored — never commit or print it.
- The Chrome extension may not be connected; headless checks work with puppeteer-core pointed at `/Applications/Google Chrome.app` (install it in a scratch dir, not the project).
