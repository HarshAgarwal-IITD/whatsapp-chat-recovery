import { useState, useMemo } from 'react';
import FileUpload from './components/FileUpload';
import ChatView from './components/ChatView';
import UserSelectModal from './components/UserSelectModal';
import DateRangeModal from './components/DateRangeModal';
import { dateBucket } from './utils/parser';
import './index.css';

function App() {
  const [messages, setMessages]     = useState([]);
  const [mediaMap, setMediaMap]     = useState({});
  const [primaryUser, setPrimaryUser] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [dateRange, setDateRange]   = useState(null);   // { from, to } as YYYY-MM-DD
  const [showDateModal, setShowDateModal] = useState(false);

  const uniqueSenders = useMemo(() => {
    const s = new Set();
    messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [messages]);

  // First and last day present in the chat (bounds for the date picker)
  const dateBounds = useMemo(() => {
    let min = null, max = null;
    messages.forEach(m => {
      if (!m.parsedDate) return;
      const b = dateBucket(m.parsedDate);
      if (!min || b < min) min = b;
      if (!max || b > max) max = b;
    });
    return min ? { min, max } : null;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (!dateRange) return messages;
    return messages.filter(m => {
      if (!m.parsedDate) return false;
      const b = dateBucket(m.parsedDate);
      return b >= dateRange.from && b <= dateRange.to;
    });
  }, [messages, dateRange]);

  const handleParsed = (parsedMessages, parsedMediaMap) => {
    setMessages(parsedMessages);
    setMediaMap(parsedMediaMap || {});
    setPrimaryUser(null);
    setDateRange(null);
    setShowModal(true);   // show "who are you?" popup
  };

  const handleUserSelected = (user) => {
    setPrimaryUser(user);
    setShowModal(false);
  };

  const handleReset = () => {
    Object.values(mediaMap).forEach(url => URL.revokeObjectURL(url));
    setMessages([]);
    setMediaMap({});
    setPrimaryUser(null);
    setShowModal(false);
    setDateRange(null);
    setShowDateModal(false);
  };

  return (
    <div className="app-container">
      {messages.length === 0 && (
        <header className="app-header">
          <div className="app-header-left">
            <span className="header-logo">💬</span>
            <h1>WhatsApp Chat Viewer</h1>
          </div>
        </header>
      )}

      <main className="app-main">
        {messages.length === 0 ? (
          <FileUpload onParsed={handleParsed} />
        ) : (
          <ChatView
            // remount on filter change so paging and scroll position reset
            key={dateRange ? `${dateRange.from}_${dateRange.to}` : 'all'}
            messages={visibleMessages}
            senders={uniqueSenders}
            dateRange={dateRange}
            onOpenDateRange={dateBounds ? () => setShowDateModal(true) : null}
            onClearDateRange={() => setDateRange(null)}
            mediaMap={mediaMap}
            primaryUser={primaryUser}
            onChangeUser={() => setShowModal(true)}
            onBack={handleReset}
          />
        )}
      </main>

      {showModal && (
        <UserSelectModal
          senders={uniqueSenders}
          current={primaryUser}
          onSelect={handleUserSelected}
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
