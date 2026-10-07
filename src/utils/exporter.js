import { dateBucket } from './parser.js';

const IMG_EXTS   = new Set(['jpg','jpeg','png','gif','webp']);
const VIDEO_EXTS = new Set(['mp4','mov']);
const AUDIO_EXTS = new Set(['opus','ogg','mp3','aac','m4a']);

function attachKind(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (IMG_EXTS.has(ext))   return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'file';
}

const ATTACH_ICONS = { image: '🖼️', video: '🎥', audio: '🎤', file: '📄' };

const WA_COLORS = ['#c0392b','#b9770e','#1e8449','#117a65','#2471a3','#7d3c98','#a04000'];
function senderColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return WA_COLORS[Math.abs(h) % WA_COLORS.length];
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(raw = '') {
  return raw.replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1').trim();
}

// Absolute labels — "Today"/"Yesterday" would be wrong once the file is read later
function dayLabel(msg) {
  if (!msg.parsedDate) return msg.date || 'Unknown date';
  return msg.parsedDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** "WhatsApp Chat - Alice (2024-01-01 to 2024-03-31)" with filesystem-unsafe characters removed */
export function exportFileName(chatName, range, ext) {
  const suffix = range ? ` (${range.from} to ${range.to})` : '';
  const base = `WhatsApp Chat - ${chatName}${suffix}`.replace(/[\\/:*?"<>|]+/g, '_');
  return `${base}.${ext}`;
}

/** Plain-text export in WhatsApp's own "date, time - sender: text" layout */
export function buildText(messages) {
  return messages.map(m => {
    const head = `${m.date}, ${m.time} - `;
    if (m.isSystem) return head + (m.text || '');
    const parts = [];
    if (m.attachment) parts.push(`<attached: ${m.attachment}>`);
    if (m.text) parts.push(m.text);
    return `${head}${m.sender}: ${parts.join('\n')}`;
  }).join('\n');
}

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/**
 * Map of attachment filename → image src for the export.
 * `inline` turns blob: URLs into data: URLs so a saved HTML file is self-contained.
 */
export async function collectImageSources(messages, mediaMap, { inline }) {
  const out = {};
  const names = new Set(
    messages.filter(m => m.attachment && mediaMap[m.attachment] && attachKind(m.attachment) === 'image')
      .map(m => m.attachment)
  );
  for (const name of names) {
    if (!inline) { out[name] = mediaMap[name]; continue; }
    try {
      const blob = await (await fetch(mediaMap[name])).blob();
      out[name] = await blobToDataUrl(blob);
    } catch {
      // leave it out; the attachment is shown by name instead
    }
  }
  return out;
}

/** Standalone, print-friendly HTML document of the chat */
export function buildHtml({ messages, chatName, primaryUser, range, imageSrcs = {} }) {
  const multi = new Set(messages.filter(m => !m.isSystem).map(m => m.sender)).size > 1;
  const count = messages.filter(m => !m.isSystem).length;
  const rows = [];
  let lastBucket = null;
  let lastSender = null;

  for (const m of messages) {
    const bucket = m.parsedDate ? dateBucket(m.parsedDate) : m.date;
    if (bucket !== lastBucket) {
      rows.push(`<div class="day"><span>${esc(dayLabel(m))}</span></div>`);
      lastBucket = bucket;
      lastSender = null;
    }
    if (m.isSystem) {
      rows.push(`<div class="sys">${esc(m.text)}</div>`);
      lastSender = null;
      continue;
    }

    const mine = m.sender === primaryUser;
    const showName = multi && !mine && m.sender !== lastSender;
    lastSender = m.sender;

    let attach = '';
    if (m.attachment) {
      const src = imageSrcs[m.attachment];
      attach = src
        ? `<img src="${esc(src)}" alt="${esc(m.attachment)}">`
        : `<div class="file">${ATTACH_ICONS[attachKind(m.attachment)]} ${esc(m.attachment)}</div>`;
    }

    rows.push(
      `<div class="row ${mine ? 'me' : ''}"><div class="bubble">` +
      (showName ? `<div class="name" style="color:${senderColor(m.sender)}">${esc(m.sender)}</div>` : '') +
      attach +
      (m.text ? `<div class="text">${esc(m.text)}</div>` : '') +
      `<div class="time">${esc(fmtTime(m.time))}</div>` +
      `</div></div>`
    );
  }

  const rangeLine = range ? ` · ${esc(range.from)} to ${esc(range.to)}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`WhatsApp Chat - ${chatName}`)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Color Emoji', sans-serif;
    background: #efeae2; color: #111b21; font-size: 14px; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 40px; }
  header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #d1d7db; }
  h1 { font-size: 20px; font-weight: 600; }
  .meta { color: #667781; font-size: 12px; margin-top: 4px; }
  .day { text-align: center; margin: 14px 0 8px; break-after: avoid; }
  .day span { background: #fff; color: #54656f; font-size: 12px; padding: 4px 12px; border-radius: 8px; box-shadow: 0 1px 1px rgba(0,0,0,.08); }
  .sys { text-align: center; color: #54656f; font-size: 12px; margin: 6px auto; max-width: 80%; white-space: pre-wrap; }
  .row { display: flex; margin: 2px 0; break-inside: avoid; }
  .row.me { justify-content: flex-end; }
  .bubble { max-width: 75%; background: #fff; border-radius: 8px; padding: 6px 9px 4px; box-shadow: 0 1px 1px rgba(0,0,0,.08); overflow-wrap: anywhere; }
  .me .bubble { background: #d9fdd3; }
  .name { font-size: 12.5px; font-weight: 600; margin-bottom: 2px; }
  .text { white-space: pre-wrap; }
  .time { font-size: 11px; color: #667781; text-align: right; margin-top: 2px; }
  .file { font-size: 13px; color: #54656f; padding: 4px 0; }
  img { display: block; max-width: 100%; max-height: 360px; border-radius: 6px; margin-bottom: 4px; }
  @page { margin: 14mm 12mm; }
  @media print { .wrap { padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>${esc(chatName)}</h1>
  <div class="meta">${count.toLocaleString()} messages${rangeLine} · Exported ${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
</header>
${rows.join('\n')}
</div>
</body>
</html>`;
}

export function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the browser's print dialog for an HTML document (users pick "Save as PDF").
 * Printing from a hidden iframe keeps the app on screen and lets the document
 * reference the app's blob: media URLs directly.
 */
export function printHtml(html, title) {
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    const imgs = [...doc.images];
    const loaded = Promise.all(imgs.map(img =>
      img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })
    ));

    loaded.then(() => {
      const win = frame.contentWindow;
      // The PDF's suggested filename comes from the top document's title in some browsers
      const prevTitle = document.title;
      document.title = title;
      const cleanup = () => {
        document.title = prevTitle;
        frame.remove();
        resolve();
      };
      win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true });
      win.focus();
      win.print();
      // Safari/iOS may not fire afterprint; print() blocks on desktop so this runs after the dialog closes
      setTimeout(() => { if (frame.isConnected) cleanup(); }, 60000);
    });
  });
}
