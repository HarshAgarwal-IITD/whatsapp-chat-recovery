import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { parseWhatsAppChat } from '../utils/parser';
import {
  baseName, isJunk, pickChatFile, decodeText,
  deriveChatName, contentTypeFor, summarizeMessages, formatBytes,
} from '../utils/zip';
import { putChatText, putMedia, putChatMeta, UnauthorizedError } from '../utils/api';

const MAX_FILE_BYTES = 95 * 1024 * 1024; // Pages Functions body limit is 100 MB
const CONCURRENCY = 4;
const RETRIES = 2;

/** Run fn, retrying up to RETRIES times on failure (never on an expired session) */
async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UnauthorizedError || attempt >= RETRIES) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/** Dedupe media by file name (last wins, like FileUpload's mediaMap) */
function dedupe(items) {
  return [...new Map(items.map(i => [i.name, i])).values()];
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(f => !f.dir && !isJunk(f.name));
  const txt = pickChatFile(entries, f => f.name, f => f._data?.uncompressedSize ?? 0);
  if (!txt) throw new Error('No chat .txt file found inside the ZIP.');
  const text = decodeText(await txt.async('arraybuffer'));
  // NFC so names match the transcript (macOS stores "é" as "e" + combining accent)
  const items = entries.filter(f => f !== txt).map(entry => ({
    name: baseName(entry.name).normalize('NFC'),
    size: entry._data?.uncompressedSize ?? 0,
    getBlob: () => entry.async('blob'), // read lazily, right before upload
  }));
  return { sourceName: file.name, text, items: dedupe(items) };
}

async function readFolder(fileList) {
  const files = Array.from(fileList).filter(f => !isJunk(f.webkitRelativePath || f.name));
  const txt = pickChatFile(files, f => f.webkitRelativePath || f.name, f => f.size);
  if (!txt) throw new Error('No WhatsApp chat .txt file found in the folder.');
  const text = decodeText(await txt.arrayBuffer());
  const folder = (txt.webkitRelativePath || '').split('/')[0];
  const items = files.filter(f => f !== txt).map(f => ({
    name: f.name.normalize('NFC'),
    size: f.size,
    getBlob: async () => f,
  }));
  return { sourceName: folder || txt.name, text, items: dedupe(items) };
}

export default function Upload({ onDone }) {
  const [step, setStep] = useState('pick'); // pick | confirm | uploading | done
  const [isDragging, setIsDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState(null); // { sourceName, text, items, messages }
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const cancelled = useRef(false);

  const uploading = step === 'uploading';

  // Warn before closing the tab mid-upload; stop workers if the page unmounts
  useEffect(() => {
    if (!uploading) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);
  useEffect(() => () => { cancelled.current = true; }, []);

  const senders = useMemo(() => {
    const s = new Set();
    source?.messages.forEach(m => { if (!m.isSystem && m.sender) s.add(m.sender); });
    return [...s];
  }, [source]);

  const summary = useMemo(() => {
    if (!source) return null;
    return {
      messages: source.messages.filter(m => !m.isSystem).length,
      media: source.items.length,
      bytes: source.items.reduce((n, i) => n + i.size, 0) + new Blob([source.text]).size,
      tooBig: source.items.filter(i => i.size > MAX_FILE_BYTES).map(i => i.name),
    };
  }, [source]);

  const reset = () => {
    setStep('pick'); setSource(null); setName(''); setMe('');
    setError(''); setProgress(null); setResult(null);
  };

  const handleFiles = useCallback(async fileList => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    setReading(true);
    try {
      const zipFile = files.find(f => /\.zip$/i.test(f.name));
      const read = zipFile ? await readZip(zipFile) : await readFolder(files);
      const messages = parseWhatsAppChat(read.text);
      if (!messages.some(m => !m.isSystem)) throw new Error('No messages parsed. Is this a valid WhatsApp export?');
      setSource({ ...read, messages });
      setName(deriveChatName(read.sourceName));
      setMe('');
      setStep('confirm');
    } catch (e) {
      setError(e.message || 'Could not read that file.');
    } finally {
      setReading(false);
    }
  }, []);

  async function startUpload(e) {
    e.preventDefault();
    if (!me || !name.trim()) return;
    cancelled.current = false;
    setError('');
    setStep('uploading');

    const id = crypto.randomUUID();
    const skipped = source.items.filter(i => i.size > MAX_FILE_BYTES).map(i => i.name);
    const queue = source.items.filter(i => i.size <= MAX_FILE_BYTES);
    const textBytes = new Blob([source.text]).size;
    const total = { files: queue.length + 1, bytes: queue.reduce((n, i) => n + i.size, 0) + textBytes };
    let filesDone = 0, bytesDone = 0;
    const bump = bytes => {
      filesDone++; bytesDone += bytes;
      setProgress({ filesDone, bytesDone, filesTotal: total.files, bytesTotal: total.bytes });
    };
    setProgress({ filesDone: 0, bytesDone: 0, filesTotal: total.files, bytesTotal: total.bytes });

    try {
      await withRetry(() => putChatText(id, source.text));
      bump(textBytes);

      const uploaded = [];
      let next = 0, failure = null;
      const worker = async () => {
        while (!failure && !cancelled.current && next < queue.length) {
          const item = queue[next++];
          try {
            let sent = true;
            await withRetry(async () => {
              const blob = await item.getBlob();
              if (blob.size > MAX_FILE_BYTES) { sent = false; return; } // size unknown until read
              await putMedia(id, item.name, blob, contentTypeFor(item.name));
            });
            if (sent) uploaded.push(item.name); else skipped.push(item.name);
            bump(item.size);
          } catch (err) {
            failure ??= Object.assign(err, { fileName: item.name });
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (failure) throw failure;
      if (cancelled.current) return;

      uploaded.sort((a, b) => a.localeCompare(b));
      await withRetry(() => putChatMeta(id, {
        name: name.trim(),
        primaryUser: me,
        ...summarizeMessages(source.messages),
        mediaCount: uploaded.length,
        media: uploaded,
      }));

      setResult({ name: name.trim(), skipped, uploaded: uploaded.length });
      setStep('done');
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof UnauthorizedError
        ? 'Session expired, please reload and log in.'
        : `Upload failed${err.fileName ? ` on ${err.fileName}` : ''}: ${err.message || err}. The chat was not published; you can try again.`);
      setStep('confirm');
    }
  }

  const leave = () => {
    if (uploading && !window.confirm('An upload is in progress. Leave and abandon it?')) return;
    cancelled.current = true;
    onDone();
  };

  const onDragOver = e => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); };

  const pct = progress ? Math.round((progress.bytesDone / Math.max(progress.bytesTotal, 1)) * 100) : 0;

  return (
    <div className="upload-page">
      <header className="upload-page-header">
        <button type="button" className="upload-back" onClick={leave}>← Chats</button>
        <h1>Upload a chat</h1>
      </header>

      <div className="upload-page-body">
        {step === 'pick' && (
          <>
            <div
              className={`dropzone upload-page-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <h2>Drop a WhatsApp export ZIP</h2>
              <p>The ZIP is unpacked in your browser, then uploaded file by file.</p>
              <div className="btn-row upload-page-actions">
                <label className="file-label">
                  🗜 Choose ZIP
                  <input type="file" accept=".zip" className="file-input" disabled={reading}
                    onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                </label>
                <label className="file-label secondary">
                  📁 Choose folder
                  <input type="file" webkitdirectory="true" directory="true" multiple className="file-input" disabled={reading}
                    onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
            {reading && (
              <div className="loading-indicator"><div className="spinner" /><span>Reading export…</span></div>
            )}
          </>
        )}

        {(step === 'confirm' || step === 'uploading') && source && (
          <form className="upload-card" onSubmit={startUpload}>
            <p className="upload-source">From <strong>{source.sourceName}</strong></p>

            <label className="upload-field">
              <span>Chat name</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={uploading} required maxLength={200} />
            </label>

            <label className="upload-field">
              <span>Who is &lsquo;me&rsquo; (green bubbles)?</span>
              <select value={me} onChange={e => setMe(e.target.value)} disabled={uploading} required>
                <option value="" disabled>Select a person…</option>
                {senders.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <ul className="upload-summary">
              <li><strong>{summary.messages.toLocaleString()}</strong> messages</li>
              <li><strong>{summary.media.toLocaleString()}</strong> media files</li>
              <li><strong>{formatBytes(summary.bytes)}</strong> total</li>
            </ul>
            {summary.tooBig.length > 0 && (
              <p className="upload-note">
                {summary.tooBig.length} file{summary.tooBig.length > 1 ? 's are' : ' is'} over 95 MB and will be skipped.
              </p>
            )}

            {uploading && progress && (
              <div className="upload-progress" aria-live="polite">
                <div className="upload-progress-bar"><div style={{ width: `${pct}%` }} /></div>
                <div className="upload-progress-text">
                  <span>{progress.filesDone} / {progress.filesTotal} files</span>
                  <span>{formatBytes(progress.bytesDone)} / {formatBytes(progress.bytesTotal)}</span>
                </div>
                <p className="upload-note">Keep this tab open until the upload finishes.</p>
              </div>
            )}

            {!uploading && (
              <div className="upload-buttons">
                <button type="button" className="upload-btn secondary" onClick={reset}>Cancel</button>
                <button type="submit" className="upload-btn" disabled={!me || !name.trim()}>Upload</button>
              </div>
            )}
          </form>
        )}

        {step === 'done' && result && (
          <div className="upload-card">
            <h2 className="upload-done-title">✓ Uploaded {result.name}</h2>
            <p className="upload-source">{result.uploaded.toLocaleString()} media files uploaded.</p>
            {result.skipped.length > 0 && (
              <div className="upload-skipped">
                <p>Skipped (over 95 MB):</p>
                <ul>{result.skipped.map(n => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            <div className="upload-buttons">
              <button type="button" className="upload-btn secondary" onClick={reset}>Upload another</button>
              <button type="button" className="upload-btn" onClick={onDone}>Back to chats</button>
            </div>
          </div>
        )}

        {error && <div className="error-message">⚠️ {error}</div>}
      </div>
    </div>
  );
}
