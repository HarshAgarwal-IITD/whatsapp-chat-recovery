import { useEffect } from 'react';

const WA_COLORS = [
  '#e06c75','#e5c07b','#98c379',
  '#56b6c2','#61afef','#c678dd','#d19a66',
];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return WA_COLORS[Math.abs(h) % WA_COLORS.length];
}

function getInitial(name = '') {
  return name.trim().charAt(0).toUpperCase();
}

export default function UserSelectModal({ senders, current, onSelect, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Who are you?"
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="modal-card">
        <div className="modal-handle" aria-hidden="true" />
        <div className="modal-icon">💬</div>
        <h2 className="modal-title">Who are you?</h2>
        <p className="modal-sub">Your messages will appear on the right.</p>
        <div className="modal-sender-list">
          {senders.map(sender => (
            <button
              key={sender}
              className={`modal-sender-btn ${sender === current ? 'selected' : ''}`}
              onClick={() => onSelect(sender)}
              style={{ '--accent': hashColor(sender) }}
            >
              <span className="modal-avatar" style={{ background: hashColor(sender) }}>
                {getInitial(sender)}
              </span>
              <span className="modal-sender-name">{sender}</span>
              {sender === current && <span className="modal-check">✓</span>}
            </button>
          ))}
        </div>
        <button className="modal-skip" onClick={() => onSelect(null)}>
          Skip — view without alignment
        </button>
      </div>
    </div>
  );
}
