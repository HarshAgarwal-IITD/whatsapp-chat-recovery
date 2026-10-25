# WhatsApp Chat Viewer

A private website for reading exported WhatsApp chats, built to look and feel like WhatsApp on a phone.

- Upload a WhatsApp export (`.zip` with media) at `/upload`; it's unzipped in your browser and stored in Cloudflare R2.
- Log in with one shared ID/password and pick a chat from the list to read it, with photos, videos, voice notes, date filtering and export to PDF/HTML/text.
- Works as a home-screen app on iPhone/Android ("Add to Home Screen").

**Live:** https://whatsapp-chats-cdx.pages.dev

## How it's hosted
Everything runs on Cloudflare (free tier):

| Part | Service |
|---|---|
| Frontend (React + Vite, `dist/`) | Cloudflare Pages, project `whatsapp-chats` |
| Backend API (`functions/`) | Cloudflare Pages Functions |
| Chats and media | Cloudflare R2 bucket `whatsapp-chats` |
| Login ID, password, cookie key | Pages secrets `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SECRET` |

## Develop
```sh
npm install
# local secrets for testing (gitignored)
printf 'APP_USERNAME=papa\nAPP_PASSWORD=test123\nSESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
npm run pages:dev        # full app at http://localhost:8788
npm run lint && node test_parser.js
```

## Deploy
```sh
npx wrangler login       # once
npm run deploy           # builds and uploads frontend + functions
```

Change the login:
```sh
npx wrangler pages secret put APP_PASSWORD --project-name whatsapp-chats
npm run deploy           # secrets apply on the next deployment
```

## Limits
- Single media files over 95 MB are skipped on upload (Pages Functions 100 MB request limit).
- R2 free tier: 10 GB storage, then about $0.015/GB-month.
