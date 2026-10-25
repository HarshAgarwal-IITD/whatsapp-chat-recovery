import { memo, useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { dateBucket, formatDateLabel } from '../utils/parser';
import MediaLightbox from './MediaLightbox';
import ExportModal from './ExportModal';

const IMG_EXTS   = new Set(['jpg','jpeg','png','gif','webp']);
const VIDEO_EXTS = new Set(['mp4','mov']);
const AUDIO_EXTS = new Set(['opus','ogg','mp3','aac','m4a']);

// The chat is shown one page of PAGE_SIZE messages at a time (newest page first), so the
// DOM stays small however long the chat is; buttons at either end switch pages.
const PAGE_SIZE       = 100;
const STICK_THRESHOLD = 120;  // px from bottom that counts as "at bottom"

function attachType(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (IMG_EXTS.has(ext))   return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'file';
}

function MediaAttachment({ filename, mediaMap, onOpenMedia }) {
  const url  = mediaMap[filename];
  const type = attachType(filename);

  if (!url) return (
    <div className="attachment attachment-missing">
      <span>📎</span><span className="attach-name">{filename}</span>
    </div>
  );

  if (type === 'image') return (
    <div className="attachment attachment-image">
      <img src={url} alt={filename} loading="lazy" decoding="async"
        onClick={() => onOpenMedia(filename)} className="chat-image" />
    </div>
  );

  if (type === 'video') return (
    <button className="attachment attachment-video" onClick={() => onOpenMedia(filename)} aria-label="Play video">
      {/* #t=0.1 makes mobile browsers render the first frame as a preview */}
      <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="chat-video" tabIndex={-1} />
      <span className="video-play-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="8 5 19 12 8 19" /></svg>
      </span>
    </button>
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
  // "9:26:35 PM" → "9:26 PM", "21:26:35" → "21:26"
  return raw.replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1').trim();
}

const WA_COLORS = ['#e06c75','#e5c07b','#98c379','#56b6c2','#61afef','#c678dd','#d19a66'];
function senderColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return WA_COLORS[Math.abs(h) % WA_COLORS.length];
}

// "2018-06-15" → "15 Jun 2018"
function fmtIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MessageRow = memo(function MessageRow({ msg, isPrimary, isLast, showName, mediaMap, onOpenMedia }) {
  return (
    <div className={`message-wrapper ${isPrimary ? 'sent' : 'received'} ${isLast ? 'tail' : ''}`}>
      <div className="message-bubble">
        {showName && (
          <div className="sender-name" style={{ color: senderColor(msg.sender) }}>
            {msg.sender}
          </div>
        )}
        {msg.attachment && (
          <MediaAttachment filename={msg.attachment} mediaMap={mediaMap} onOpenMedia={onOpenMedia} />
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

export default function ChatView({
  messages, senders, primaryUser, mediaMap = {},
  dateRange, onOpenDateRange, onClearDateRange, onChangeUser, onBack,
  title, onRename,
}) {
  const scrollRef   = useRef(null);
  const contentRef  = useRef(null);
  const stickRef    = useRef(true);   // pinned to bottom?
  const landRef     = useRef('bottom'); // where to put the viewport after a page change
  const pageCount   = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  const lastPage    = pageCount - 1;
  const [page, setPage] = useState(lastPage);
  const [showJump, setShowJump] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showExport, setShowExport] = useState(false);

  // Senders come from the whole chat so the title doesn't change when filtering
  const uniqueSenders = senders;

  // Saved chat name wins; otherwise name the chat after the other participants
  const chatName = useMemo(() => {
    if (title) return title;
    const others = uniqueSenders.filter(s => s !== primaryUser);
    if (!others.length) return uniqueSenders[0] || 'Chat';
    if (others.length === 1) return others[0];
    return `${others[0]} +${others.length - 1}`;
  }, [title, uniqueSenders, primaryUser]);

  const mediaCount = Object.keys(mediaMap).length;
  const msgCount   = useMemo(() => messages.filter(m => !m.isSystem).length, [messages]);

  // Flatten the current page into render items (date separators + messages) with grouping
  // info precomputed in a single O(n) pass. Each page opens with its date separator.
  const renderItems = useMemo(() => {
    const items = [];
    let lastBucket = null;
    const offset = page * PAGE_SIZE;
    messages.slice(offset, offset + PAGE_SIZE).forEach((msg, i) => {
      const idx = offset + i;
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
  }, [messages, page]);

  // Every viewable image and video in the chat, in order — the lightbox navigates through these
  const mediaItems = useMemo(() => {
    const list = [];
    messages.forEach(m => {
      if (!m.attachment || !mediaMap[m.attachment]) return;
      const type = attachType(m.attachment);
      if (type !== 'image' && type !== 'video') return;
      list.push({
        type,
        url: mediaMap[m.attachment],
        name: m.attachment,
        sender: m.sender,
        caption: `${formatDateLabel(m.parsedDate, m.date)} · ${fmtTime(m.time)}`,
      });
    });
    return list;
  }, [messages, mediaMap]);

  const onOpenMedia = useCallback(filename => {
    const i = mediaItems.findIndex(it => it.name === filename);
    if (i !== -1) setLightboxIndex(i);
  }, [mediaItems]);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  // Going to an older page lands at its bottom (reading continues upwards), a newer page at
  // its top; the first render lands at the bottom of the newest page
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = landRef.current === 'bottom';
    el.scrollTop = bottom ? el.scrollHeight : 0;
    stickRef.current = bottom;
    setShowJump(page < lastPage);
  }, [page, lastPage]);

  const goToPage = (next, land) => {
    landRef.current = land;
    setPage(next);
  };

  // Stay pinned to the bottom while media above finishes loading
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = fromBottom < STICK_THRESHOLD;
    setShowJump(page < lastPage || fromBottom > 600);
  }, [page, lastPage]);

  const jumpToBottom = () => {
    if (page < lastPage) { goToPage(lastPage, 'bottom'); return; }
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const headerInfo = (
    <>
      <div className="wa-contact-name">
        <span className="wa-contact-name-text">{chatName}</span>
        {onRename && (
          <svg className="wa-rename-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        )}
      </div>
      <div className="wa-contact-sub">
        {msgCount.toLocaleString()} msgs
        {mediaCount > 0 && ` · ${mediaCount.toLocaleString()} media`}
      </div>
    </>
  );

  return (
    <div className="chat-view">
      {/* WA-style header */}
      <div className="wa-header">
        <button className="wa-back-btn" onClick={onBack} aria-label="Back to chats" title="Back to chats">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="wa-avatar">{chatName.charAt(0).toUpperCase()}</div>
        {onRename ? (
          <button className="wa-header-info wa-header-info-btn" onClick={onRename} title="Rename chat" aria-label={`${chatName}. Rename chat`}>
            {headerInfo}
          </button>
        ) : (
          <div className="wa-header-info">{headerInfo}</div>
        )}
        {onOpenDateRange && (
          <button
            className={`wa-icon-btn ${dateRange ? 'active' : ''}`}
            onClick={onOpenDateRange}
            aria-label="Filter by date range"
            title="Filter by date range"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}
        <button
          className="wa-icon-btn"
          onClick={() => setShowExport(true)}
          aria-label="Export chat"
          title="Export chat"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button className="wa-user-btn" onClick={onChangeUser} title="Change who you are" aria-label={`You: ${primaryUser || 'Not set'}. Change who you are`}>
          <svg className="wa-user-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
          </svg>
          <span className="wa-user-label">You:</span>
          <span className="wa-user-name">{primaryUser || 'Not set'}</span>
        </button>
      </div>

      {dateRange && (
        <div className="range-bar">
          <button className="range-bar-label" onClick={onOpenDateRange}>
            📅 {fmtIsoDate(dateRange.from)} – {fmtIsoDate(dateRange.to)}
          </button>
          <button className="range-bar-clear" onClick={onClearDateRange} aria-label="Clear date filter">✕</button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="chat-empty">
          <p>No messages in this date range.</p>
          <button className="range-apply-btn" onClick={onOpenDateRange}>Change dates</button>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages-container" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-messages-scroll-area" ref={contentRef}>
          {page > 0 && (
            <div className="page-nav">
              <button className="page-nav-btn" onClick={() => goToPage(page - 1, 'bottom')}>↑ Older messages</button>
              <span className="page-nav-label">Page {page + 1} of {pageCount}</span>
            </div>
          )}
          {renderItems.map(item => {
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
                onOpenMedia={onOpenMedia}
              />
            );
          })}
          {page < lastPage && (
            <div className="page-nav">
              <span className="page-nav-label">Page {page + 1} of {pageCount}</span>
              <button className="page-nav-btn" onClick={() => goToPage(page + 1, 'top')}>Newer messages ↓</button>
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={mediaItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      )}

      {showExport && (
        <ExportModal
          messages={messages}
          mediaMap={mediaMap}
          chatName={chatName}
          primaryUser={primaryUser}
          dateRange={dateRange}
          onClose={() => setShowExport(false)}
        />
      )}

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
