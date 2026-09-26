import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { parseWhatsAppChat } from '../utils/parser';

const MEDIA_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'opus', 'ogg', 'mp3', 'aac', 'm4a', 'pdf']);

async function processZip(file, setProgress) {
  setProgress('Reading ZIP…');
  const zip = await JSZip.loadAsync(file);

  // Find chat txt file
  const txtEntry = Object.values(zip.files).find(
    f => !f.dir && (f.name.endsWith('_chat.txt') || f.name.endsWith('.txt'))
  );
  if (!txtEntry) throw new Error('No chat .txt file found inside the ZIP.');

  setProgress('Parsing chat…');
  const chatText = await txtEntry.async('text');

  // Build media map from all media entries in the zip
  const mediaEntries = Object.values(zip.files).filter(f => {
    if (f.dir) return false;
    const ext = f.name.split('.').pop().toLowerCase();
    return MEDIA_EXTS.has(ext);
  });

  setProgress(`Loading ${mediaEntries.length} media files…`);

  const mediaMap = {};
  // Process in parallel batches of 20 to avoid memory spikes
  const BATCH = 20;
  for (let i = 0; i < mediaEntries.length; i += BATCH) {
    const batch = mediaEntries.slice(i, i + BATCH);
    await Promise.all(batch.map(async entry => {
      try {
        const blob = await entry.async('blob');
        const filename = entry.name.split('/').pop(); // strip folder prefix
        mediaMap[filename] = URL.createObjectURL(blob);
      } catch { /* skip unreadable entries */ }
    }));
    setProgress(`Loading media… ${Math.min(i + BATCH, mediaEntries.length)} / ${mediaEntries.length}`);
  }

  return { chatText, mediaMap };
}

async function processFolder(fileList, setProgress) {
  const files = Array.from(fileList);

  const txtFile = files.find(f => f.name === '_chat.txt') || files.find(f => f.name.endsWith('.txt'));
  if (!txtFile) throw new Error('No WhatsApp chat .txt file found in the folder.');

  setProgress(`Found ${files.length} files. Reading chat…`);

  const chatText = await txtFile.text();

  const mediaFiles = files.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return MEDIA_EXTS.has(ext);
  });

  setProgress(`Mapping ${mediaFiles.length} media files…`);
  const mediaMap = {};
  mediaFiles.forEach(f => { mediaMap[f.name] = URL.createObjectURL(f); });

  return { chatText, mediaMap };
}

export default function FileUpload({ onParsed }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const finish = useCallback((chatText, mediaMap) => {
    const parsed = parseWhatsAppChat(chatText);
    if (parsed.length === 0) throw new Error('No messages parsed. Is this a valid WhatsApp export?');
    onParsed(parsed, mediaMap);
  }, [onParsed]);

  const handleFiles = useCallback(async (fileList) => {
    setError('');
    setLoading(true);
    try {
      const files = Array.from(fileList);

      // Single ZIP
      const zipFile = files.find(f => f.name.endsWith('.zip'));
      if (zipFile) {
        const { chatText, mediaMap } = await processZip(zipFile, setProgress);
        finish(chatText, mediaMap);
        return;
      }

      // Folder or single txt
      const { chatText, mediaMap } = await processFolder(fileList, setProgress);
      finish(chatText, mediaMap);
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, [finish]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); };

  return (
    <div className="upload-container">
      <div
        className={`dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="dropzone-content">
          <div className="upload-icon-wrap">
            <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h2>Upload WhatsApp Export</h2>
          <p>Drop a <strong>.zip</strong> file, a <strong>folder</strong>, or a single <strong>.txt</strong></p>
          <p className="or-text">— or —</p>
          <div className="btn-row">
            <label className="file-label" id="zip-upload-label">
              🗜 Upload ZIP
              <input id="zip-input" type="file" accept=".zip" onChange={e => handleFiles(e.target.files)} className="file-input" />
            </label>
            <label className="file-label" id="folder-upload-label">
              📁 Upload Folder
              <input id="folder-input" type="file" webkitdirectory="true" directory="true" multiple onChange={e => handleFiles(e.target.files)} className="file-input" />
            </label>
            <label className="file-label secondary" id="file-upload-label">
              📄 .txt only
              <input id="file-input" type="file" accept=".txt" onChange={e => handleFiles(e.target.files)} className="file-input" />
            </label>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <span>{progress || 'Working…'}</span>
        </div>
      )}
      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="instructions">
        <h3>📱 How to export your WhatsApp chat</h3>
        <ol>
          <li>Open WhatsApp → tap the chat you want</li>
          <li>Tap ⋮ → <strong>More</strong> → <strong>Export Chat</strong></li>
          <li>Choose <strong>Include Media</strong></li>
          <li>Save / AirDrop the <strong>.zip</strong> to your Mac and upload it here</li>
        </ol>
      </div>
    </div>
  );
}
