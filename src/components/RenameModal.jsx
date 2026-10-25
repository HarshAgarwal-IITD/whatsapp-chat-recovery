import { useEffect, useState } from 'react';

/** Rename a chat; asks for the login password again before saving */
export default function RenameModal({ name, onSave, onClose }) {
  const [value, setValue]       = useState(name || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const trimmed = value.trim();
  const invalid = !trimmed || !password || saving;

  const submit = async e => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed, password);
    } catch (err) {
      setError(err.message || 'Could not rename the chat');
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Rename chat"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-handle" aria-hidden="true" />
        <h2 className="modal-title">Rename chat</h2>
        <p className="modal-sub">Enter the password to save the new name.</p>

        <label className="range-field rename-field">
          <span>Chat name</span>
          <input type="text" value={value} onChange={e => setValue(e.target.value)}
            maxLength={200} autoFocus disabled={saving} />
        </label>
        <label className="range-field rename-field">
          <span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" disabled={saving} />
        </label>

        {error && <p className="range-error">{error}</p>}

        <button type="submit" className="range-apply-btn" disabled={invalid}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="modal-skip" onClick={onClose} disabled={saving}>Cancel</button>
      </form>
    </div>
  );
}
