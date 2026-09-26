// Run with: node test_parser.js
import assert from 'node:assert/strict';
import { parseWhatsAppChat, detectDateOrder } from './src/utils/parser.js';

const LRM = '‎';
const ymd = d => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('iOS export: BOM, attachments, system lines, multi-line', () => {
  const chat = '﻿' + [
    `[6/15/18, 9:26:35 PM] Hanuman: ${LRM}Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.`,
    `${LRM}[6/15/18, 9:26:35 PM] Tshering Gyeltshen: ${LRM}<attached: 00000002-PHOTO-2018-06-15-21-26-35.jpg>`,
    `[6/7/18, 11:23:10 AM] Tshering Gyeltshen: 5-769 prs,6-1345 prs`,
    `[9/29/18, 1:33:35 PM] Tshering Gyeltshen: Beret cap size`,
    `No.6-36,No.7-43,`,
    ``,
    `  indented line`,
    `[9/29/18, 1:41:01 PM] Hanuman: Report.pdf • 3 pages ${LRM}<attached: 00000010-Report.pdf>`,
    `[8/12/18, 12:38:54 AM] Hanuman changed the subject to "Trip: Goa"`,
  ].join('\r\n');

  const msgs = parseWhatsAppChat(chat);
  assert.equal(msgs.length, 6);
  assert.equal(msgs[0].isSystem, true);
  assert.match(msgs[0].text, /^Messages and calls/);
  assert.equal(msgs[1].attachment, '00000002-PHOTO-2018-06-15-21-26-35.jpg');
  assert.equal(msgs[1].text, null);
  assert.equal(ymd(msgs[2].parsedDate), '2018-6-7', 'ambiguous date follows the export\'s M/D order');
  assert.equal(msgs[3].text, 'Beret cap size\nNo.6-36,No.7-43,\n\n  indented line');
  assert.equal(msgs[4].attachment, '00000010-Report.pdf');
  assert.equal(msgs[4].text, 'Report.pdf • 3 pages');
  assert.equal(msgs[5].isSystem, true);
  assert.equal(msgs[5].text, 'Hanuman changed the subject to "Trip: Goa"');
  assert.equal(msgs[1].time, '9:26:35 PM');
});

test('Android export: 24h, D/M/YYYY, file attached + caption, system lines', () => {
  const chat = [
    '15/06/2018, 21:26 - Messages and calls are end-to-end encrypted.',
    '15/06/2018, 21:27 - Amit: IMG-20180615-WA0001.jpg (file attached)',
    'look at this',
    '03/07/2018, 09:05 - Priya left',
    'stray line after system message',
    '03/07/2018, 09:06 - +91 98765 43210: hi: there',
  ].join('\n');

  const msgs = parseWhatsAppChat(chat);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].isSystem, true);
  assert.equal(msgs[1].sender, 'Amit');
  assert.equal(msgs[1].attachment, 'IMG-20180615-WA0001.jpg');
  assert.equal(msgs[1].text, 'look at this');
  assert.equal(ymd(msgs[2].parsedDate), '2018-7-3');
  assert.equal(msgs[2].text, 'Priya left\nstray line after system message');
  assert.equal(msgs[3].sender, '+91 98765 43210');
  assert.equal(msgs[3].text, 'hi: there');
});

test('Locale variants: dotted dates, a.m./p.m., year-first, 2-digit years', () => {
  const de = parseWhatsAppChat('15.06.18, 21.26 - Jan: Hallo\n16.06.18, 08:00 - Jan: Morgen');
  assert.equal(de.length, 2);
  assert.equal(ymd(de[0].parsedDate), '2018-6-15');
  assert.equal(de[0].time, '21:26');

  const es = parseWhatsAppChat('[3/7/31, 9:05:00 p. m.] Ana: hola');
  assert.equal(es[0].time, '9:05:00 PM');
  assert.equal(es[0].parsedDate.getFullYear(), 2031);

  const iso = parseWhatsAppChat('2018/06/15 21:26 - Li: 你好');
  assert.equal(ymd(iso[0].parsedDate), '2018-6-15');
});

test('Date order detection', () => {
  assert.equal(detectDateOrder(['6/15/18', '6/7/18']), 'MDY');
  assert.equal(detectDateOrder(['15/6/18', '7/6/18']), 'DMY');
  assert.equal(detectDateOrder(['2018-06-15']), 'YMD');
  // Nothing >12: pick the order that keeps the chat chronological
  assert.equal(detectDateOrder(['1/2/20', '1/3/20', '1/4/20', '2/1/20']), 'MDY');
  assert.equal(detectDateOrder(['2/1/20', '3/1/20', '4/1/20', '1/2/20']), 'DMY');
});

test('Garbage input yields no messages', () => {
  assert.equal(parseWhatsAppChat('hello\nworld').length, 0);
  assert.equal(parseWhatsAppChat('').length, 0);
});

console.log(`\n${passed} tests passed`);
