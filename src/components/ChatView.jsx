import { memo, useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { dateBucket, formatDateLabel } from '../utils/parser';

const IMG_EXTS   = new Set(['jpg','jpeg','png','gif','webp']);
const VIDEO_EXTS = new Set(['mp4','mov']);
const AUDIO_EXTS = new Set(['opus','ogg','mp3','aac','m4a']);

// Only the newest PAGE items are mounted at first; older ones are
// prepended in PAGE-sized chunks as the user scrolls up.
const PAGE = 200;
const LOAD_MORE_THRESHOLD = 1200; // px from top at which older messages load
const STICK_THRESHOLD     = 120;  // px from bottom that counts as "at bottom"

function attachType(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (IMG_EXTS.has(ext))   return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'file';
}

function MediaAttachment({ filename, mediaMap }) {
  const [expanded, setExpanded] = useState(false);
  const url  = mediaMap[filename];
  const type = attachType(filename);

  if (!url) return (
    <div className="attachment attachment-missing">
      <span>📎</span><span className="attach-name">{filename}</span>
    </div>
  );

  if (type === 'image') return (
    <div className={`attachment attachment-image ${expanded ? 'expanded' : ''}`}>
      <img src={url} alt={filename} loading="lazy" decoding="async"
        onClick={() => setExpanded(v => !v)} className="chat-image" />
    </div>
  );

  if (type === 'video') return (
    <div className="attachment attachment-video">
      <video controls playsInline preload="metadata" className="chat-video"><source src={url}/></video>
    </div>
  );

  if (type === 'audio') return (
    <div className="attachment attachment-audio">
      <span className="audio-icon">🎤</span>
      <audio controls preload="none" className="chat-audio"><source src={url}/></audio>
    </div>
  );

  return (
    <div className="attachment attachment-file">
      <span>📄</span>
      <a href={url} download={filename} className="attach-link">{filename}</a>
    </div>
  );
}

function fmtTime(raw = '') {
  // "9:26:35 PM" → "9:26 PM"
  return raw.replace(/:\d{2}(\s*[aApP][mM])/, '$1').trim();
}

const WA_COLORS = ['#e06c75','#e5c07b','#98c379','#56b6c2','#61afef','#c678dd','#d19a66'];
function senderColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return WA_COLORS[Math.abs(h) % WA_COLORS.length];
}

const MessageRow = memo(function MessageRow({ msg, isPrimary, isLast, showName, mediaMap }) {
  return (
    <div className={`message-wrapper ${isPrimary ? 'sent' : 'received'} ${isLast ? 'tail' : ''}`}>
      <div className="message-bubble">
        {showName && (
          <div className="sender-name" style={{ color: senderColor(msg.sender) }}>
            {msg.sender}
          </div>
        )}
        {msg.attachment && (
          <MediaAttachment filename={msg.attachment} mediaMap={mediaMap} />
        )}
        {msg.text && <div className="message-text">{msg.text}</div>}
        <div className="message-meta">
          <span className="message-time">{fmtTime(msg.time)}</span>
          {isPrimary && <span className="tick-icon" aria-label="read">✓✓</span>}
        </div>
      </div>
    </div>
  );
});

export default function ChatView({ messages, primaryUser, mediaMap = {}, onChangeUser, onBack }) {
  const scrollRef   = useRef(null);
  const contentRef  = useRef(null);
  const stickRef    = useRef(true);   // pinned to bottom?
  const prependRef  = useRef(null);   // { height, top } snapshot before loading older items
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [showJump, setShowJump] = useState(false);

  const uniqueSenders = useMemo(() => {
    const s = new Set();
    messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [messages]);

  const chatName = useMemo(() => {
    const others = uniqueSenders.filter(s => s !== primaryUser);
    if (!others.length) return uniqueSenders[0] || 'Chat';
    if (others.length === 1) return others[0];
    return `${others[0]} +${others.length - 1}`;
  }, [uniqueSenders, primaryUser]);

  const mediaCount = Object.keys(mediaMap).length;
  const msgCount   = useMemo(() => messages.filter(m => !m.isSystem).length, [messages]);

  // Flatten into render items (date separators + messages) with grouping info
  // precomputed in a single O(n) pass.
  const renderItems = useMemo(() => {
    const items = [];
    let lastBucket = null;
    messages.forEach((msg, idx) => {
      const bucket = dateBucket(msg.parsedDate);
      if (bucket !== lastBucket) {
        items.push({ type: 'date', label: formatDateLabel(msg.parsedDate, msg.date), key: `d-${idx}` });
        lastBucket = bucket;
      }
      items.push({ type: 'msg', msg, key: `m-${idx}` });
    });
    items.forEach((item, i) => {
      if (item.type !== 'msg' || item.msg.isSystem) return;
      const prev = items[i - 1];
      const next = items[i + 1];
      const sameSender = other =>
        other?.type === 'msg' && !other.msg.isSystem && other.msg.sender === item.msg.sender;
      item.isFirst = !sameSender(prev);
      item.isLast  = !sameSender(next);
    });
    return items;
  }, [messages]);

  const start = Math.max(0, renderItems.length - visibleCount);
  const visibleItems = renderItems.slice(start);
  const hasMore = start > 0;

  // Start at the bottom
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // After older items are prepended, keep the viewport on the same message
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const snap = prependRef.current;
    if (!el || !snap) return;
    el.scrollTop = snap.top + (el.scrollHeight - snap.height);
    prependRef.current = null;
  }, [visibleCount]);

  // Stay pinned to the bottom while media above finishes loading
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current && !prependRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = fromBottom < STICK_THRESHOLD;
    setShowJump(fromBottom > 600);

    if (hasMore && !prependRef.current && el.scrollTop < LOAD_MORE_THRESHOLD) {
      prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setVisibleCount(c => c + PAGE);
    }
  }, [hasMore]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="chat-view">
      {/* WA-style header */}
      <div className="wa-header">
        <button className="wa-back-btn" onClick={onBack} aria-label="Upload another chat">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="wa-avatar">{chatName.charAt(0).toUpperCase()}</div>
        <div className="wa-header-info">
          <div className="wa-contact-name">{chatName}</div>
          <div className="wa-contact-sub">
            {msgCount.toLocaleString()} msgs
            {mediaCount > 0 && ` · ${mediaCount.toLocaleString()} media`}
          </div>
        </div>
        <button className="wa-user-btn" onClick={onChangeUser} title="Change who you are">
          <span className="wa-user-label">You:</span>
          <span className="wa-user-name">{primaryUser || 'Not set'}</span>
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages-container" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-messages-scroll-area" ref={contentRef}>
          {hasMore && <div className="load-more-hint">Loading older messages…</div>}
          {visibleItems.map(item => {
            if (item.type === 'date') {
              return (
                <div key={item.key} className="date-separator">
                  <span className="date-separator-label">{item.label}</span>
                </div>
              );
            }

            const { msg } = item;
            if (msg.isSystem) {
              return (
                <div key={item.key} className="system-message">
                  <span className="system-text">{msg.text}</span>
                </div>
              );
            }

            const isPrimary = msg.sender === primaryUser;
            return (
              <MessageRow
                key={item.key}
                msg={msg}
                isPrimary={isPrimary}
                isLast={item.isLast}
                showName={!isPrimary && item.isFirst && uniqueSenders.length > 1}
                mediaMap={mediaMap}
              />
            );
          })}
        </div>
      </div>

      {showJump && (
        <button className="jump-bottom-btn" onClick={jumpToBottom} aria-label="Scroll to latest message">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}
