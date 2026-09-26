import { useState, useMemo } from 'react';
import FileUpload from './components/FileUpload';
import ChatView from './components/ChatView';
import UserSelectModal from './components/UserSelectModal';
import './index.css';

function App() {
  const [messages, setMessages]     = useState([]);
  const [mediaMap, setMediaMap]     = useState({});
  const [primaryUser, setPrimaryUser] = useState(null);
  const [showModal, setShowModal]   = useState(false);

  const uniqueSenders = useMemo(() => {
    const s = new Set();
    messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [messages]);

  const handleParsed = (parsedMessages, parsedMediaMap) => {
    setMessages(parsedMessages);
    setMediaMap(parsedMediaMap || {});
    setPrimaryUser(null);
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
            messages={messages}
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
    </div>
  );
}

export default App;
