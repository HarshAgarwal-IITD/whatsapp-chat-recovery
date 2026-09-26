/** Split a raw WhatsApp date ("6/15/18", "15.06.2018", "2018-06-15") into numbers */
function dateParts(dateStr) {
  const parts = dateStr.replace(/\.$/, '').split(/[./-]/).map(Number);
  return parts.length === 3 && !parts.some(isNaN) ? parts : null;
}

function makeDate(y, m, d) {
  if (y < 100) y += 2000; // WhatsApp didn't exist before 2009
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

function dateInOrder([a, b, c], order) {
  if (order === 'YMD') return makeDate(a, b, c);
  if (order === 'MDY') return makeDate(c, a, b);
  return makeDate(c, b, a);
}

/**
 * Work out the date field order used by a whole export: 'DMY', 'MDY' or 'YMD'.
 * A single export always uses one locale, so decide once from every date in it
 * rather than guessing per line (which turns "6/7/18" into July in a US export).
 *  - A 4-digit or >31 first field means year first
 *  - A first field >12 means D/M, a second field >12 means M/D
 *  - Otherwise pick whichever order keeps the chat closest to chronological
 */
export function detectDateOrder(dateStrs) {
  const all = dateStrs.map(dateParts).filter(Boolean);
  if (all.length === 0) return 'DMY';
  if (all.some(([a]) => a > 31)) return 'YMD';

  const dayFirst   = all.filter(([a]) => a > 12).length;
  const monthFirst = all.filter(([, b]) => b > 12).length;
  if (dayFirst || monthFirst) return dayFirst >= monthFirst ? 'DMY' : 'MDY';

  const inversions = (order) => {
    let prev = null, count = 0;
    for (const p of all) {
      const t = dateInOrder(p, order)?.getTime();
      if (t == null) { count++; continue; }
      if (prev != null && t < prev) count++;
      prev = t;
    }
    return count;
  };
  return inversions('MDY') < inversions('DMY') ? 'MDY' : 'DMY';
}

/**
 * Parse a WhatsApp date string into a Date (midnight local), or null.
 * Pass the export's `order` from detectDateOrder(); without it the order is
 * guessed from this one string, preferring D/M when ambiguous.
 */
export function parseWADate(dateStr, order) {
  if (!dateStr) return null;
  const parts = dateParts(dateStr);
  if (!parts) return null;
  if (order) return dateInOrder(parts, order);

  const [a, b] = parts;
  if (a > 31) return dateInOrder(parts, 'YMD');
  if (a > 12) return dateInOrder(parts, 'DMY');
  if (b > 12) return dateInOrder(parts, 'MDY');
  return dateInOrder(parts, 'DMY') || dateInOrder(parts, 'MDY');
}

/**
 * Format a Date into a WhatsApp-style date separator label.
 * Falls back to the raw string if parsing failed.
 */
export function formatDateLabel(date, rawDate) {
  if (!date) {
    // prettify raw string like "6/15/18" → "15 Jun 18" if possible, else return as-is
    return rawDate || 'Unknown date';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - msgDay) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Show full date: "15 June 2018"
  return date.toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
  });
}

/** YYYY-MM-DD bucket key for grouping messages by day */
export function dateBucket(date) {
  if (!date) return 'unknown';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First and last day in the chat as { min, max } YYYY-MM-DD, or null if no dates parsed */
export function getDateBounds(messages) {
  let min = null, max = null;
  messages.forEach(m => {
    if (!m.parsedDate) return;
    const b = dateBucket(m.parsedDate);
    if (!min || b < min) min = b;
    if (!max || b > max) max = b;
  });
  return min ? { min, max } : null;
}

/** Messages whose day falls within range ({ from, to } inclusive); all messages if range is null */
export function filterByRange(messages, range) {
  if (!range) return messages;
  return messages.filter(m => {
    if (!m.parsedDate) return false;
    const b = dateBucket(m.parsedDate);
    return b >= range.from && b <= range.to;
  });
}


// Direction / zero-width marks WhatsApp sprinkles into exports (LRM, RLM, bidi embeddings, BOM)
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const DATE = String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\.?`;
const TIME = String.raw`\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*(?:[aApP]\.?\s?[mM]\.?|上午|下午|午前|午後))?`;
// iOS:     "[15/06/18, 9:26:35 PM] Name: text"
// Android: "15/06/2018, 21:26 - Name: text"
const HEADER = new RegExp(String.raw`^\[?(${DATE})[,،]?\s+(${TIME})\]?\s*(?:[-–~]\s*)?(.*)$`);
const SENDER = /^(.+?):(?:\s+|$)(.*)$/;

// A "sender" containing one of these is really a system line that happens to contain ": "
// e.g. `Alice changed the subject to "Trip: Goa"`
const SYSTEM_IN_SENDER = / (?:created (?:group|this group)|added|removed|left|joined using|changed (?:the|this|their|his|her|your|to)|deleted|pinned a message|turned (?:on|off)|updated the|is now an admin|'s security code)\b/i;
// iOS writes group events as "Group Name: <LRM><event>", with a direction mark before the event
const SYSTEM_TEXT = /^(?:messages and calls are end-to-end encrypted|.*\b(?:created group|created this group|added|removed|left|joined using this group's invite link|changed the (?:subject|group)|changed this group's|changed their phone number|security code (?:with|changed)|turned (?:on|off) disappearing|disappearing messages|is now an admin|pinned a message)\b)/i;

const ATTACHED_INLINE = /<(?:attached|adjunto|anexado|anhang|allegato|pièce jointe|bijlage)\s*:\s*([^>]+?)\s*>/i;
const ATTACHED_ANDROID = /^(.+?)\s*\((?:file attached|archivo adjunto|arquivo anexado|datei angehängt|fichier joint|file allegato|bestand bijgevoegd)\)$/i;

function normalizeTime(time) {
  return time
    .replace(/\s+/g, ' ')
    .replace(/(\d)\.(\d{2})/g, '$1:$2')
    .replace(/\s?(上午|午前)$/, ' AM')
    .replace(/\s?(下午|午後)$/, ' PM')
    .replace(/\s?([aApP])\.?\s?[mM]\.?$/, (_, p) => ` ${p.toUpperCase()}M`)
    .trim();
}

/** Pull an attachment filename out of a message body; the rest becomes the caption */
function splitAttachment(text) {
  const inline = text.match(ATTACHED_INLINE);
  if (inline) {
    const caption = (text.slice(0, inline.index) + text.slice(inline.index + inline[0].length)).trim();
    return { attachment: inline[1], text: caption || null };
  }
  const [first, ...rest] = text.split('\n');
  const android = first.trim().match(ATTACHED_ANDROID);
  if (android) {
    const caption = rest.join('\n').trim();
    return { attachment: android[1], text: caption || null };
  }
  return { attachment: null, text: text || null };
}

function finalize(msg) {
  const text = msg.lines.join('\n').replace(/\s+$/, '');
  delete msg.lines;
  if (msg.isSystem) {
    msg.text = text;
    return msg;
  }
  return Object.assign(msg, splitAttachment(text));
}

export function parseWhatsAppChat(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n|\u2028/);
  const messages = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(INVISIBLE, '');
    const header = line.trim().match(HEADER);

    if (!header) {
      // Continuation of a multi-line message; keep blank lines and indentation
      if (current) current.lines.push(line.trimEnd());
      continue;
    }

    if (current) messages.push(finalize(current));
    const [, date, time, rest] = header;
    const base = { date, parsedDate: null, time: normalizeTime(time) };
    const sender = rest.match(SENDER);

    if (!sender || SYSTEM_IN_SENDER.test(' ' + sender[1])) {
      current = { ...base, isSystem: true, lines: [rest] };
    } else if (/:\s*[\u200E\u200F]/.test(raw) && SYSTEM_TEXT.test(sender[2])) {
      current = { ...base, isSystem: true, lines: [sender[2]] };
    } else {
      current = { ...base, isSystem: false, sender: sender[1].trim(), lines: [sender[2]] };
    }
  }
  if (current) messages.push(finalize(current));

  // Resolve dates once the whole export's date order is known
  const order = detectDateOrder(messages.map(m => m.date));
  const cache = new Map();
  for (const m of messages) {
    if (!cache.has(m.date)) cache.set(m.date, parseWADate(m.date, order));
    m.parsedDate = cache.get(m.date);
  }
  return messages;
}
