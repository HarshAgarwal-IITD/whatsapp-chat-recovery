import { useState } from 'react';
import { login } from '../utils/api';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const ok = await login(username.trim(), password);
      if (ok) await onLoggedIn();
      else setError('Wrong ID or password');
    } catch {
      setError('Could not connect. Please check the internet and try again.');
    }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.76a.5.5 0 0 0 .62.61l4.86-1.29A10 10 0 1 0 12 2z" />
          </svg>
        </div>
        <h1 className="login-title">Chats</h1>
        <p className="login-sub">Please log in to see your chats</p>

        <label className="login-field">
          <span>ID</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={loading}
            required
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <div className="login-password">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="login-show-btn"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {error && <div className="login-error" role="alert">{error}</div>}

        <button
          type="submit"
          className="login-btn"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? <><span className="spinner" aria-hidden="true" /> Logging in…</> : 'Login'}
        </button>
      </form>
    </div>
  );
}
