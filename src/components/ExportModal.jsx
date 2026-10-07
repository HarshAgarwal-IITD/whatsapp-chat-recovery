import { useEffect, useState } from 'react';
import {
  buildHtml, buildText, collectImageSources, downloadFile, exportFileName, printHtml,
} from '../utils/exporter';

const FORMATS = [
  { id: 'pdf',  icon: '📕', label: 'PDF',        desc: 'Opens the print dialog — choose “Save as PDF”.' },
  { id: 'html', icon: '🌐', label: 'Web page',   desc: 'Single .html file that opens in any browser.' },
  { id: 'txt',  icon: '📝', label: 'Plain text', desc: 'WhatsApp-style .txt, same as the original export.' },
];

export default function ExportModal({ messages, mediaMap, chatName, primaryUser, dateRange, onClose }) {
  const [format, setFormat] = useState('pdf');
  const [withImages, setWithImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const hasImages = messages.some(m => m.attachment && mediaMap[m.attachment] && /\.(jpe?g|png|gif|webp)$/i.test(m.attachment));
  const msgCount = messages.filter(m => !m.isSystem).length;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (format === 'txt') {
        downloadFile(buildText(messages), exportFileName(chatName, dateRange, 'txt'), 'text/plain;charset=utf-8');
      } else {
        const imageSrcs = withImages && hasImages
          // the PDF prints in this page so it can use blob: URLs; a saved .html needs them inlined
          ? await collectImageSources(messages, mediaMap, { inline: format === 'html' })
          : {};
        const html = buildHtml({ messages, chatName, primaryUser, range: dateRange, imageSrcs });
        if (format === 'html') {
          downloadFile(html, exportFileName(chatName, dateRange, 'html'), 'text/html;charset=utf-8');
        } else {
          printHtml(html, exportFileName(chatName, dateRange, 'pdf').replace(/\.pdf$/, ''));
        }
      }
      onClose();
    } catch (e) {
      console.error(e);
      setError('Export failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Export chat"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="modal-card">
        <div className="modal-handle" aria-hidden="true" />
        <h2 className="modal-title">Export chat</h2>
        <p className="modal-sub">
          {msgCount.toLocaleString()} messages{dateRange ? ' in the selected date range' : ''}
        </p>

        <div className="modal-sender-list">
          {FORMATS.map(f => (
            <button
              key={f.id}
              className={`modal-sender-btn ${format === f.id ? 'selected' : ''}`}
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
            >
              <span className="export-icon" aria-hidden="true">{f.icon}</span>
              <span className="export-text">
                <span className="modal-sender-name">{f.label}</span>
                <span className="export-desc">{f.desc}</span>
              </span>
              {format === f.id && <span className="modal-check">✓</span>}
            </button>
          ))}
        </div>

        {format !== 'txt' && hasImages && (
          <label className="export-option">
            <input type="checkbox" checked={withImages} onChange={e => setWithImages(e.target.checked)} />
            Include images
          </label>
        )}

        {error && <p className="range-error">{error}</p>}

        <button className="range-apply-btn" disabled={busy || msgCount === 0} onClick={run}>
          {busy ? 'Preparing…' : format === 'pdf' ? 'Export PDF' : 'Download'}
        </button>
      </div>
    </div>
  );
}
