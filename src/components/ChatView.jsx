import { useMemo, useEffect, useRef, useState } from 'react';
import { dateBucket, formatDateLabel } from '../utils/parser';

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO_EXTS = ['mp4', 'mov'];
const AUDIO_EXTS = ['opus', 'ogg', 'mp3', 'aac', 'm4a'];

function getAttachmentType(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (IMG_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  return 'file';
}

function MediaAttachment({ filename, mediaMap }) {
  const [expanded, setExpanded] = useState(false);
  const url = mediaMap[filename];
  const type = getAttachmentType(filename);

  if (!url) {
    return (
      <div className="attachment attachment-missing">
        <span className="attach-icon">📎</span>
        <span className="attach-name">{filename}</span>
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div className={`attachment attachment-image ${expanded ? 'expanded' : ''}`}>
        <img
          src={url}
          alt={filename}
          loading="lazy"
          onClick={() => setExpanded(v => !v)}
          className="chat-image"
        />
      </div>
    );
  }
  if (type === 'video') {
    return (
      <div className="attachment attachment-video">
        <video controls preload="metadata" className="chat-video">
          <source src={url} />
        </video>
      </div>
    );
  }
  if (type === 'audio') {
    return (
      <div className="attachment attachment-audio">
        <span className="audio-icon">🎤</span>
        <audio controls preload="metadata" className="chat-audio">
          <source src={url} />
        </audio>
      </div>
    );
  }
  return (
    <div className="attachment attachment-file">
      <span>📄</span>
      <a href={url} download={filename} className="attach-link">{filename}</a>
    </div>
  );
}

function DateSeparator({ label }) {
  return (
    <div className="date-separator">
      <span className="date-separator-label">{label}</span>
    </div>
  );
}

/** Normalise time string: strip seconds, ensure "9:26 PM" style */
function fmtTime(raw) {
  if (!raw) return '';
  // Remove seconds: "9:26:35 PM" → "9:26 PM"
  return raw.replace(/:\d{2}(\s*[aApP][mM])/, '$1').trim();
}

export default function ChatView({ messages, primaryUser, setPrimaryUser, mediaMap = {} }) {
  const scrollRef = useRef(null);

  const uniqueSenders = useMemo(() => {
    const s = new Set();
    messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, primaryUser]);

  const getSenderColor = (name) => {
    // WhatsApp uses a fixed palette of 7 colours for group member names
    const palette = [
      '#e06c75', '#e5c07b', '#98c379',
      '#56b6c2', '#61afef', '#c678dd', '#d19a66',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  const chatName = useMemo(() => {
    const others = uniqueSenders.filter(s => s !== primaryUser);
    if (others.length === 0) return uniqueSenders[0] || 'Chat';
    if (others.length === 1) return others[0];
    return `${others[0]} & ${others.length - 1} other${others.length > 2 ? 's' : ''}`;
  }, [uniqueSenders, primaryUser]);

  const mediaCount = Object.keys(mediaMap).length;
  const msgCount = messages.filter(m => !m.isSystem).length;

  // Build a render list: inject DateSeparator items where the day changes
  const renderItems = useMemo(() => {
    const items = [];
    let lastBucket = null;
    messages.forEach((msg, idx) => {
      const bucket = dateBucket(msg.parsedDate);
      if (bucket !== lastBucket) {
        items.push({ type: 'date', label: formatDateLabel(msg.parsedDate), key: `date-${bucket}-${idx}` });
        lastBucket = bucket;
      }
      items.push({ type: 'msg', msg, idx });
    });
    return items;
  }, [messages]);

  return (
    <div className="chat-view">
      {/* ── WA-style header ── */}
      <div className="wa-header">
        <div className="wa-avatar">
          {chatName.charAt(0).toUpperCase()}
        </div>
        <div className="wa-header-info">
          <div className="wa-contact-name">{chatName}</div>
          <div className="wa-contact-sub">
            {msgCount.toLocaleString()} messages
            {mediaCount > 0 && ` · ${mediaCount.toLocaleString()} media`}
          </div>
        </div>
        <div className="wa-header-right">
          <select
            value={primaryUser || ''}
            onChange={e => setPrimaryUser(e.target.value)}
            className="modern-select"
            title="Select your name so your messages appear on the right"
          >
            <option value="" disabled>You are…</option>
            {uniqueSenders.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages-container" ref={scrollRef}>
        <div className="chat-messages-scroll-area">
          {renderItems.map(item => {
            if (item.type === 'date') {
              return <DateSeparator key={item.key} label={item.label} />;
            }

            const { msg, idx } = item;

            if (msg.isSystem) {
              return (
                <div key={idx} className="system-message">
                  <span className="system-text">{msg.text}</span>
                </div>
              );
            }

            const isPrimary = msg.sender === primaryUser;

            // Group bubble tail: show tail only on the last consecutive message from the same sender
            const nextItem = renderItems[renderItems.indexOf(item) + 1];
            const nextMsg = nextItem?.type === 'msg' ? nextItem.msg : null;
            const isLastInGroup = !nextMsg || nextMsg.isSystem || nextMsg.sender !== msg.sender;

            const prevItem = renderItems[renderItems.indexOf(item) - 1];
            const prevMsg = prevItem?.type === 'msg' ? prevItem.msg : null;
            const isFirstInGroup = !prevMsg || prevMsg.isSystem || prevMsg.sender !== msg.sender;

            const showName = !isPrimary && isFirstInGroup && uniqueSenders.length > 1;

            return (
              <div
                key={idx}
                className={`message-wrapper ${isPrimary ? 'sent' : 'received'} ${isLastInGroup ? 'tail' : ''}`}
              >
                <div className="message-bubble">
                  {showName && (
                    <div className="sender-name" style={{ color: getSenderColor(msg.sender) }}>
                      {msg.sender}
                    </div>
                  )}
                  {msg.attachment && (
                    <MediaAttachment filename={msg.attachment} mediaMap={mediaMap} />
                  )}
                  {msg.text && (
                    <div className="message-text">
                      {msg.text.split('\n').map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  )}
                  <div className="message-meta">
                    <span className="message-time">{fmtTime(msg.time)}</span>
                    {isPrimary && <span className="tick-icon" aria-label="read">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
