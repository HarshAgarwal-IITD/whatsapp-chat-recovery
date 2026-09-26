/**
 * Parse a WhatsApp-style date string like "6/15/18", "15/06/2018", "15-06-18"
 * WhatsApp uses locale-dependent formats; we try both M/D/YY and D/M/YY and pick
 * the interpretation that produces a valid date.
 * Returns a Date object (midnight local time) or null.
 */
export function parseWADate(dateStr) {
  if (!dateStr) return null;
  const sep = dateStr.includes('-') ? '-' : '/';
  const parts = dateStr.split(sep).map(Number);
  if (parts.length !== 3) return null;

  let [a, b, c] = parts;
  // Normalize 2-digit year
  if (c < 100) c += c < 30 ? 2000 : 1900;

  // Try M/D/YYYY first (common in US WhatsApp exports)
  const tryMDY = new Date(c, a - 1, b);
  if (tryMDY.getFullYear() === c && tryMDY.getMonth() === a - 1 && tryMDY.getDate() === b && a >= 1 && a <= 12 && b >= 1 && b <= 31) {
    return tryMDY;
  }
  // Fallback: D/M/YYYY
  const tryDMY = new Date(c, b - 1, a);
  if (tryDMY.getFullYear() === c && tryDMY.getMonth() === b - 1 && tryDMY.getDate() === a && b >= 1 && b <= 12 && a >= 1 && a <= 31) {
    return tryDMY;
  }
  return null;
}

/**
 * Format a Date into a WhatsApp-style date separator label:
 *  - "Today" / "Yesterday"
 *  - Day name for messages within the last 7 days (e.g. "Monday")
 *  - "DD Month YYYY" for older messages
 */
export function formatDateLabel(date) {
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - msgDay) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Returns a string key "YYYY-MM-DD" used to group messages by day.
 */
export function dateBucket(date) {
  if (!date) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseWhatsAppChat(text) {
  const lines = text.split('\n');
  const messages = [];
  let currentMsg = null;

  // Matches: [D/M/YY, HH:MM:SS AM/PM] Sender: text  OR  D/M/YY, HH:MM - Sender: text
  const msgRegex = /^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[, ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(?:-\s*)?([^:]+?):\s*(.*)/;
  const sysRegex = /^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[, ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(.*)/;

  // Matches "<attached: filename>" or "filename (file attached)"
  const attachedRegex = /^[‎\s]*<attached:\s*(.+?)>$/i;
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
        isSystem: false
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
        text: sysMatch[3]
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
