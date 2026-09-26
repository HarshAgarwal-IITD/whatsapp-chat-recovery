/**
 * Robust WhatsApp date parser.
 * Handles formats: M/D/YY, D/M/YY, M/D/YYYY, D/M/YYYY  (/ or - separator)
 * Disambiguation rule:
 *  - If one field is > 12 it must be the day
 *  - Otherwise favour D/M (international) because WhatsApp's default locale is usually D/M
 * Returns a Date (midnight local) or null.
 */
export function parseWADate(dateStr) {
  if (!dateStr) return null;
  const sep = /[-/]/.exec(dateStr)?.[0];
  if (!sep) return null;
  const parts = dateStr.split(sep).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  let [a, b, c] = parts;
  if (c < 100) c += c < 30 ? 2000 : 1900;

  const makeDate = (y, m, d) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  };

  // If a > 12 → must be day (D/M/Y)
  if (a > 12) return makeDate(c, b, a);
  // If b > 12 → must be month first (M/D/Y)
  if (b > 12) return makeDate(c, a, b);
  // Ambiguous: prefer D/M (international WhatsApp default)
  return makeDate(c, b, a) || makeDate(c, a, b);
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

export function parseWhatsAppChat(text) {
  const lines = text.split('\n');
  const messages = [];
  let currentMsg = null;

  const msgRegex = /^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[,، ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(?:-\s*)?([^:]+?):\s*(.*)/;
  const sysRegex = /^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[,، ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(.*)/;

  const attachedRegex  = /^[‎\s]*<attached:\s*(.+?)>$/i;
  const attachedRegex2 = /^[‎\s]*(.+?)\s*\(file attached\)$/i;

  for (let line of lines) {
    line = line.replace(/\u200E/g, '').replace(/\r/g, '').trim();
    if (!line) continue;

    const match = line.match(msgRegex);
    if (match) {
      if (currentMsg) messages.push(currentMsg);
      const rawText = match[4];
      const attachedMatch = rawText.match(attachedRegex) || rawText.match(attachedRegex2);
      const parsedDate = parseWADate(match[1]);
      currentMsg = {
        date: match[1],
        parsedDate,
        time: match[2],
        sender: match[3].trim(),
        text: attachedMatch ? null : rawText,
        attachment: attachedMatch ? attachedMatch[1].trim() : null,
        isSystem: false,
      };
      continue;
    }

    const sysMatch = line.match(sysRegex);
    if (sysMatch) {
      if (currentMsg) { messages.push(currentMsg); currentMsg = null; }
      const parsedDate = parseWADate(sysMatch[1]);
      messages.push({
        isSystem: true,
        date: sysMatch[1],
        parsedDate,
        time: sysMatch[2],
        text: sysMatch[3],
      });
      continue;
    }

    if (currentMsg) {
      currentMsg.text = (currentMsg.text || '') + '\n' + line;
    }
  }
  if (currentMsg) messages.push(currentMsg);
  return messages;
}
