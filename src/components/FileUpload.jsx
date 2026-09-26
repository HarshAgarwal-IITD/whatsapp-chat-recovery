import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { parseWhatsAppChat } from '../utils/parser';

const baseName = path => path.split('/').pop();

// macOS-zipped exports carry "__MACOSX/._name" resource forks that look like real files
const isJunk = path => path.startsWith('__MACOSX/') || path.includes('/__MACOSX/') || baseName(path).startsWith('._') || baseName(path) === '.DS_Store';

/** Pick the chat transcript: "_chat.txt" (iOS), "WhatsApp Chat with …txt" (Android), else the largest .txt */
function pickChatFile(candidates, getPath, getSize) {
  const txts = candidates.filter(c => !isJunk(getPath(c)) && /\.txt$/i.test(getPath(c)));
  return txts.find(c => baseName(getPath(c)) === '_chat.txt')
    || txts.find(c => /^whatsapp chat/i.test(baseName(getPath(c))))
    || txts.sort((a, b) => getSize(b) - getSize(a))[0];
}

/** Decode the transcript, handling UTF-8 (with or without BOM) and UTF-16 exports */
function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

async function processZip(file, setProgress) {
  setProgress('Reading ZIP…');
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(f => !f.dir && !isJunk(f.name));

  const txtEntry = pickChatFile(entries, f => f.name, f => f._data?.uncompressedSize ?? 0);
  if (!txtEntry) throw new Error('No chat .txt file found inside the ZIP.');

  setProgress('Parsing chat…');
  const chatText = decodeText(await txtEntry.async('arraybuffer'));

  // Every other file is a potential attachment, whatever its extension (heic, webm, vcf, docx…)
  const mediaEntries = entries.filter(f => f !== txtEntry);

  setProgress(`Loading ${mediaEntries.length} media files…`);

  const mediaMap = {};
  // Process in parallel batches of 20 to avoid memory spikes
  const BATCH = 20;
  for (let i = 0; i < mediaEntries.length; i += BATCH) {
    const batch = mediaEntries.slice(i, i + BATCH);
    await Promise.all(batch.map(async entry => {
      try {
        const blob = await entry.async('blob');
        mediaMap[baseName(entry.name)] = URL.createObjectURL(blob);
      } catch { /* skip unreadable entries */ }
    }));
    setProgress(`Loading media… ${Math.min(i + BATCH, mediaEntries.length)} / ${mediaEntries.length}`);
  }

  return { chatText, mediaMap };
}

async function processFolder(fileList, setProgress) {
  const files = Array.from(fileList).filter(f => !isJunk(f.webkitRelativePath || f.name));

  const txtFile = pickChatFile(files, f => f.webkitRelativePath || f.name, f => f.size);
  if (!txtFile) throw new Error('No WhatsApp chat .txt file found in the folder.');

  setProgress(`Found ${files.length} files. Reading chat…`);

  const chatText = decodeText(await txtFile.arrayBuffer());

  const mediaFiles = files.filter(f => f !== txtFile);

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
      const zipFile = files.find(f => /\.zip$/i.test(f.name));
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
              <input id="zip-input" type="file" accept=".zip" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} className="file-input" />
            </label>
            <label className="file-label" id="folder-upload-label">
              📁 Upload Folder
              <input id="folder-input" type="file" webkitdirectory="true" directory="true" multiple onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} className="file-input" />
            </label>
            <label className="file-label secondary" id="file-upload-label">
              📄 .txt only
              <input id="file-input" type="file" accept=".txt" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} className="file-input" />
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
          <li>Save the <strong>.zip</strong> to Files (phone) or your computer, then upload it here</li>
        </ol>
      </div>
    </div>
  );
}
