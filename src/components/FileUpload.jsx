import { useState, useCallback } from 'react';
import { parseWhatsAppChat } from '../utils/parser';

export default function FileUpload({ onParsed }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const processFiles = useCallback((fileList) => {
    setError('');
    setLoading(true);
    setProgress('Reading files...');

    const files = Array.from(fileList);

    // Find the chat .txt file (_chat.txt or anything .txt)
    const txtFile = files.find(f => f.name === '_chat.txt') 
      || files.find(f => f.name.endsWith('.txt'));

    if (!txtFile) {
      setError('No WhatsApp chat .txt file found. Make sure you upload the full export folder.');
      setLoading(false);
      return;
    }

    // Build a map of filename → object URL for all media files
    const mediaMap = {};
    const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'opus', 'ogg', 'mp3', 'aac', 'm4a', 'pdf'];

    files.forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (mediaExtensions.includes(ext)) {
        mediaMap[file.name] = URL.createObjectURL(file);
      }
    });

    setProgress(`Found ${Object.keys(mediaMap).length} media files. Parsing chat...`);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsedMessages = parseWhatsAppChat(text);

      if (parsedMessages.length === 0) {
        setError('No messages could be parsed. Are you sure this is a WhatsApp export?');
        setLoading(false);
        return;
      }

      setLoading(false);
      onParsed(parsedMessages, mediaMap);
    };
    reader.onerror = () => {
      setError('Failed to read the chat file.');
      setLoading(false);
    };
    reader.readAsText(txtFile);
  }, [onParsed]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };
  const onFolderChange = (e) => processFiles(e.target.files);
  const onFileChange = (e) => processFiles(e.target.files);

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
          <p>Drag your exported folder here — images and videos will be shown inline</p>
          <p className="or-text">— or —</p>
          <div className="btn-row">
            <label className="file-label" id="folder-upload-label">
              📁 Upload Folder
              <input
                id="folder-input"
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={onFolderChange}
                className="file-input"
              />
            </label>
            <label className="file-label secondary" id="file-upload-label">
              📄 Single .txt File
              <input
                id="file-input"
                type="file"
                accept=".txt"
                onChange={onFileChange}
                className="file-input"
              />
            </label>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <span>{progress}</span>
        </div>
      )}
      {error && <div className="error-message">{error}</div>}

      <div className="instructions">
        <h3>📱 How to export WhatsApp chat</h3>
        <ol>
          <li>Open WhatsApp → open the chat</li>
          <li>Tap the three dots (⋮) → <strong>More</strong> → <strong>Export Chat</strong></li>
          <li>Choose <strong>Include Media</strong> (for images/videos)</li>
          <li>Share the exported <strong>folder</strong> to your computer and upload it here</li>
        </ol>
      </div>
    </div>
  );
}
