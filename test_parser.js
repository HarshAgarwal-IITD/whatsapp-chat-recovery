function parseWhatsAppChat(text) {
  const lines = text.split('\n');
  const messages = [];
  let currentMsg = null;

  const regexGen = /^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[, ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(?:-\s*)?([^:]+?):\s*(.*)/;

  for (let line of lines) {
    line = line.replace(/\u200E/g, '').replace(/\r/g, '').trim(); // Remove invisible markers and carriage returns
    if (!line) continue;

    const match = line.match(regexGen);
    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
      }
      currentMsg = {
        date: match[1],
        time: match[2],
        sender: match[3].trim(),
        text: match[4],
      };
    } else {
      if (currentMsg) {
        currentMsg.text += '\n' + line;
      } else {
        const sysMatch = line.match(/^\[?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[, ]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]?[aApP][mM])?)\]?\s*(.*)/);
        if (sysMatch) {
            messages.push({
                isSystem: true,
                date: sysMatch[1],
                time: sysMatch[2],
                text: sysMatch[3]
            });
        }
      }
    }
  }
  if (currentMsg) messages.push(currentMsg);
  
  return messages;
}

const sample = `[6/15/18, 9:26:35 PM] Hanuman: ‎Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
‎[6/15/18, 9:26:35 PM] Tshering Gyeltshen: ‎<attached: 00000002-PHOTO-2018-06-15-21-26-35.jpg>
[7/31/18, 11:23:10 AM] Tshering Gyeltshen: 5-769 prs,6-1345 prs,7-1193 prs,8-507 prs,9-149 prs,10-2 prs,11-1pr.
[9/29/18, 1:33:35 PM] Tshering Gyeltshen: Beret cap size
No.6-36,No.7-43,No.8-21,
[9/29/18, 1:41:01 PM] Tshering Gyeltshen: Cap 100 nos.
[8/12/18, 12:38:54 AM] Hanuman created group "Group"`;

console.log(JSON.stringify(parseWhatsAppChat(sample), null, 2));
