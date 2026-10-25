// Helpers for reading WhatsApp exports (ZIP or folder) in the browser,
// shared by the local viewer (FileUpload) and the hosted upload page (Upload).

export const baseName = path => path.split('/').pop();

// macOS-zipped exports carry "__MACOSX/._name" resource forks that look like real files
export const isJunk = path => path.startsWith('__MACOSX/') || path.includes('/__MACOSX/') || baseName(path).startsWith('._') || baseName(path) === '.DS_Store';

/** Pick the chat transcript: "_chat.txt" (iOS), "WhatsApp Chat with …txt" (Android), else the largest .txt */
export function pickChatFile(candidates, getPath, getSize) {
  const txts = candidates.filter(c => !isJunk(getPath(c)) && /\.txt$/i.test(getPath(c)));
  return txts.find(c => baseName(getPath(c)) === '_chat.txt')
    || txts.find(c => /^whatsapp chat/i.test(baseName(getPath(c))))
    || txts.sort((a, b) => getSize(b) - getSize(a))[0];
}

/** Decode the transcript, handling UTF-8 (with or without BOM) and UTF-16 exports */
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

// ── Upload page helpers ──────────────────────────────────────────────

/** "WhatsApp Chat - Mum (1).zip" → "Mum" */
export function deriveChatName(fileName) {
  const name = (fileName || '')
    .replace(/\.zip$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/^WhatsApp Chat\s*(?:-|with)\s*/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
  return name || 'Untitled chat';
}

const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', webm: 'video/webm',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr',
  pdf: 'application/pdf', vcf: 'text/vcard', txt: 'text/plain; charset=utf-8',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

export function contentTypeFor(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

const ATTACH_LABELS = [
  [/^(jpe?g|png|gif|webp|heic|heif|bmp)$/, '📷 Photo'],
  [/^(mp4|m4v|mov|3gp|webm|mkv|avi)$/, '🎥 Video'],
  [/^(opus|ogg|oga|mp3|m4a|aac|wav|amr)$/, '🎤 Audio'],
  [/^vcf$/, '👤 Contact'],
];

function attachmentLabel(name) {
  const ext = name.split('.').pop().toLowerCase();
  const hit = ATTACH_LABELS.find(([re]) => re.test(ext));
  return hit ? hit[1] : `📎 ${name}`;
}

/** Combine a parsed day (midnight local) with a normalized time like "9:26:35 PM" or "21:26" */
export function combineDateTime(day, time) {
  if (!(day instanceof Date) || isNaN(day)) return null;
  const d = new Date(day);
  const m = (time || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP])M)?$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = m[4]?.toUpperCase();
    if (ap === 'P' && h < 12) h += 12;
    if (ap === 'A' && h === 12) h = 0;
    d.setHours(h, Number(m[2]), Number(m[3] || 0), 0);
  }
  return d;
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** { lastMessage, lastSender, lastDate, messageCount } for the chat list */
export function summarizeMessages(messages) {
  const real = messages.filter(m => !m.isSystem);
  const last = real[real.length - 1];
  if (!last) return { lastMessage: '', lastSender: null, lastDate: null, messageCount: 0 };
  const text = last.text?.trim() || (last.attachment ? attachmentLabel(last.attachment) : '');
  const date = combineDateTime(last.parsedDate, last.time);
  return {
    lastMessage: truncate(text.replace(/\s+/g, ' '), 120),
    lastSender: last.sender || null,
    lastDate: date ? date.toISOString() : null,
    messageCount: real.length,
  };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
