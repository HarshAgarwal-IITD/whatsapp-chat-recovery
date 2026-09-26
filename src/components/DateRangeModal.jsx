import { useEffect, useState } from 'react';

// Dates are handled as "YYYY-MM-DD" strings (same format as dateBucket and <input type="date">)
function shiftDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function DateRangeModal({ minDate, maxDate, range, onApply, onClose }) {
  const [from, setFrom] = useState(range?.from || minDate);
  const [to, setTo]     = useState(range?.to || maxDate);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Presets are relative to the last message in the chat, not today
  const presets = [
    { label: 'Last 7 days',  from: shiftDays(maxDate, -6) },
    { label: 'Last 30 days', from: shiftDays(maxDate, -29) },
    { label: 'Last year',    from: shiftDays(maxDate, -364) },
  ];

  const invalid = !from || !to || from > to;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Select date range"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card">
        <div className="modal-handle" aria-hidden="true" />
        <h2 className="modal-title">Select date range</h2>
        <p className="modal-sub">Only messages between these dates will be shown.</p>

        <div className="range-presets">
          {presets.map(p => (
            <button
              key={p.label}
              className="range-preset-btn"
              onClick={() => { setFrom(p.from < minDate ? minDate : p.from); setTo(maxDate); }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="range-fields">
          <label className="range-field">
            <span>From</span>
            <input
              type="date"
              value={from}
              min={minDate}
              max={maxDate}
              onChange={e => setFrom(e.target.value)}
            />
          </label>
          <label className="range-field">
            <span>To</span>
            <input
              type="date"
              value={to}
              min={minDate}
              max={maxDate}
              onChange={e => setTo(e.target.value)}
            />
          </label>
        </div>

        {from && to && from > to && (
          <p className="range-error">“From” must be on or before “To”.</p>
        )}

        <button
          className="range-apply-btn"
          disabled={invalid}
          onClick={() => onApply({ from, to })}
        >
          Show messages
        </button>
        {range && (
          <button className="modal-skip" onClick={() => onApply(null)}>
            Clear filter — show all messages
          </button>
        )}
      </div>
    </div>
  );
}
