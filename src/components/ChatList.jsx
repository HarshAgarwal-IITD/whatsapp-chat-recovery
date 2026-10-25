import { useEffect, useMemo, useRef, useState } from 'react';

const AVATAR_COLORS = ['#e06c75', '#d19a66', '#98c379', '#56b6c2', '#61afef', '#c678dd', '#00a884', '#e5a50a'];

function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(w => /^\p{L}/u.test(w));
  if (words.length === 0) return Array.from(name.trim())[0]?.toUpperCase() || '?';
  return words.slice(0, 2).map(w => Array.from(w)[0].toUpperCase()).join('');
}

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** WhatsApp-style: time today, "Yesterday", weekday within the last week, else short date */
function formatListDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export default function ChatList({ chats, loading, error, activeId, onOpen, onRetry, onUpload, onLogout }) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(c => (c.name || '').toLowerCase().includes(q));
  }, [chats, query]);

  return (
    <div className="chat-list">
      <header className="chat-list-header">
        <h1 className="chat-list-title">Chats</h1>
        <div className="chat-list-menu" ref={menuRef}>
          <button
            className="wa-icon-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Menu"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {menuOpen && (
            <div className="chat-list-dropdown" role="menu">
              {onUpload && (
                <button role="menuitem" onClick={() => { setMenuOpen(false); onUpload(); }}>
                  Upload a chat
                </button>
              )}
              <button role="menuitem" onClick={() => { setMenuOpen(false); onLogout(); }}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="chat-list-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search"
          aria-label="Search chats"
          value={query}
          onChange={e => setQuery(e.target.value)}
          enterKeyHint="search"
        />
        {query && (
          <button className="chat-list-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>

      <div className="chat-list-items">
        {loading && chats.length === 0 && (
          <div className="chat-list-empty"><span className="spinner" aria-hidden="true" /> Loading chats…</div>
        )}

        {!loading && error && chats.length === 0 && (
          <div className="chat-list-empty">
            <p>{error}</p>
            <button className="range-apply-btn chat-list-retry" onClick={onRetry}>Try again</button>
          </div>
        )}

        {!loading && !error && chats.length === 0 && (
          <div className="chat-list-empty">No chats yet</div>
        )}

        {chats.length > 0 && filtered.length === 0 && (
          <div className="chat-list-empty">No chats match “{query.trim()}”</div>
        )}

        {filtered.map(chat => {
          const preview = chat.lastMessage
            ? `${chat.lastSender ? `${chat.lastSender}: ` : ''}${chat.lastMessage}`
            : '';
          return (
            <button
              key={chat.id}
              className={`chat-row ${chat.id === activeId ? 'active' : ''}`}
              onClick={() => onOpen(chat)}
            >
              <span className="chat-row-avatar" style={{ background: avatarColor(chat.name) }} aria-hidden="true">
                {initials(chat.name)}
              </span>
              <span className="chat-row-body">
                <span className="chat-row-top">
                  <span className="chat-row-name">{chat.name}</span>
                  <span className="chat-row-date">{formatListDate(chat.lastDate)}</span>
                </span>
                <span className="chat-row-preview">{preview}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
