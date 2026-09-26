import { useState } from 'react';
import FileUpload from './components/FileUpload';
import ChatView from './components/ChatView';
import './index.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [mediaMap, setMediaMap] = useState({});
  const [primaryUser, setPrimaryUser] = useState(null);

  const handleParsed = (parsedMessages, parsedMediaMap) => {
    setMessages(parsedMessages);
    setMediaMap(parsedMediaMap || {});
  };

  const handleReset = () => {
    // Revoke all object URLs to free memory
    Object.values(mediaMap).forEach(url => URL.revokeObjectURL(url));
    setMessages([]);
    setMediaMap({});
    setPrimaryUser(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-left">
          <span className="header-logo">💬</span>
          <h1>WhatsApp Chat Viewer</h1>
        </div>
        {messages.length > 0 && (
          <button className="reset-btn" onClick={handleReset}>
            ← New Chat
          </button>
        )}
      </header>
      <main className="app-main">
        {messages.length === 0 ? (
          <FileUpload onParsed={handleParsed} />
        ) : (
          <ChatView
            messages={messages}
            mediaMap={mediaMap}
            primaryUser={primaryUser}
            setPrimaryUser={setPrimaryUser}
          />
        )}
      </main>
    </div>
  );
}

export default App;
