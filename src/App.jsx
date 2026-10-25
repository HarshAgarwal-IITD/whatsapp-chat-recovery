import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ChatView from './components/ChatView';
import ChatList from './components/ChatList';
import Login from './components/Login';
import Upload from './components/Upload';
import UserSelectModal from './components/UserSelectModal';
import DateRangeModal from './components/DateRangeModal';
import { parseWhatsAppChat, getDateBounds, filterByRange } from './utils/parser';
import {
  listChats, getChat, getChatText, buildMediaMap, logout, UnauthorizedError,
} from './utils/api';
import './index.css';
import './App.css';

const EMPTY = [];

function App() {
  const [auth, setAuth]             = useState('checking');  // 'checking' | 'login' | 'ready'
  const [path, setPath]             = useState(() => window.location.pathname);
  const [chats, setChats]           = useState(EMPTY);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState('');

  // The open chat: { id, name, status: 'loading' | 'ready' | 'error', error?, messages?, mediaMap? }
  const [active, setActive]         = useState(null);
  const [primaryUser, setPrimaryUser] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [dateRange, setDateRange]   = useState(null);   // { from, to } as YYYY-MM-DD
  const [showDateModal, setShowDateModal] = useState(false);

  const requestRef = useRef(0);      // ignores responses for chats that are no longer open
  const chatsRef = useRef(chats);
  const activeIdRef = useRef(null);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { activeIdRef.current = active?.id ?? null; }, [active]);

  const resetChat = useCallback(() => {
    requestRef.current++;
    setActive(null);
    setPrimaryUser(null);
    setShowModal(false);
    setDateRange(null);
    setShowDateModal(false);
  }, []);

  /** Returns true if the error was a 401 (and the login screen is now showing) */
  const handleAuthError = useCallback(e => {
    if (!(e instanceof UnauthorizedError)) return false;
    resetChat();
    setChats(EMPTY);
    setAuth('login');
    return true;
  }, [resetChat]);

  const onChatsLoaded = useCallback(list => {
    setChats(Array.isArray(list) ? list : EMPTY);
    setChatsError('');
    setChatsLoading(false);
    setAuth('ready');
  }, []);

  const onChatsFailed = useCallback(e => {
    setChatsLoading(false);
    if (handleAuthError(e)) return;
    setChatsError(e.message || 'Could not load chats');
    setAuth('ready');
  }, [handleAuthError]);

  const loadChats = useCallback(() => {
    setChatsLoading(true);
    setChatsError('');
    return listChats().then(onChatsLoaded, onChatsFailed);
  }, [onChatsLoaded, onChatsFailed]);

  const loadChat = useCallback(async (id, name) => {
    const req = ++requestRef.current;
    setActive({ id, name, status: 'loading' });
    setPrimaryUser(null);
    setShowModal(false);
    setDateRange(null);
    setShowDateModal(false);
    try {
      const [meta, text] = await Promise.all([getChat(id), getChatText(id)]);
      if (req !== requestRef.current) return;
      const messages = parseWhatsAppChat(text);
      setActive({
        id,
        name: meta.name || name,
        status: 'ready',
        messages,
        mediaMap: buildMediaMap(id, meta.media || []),
      });
      setPrimaryUser(meta.primaryUser || null);
    } catch (e) {
      if (req !== requestRef.current || handleAuthError(e)) return;
      setActive({ id, name, status: 'error', error: e.message || 'Could not open this chat' });
    }
  }, [handleAuthError]);

  // Initial session check. A chat history entry left over from before a reload is
  // dropped so the next "open chat" pushes a fresh entry for Back to pop.
  useEffect(() => {
    if (window.history.state?.chat) window.history.replaceState(null, '');
    listChats().then(onChatsLoaded, onChatsFailed);   // chatsLoading starts out true
  }, [onChatsLoaded, onChatsFailed]);

  // Browser / phone Back button: closes an open chat, follows /upload <-> /
  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname);
      const id = window.history.state?.chat;
      if (!id) { resetChat(); return; }
      if (activeIdRef.current === id) return;
      const summary = chatsRef.current.find(c => c.id === id);
      loadChat(id, summary?.name || '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [loadChat, resetChat]);

  const navigate = useCallback(to => {
    resetChat();
    window.history.pushState(null, '', to);
    setPath(to);
  }, [resetChat]);

  const openChat = useCallback(chat => {
    if (active?.id === chat.id) return;
    // One history entry per "chat open", so Back returns to the list
    const state = { chat: chat.id };
    if (window.history.state?.chat) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
    loadChat(chat.id, chat.name);
  }, [active, loadChat]);

  const closeChat = useCallback(() => {
    if (window.history.state?.chat) window.history.back();   // popstate does the reset
    else resetChat();
  }, [resetChat]);

  const handleLogout = useCallback(async () => {
    try { await logout(); } catch { /* show login regardless */ }
    if (window.history.state?.chat) window.history.replaceState(null, '');
    resetChat();
    setChats(EMPTY);
    setAuth('login');
  }, [resetChat]);

  const handleUploadDone = useCallback(() => {
    navigate('/');
    loadChats();
  }, [navigate, loadChats]);

  // ── Derived data for the open chat ──
  const messages = active?.status === 'ready' ? active.messages : EMPTY;

  const uniqueSenders = useMemo(() => {
    const s = new Set();
    messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [messages]);

  // First and last day present in the chat (bounds for the date picker)
  const dateBounds = useMemo(() => getDateBounds(messages), [messages]);

  const visibleMessages = useMemo(() => filterByRange(messages, dateRange), [messages, dateRange]);

  // ── Screens ──
  if (auth === 'checking') {
    return (
      <div className="app-container">
        <div className="app-splash"><span className="spinner" aria-hidden="true" /> Loading…</div>
      </div>
    );
  }

  if (auth === 'login') {
    return (
      <div className="app-container">
        <Login onLoggedIn={loadChats} />
      </div>
    );
  }

  if (path === '/upload') {
    return (
      <div className="app-container">
        <Upload onDone={handleUploadDone} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className={`split ${active ? 'has-chat' : ''}`}>
        <aside className="split-list" aria-hidden={active ? 'true' : undefined}>
          <ChatList
            chats={chats}
            loading={chatsLoading}
            error={chatsError}
            activeId={active?.id}
            onOpen={openChat}
            onRetry={loadChats}
            onUpload={() => navigate('/upload')}
            onLogout={handleLogout}
          />
        </aside>

        <section className="split-chat">
          {!active && (
            <div className="split-placeholder">
              <div className="split-placeholder-icon" aria-hidden="true">💬</div>
              <p>Select a chat</p>
            </div>
          )}

          {active && active.status !== 'ready' && (
            <div className="chat-view">
              <div className="wa-header">
                <button className="wa-back-btn" onClick={closeChat} aria-label="Back to chats" title="Back to chats">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="wa-avatar">{(active.name || '?').charAt(0).toUpperCase()}</div>
                <div className="wa-header-info">
                  <div className="wa-contact-name">{active.name}</div>
                </div>
              </div>
              <div className="chat-status">
                {active.status === 'loading' ? (
                  <><span className="spinner" aria-hidden="true" /> Opening chat…</>
                ) : (
                  <>
                    <p>{active.error}</p>
                    <button className="range-apply-btn" onClick={() => loadChat(active.id, active.name)}>Try again</button>
                  </>
                )}
              </div>
            </div>
          )}

          {active?.status === 'ready' && (
            <ChatView
              // remount on chat/filter change so paging and scroll position reset
              key={`${active.id}|${dateRange ? `${dateRange.from}_${dateRange.to}` : 'all'}`}
              messages={visibleMessages}
              senders={uniqueSenders}
              dateRange={dateRange}
              onOpenDateRange={dateBounds ? () => setShowDateModal(true) : null}
              onClearDateRange={() => setDateRange(null)}
              mediaMap={active.mediaMap}
              primaryUser={primaryUser}
              onChangeUser={() => setShowModal(true)}
              onBack={closeChat}
            />
          )}
        </section>
      </div>

      {showModal && (
        <UserSelectModal
          senders={uniqueSenders}
          current={primaryUser}
          onSelect={user => { setPrimaryUser(user); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {showDateModal && dateBounds && (
        <DateRangeModal
          minDate={dateBounds.min}
          maxDate={dateBounds.max}
          range={dateRange}
          onApply={r => { setDateRange(r); setShowDateModal(false); }}
          onClose={() => setShowDateModal(false)}
        />
      )}
    </div>
  );
}

export default App;
