import { useEffect, useRef } from 'react';

const SWIPE_MIN = 50; // px of horizontal movement that counts as a swipe

export default function MediaLightbox({ items, index, onIndexChange, onClose }) {
  const touchRef = useRef(null);
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const prev = () => { if (hasPrev) onIndexChange(index - 1); };
  const next = () => { if (hasNext) onIndexChange(index + 1); };

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndexChange, onClose]);

  // Warm up neighbouring images so arrow/swipe navigation shows them instantly
  useEffect(() => {
    [items[index - 1], items[index + 1]].forEach(it => {
      if (it?.type === 'image') new Image().src = it.url;
    });
  }, [items, index]);

  const onTouchStart = e => {
    // ignore pinch-zoom, and drags on video controls (seeking would read as a swipe)
    if (e.touches.length !== 1 || e.target.tagName === 'VIDEO') { touchRef.current = null; return; }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = e => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) prev(); else next();
  };

  if (!item) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="lightbox-top">
        <div className="lightbox-info">
          <div className="lightbox-sender">{item.sender}</div>
          <div className="lightbox-meta">{item.caption}</div>
        </div>
        <span className="lightbox-counter">{index + 1} / {items.length}</span>
        <button className="lightbox-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {item.type === 'video' ? (
        <video
          key={item.url}
          src={item.url}
          className="lightbox-media"
          controls
          autoPlay
          playsInline
        />
      ) : (
        <img
          key={item.url}
          src={item.url}
          alt={item.name}
          className="lightbox-media"
        />
      )}

      {hasPrev && (
        <button className="lightbox-btn lightbox-nav prev" onClick={prev} aria-label="Previous">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button className="lightbox-btn lightbox-nav next" onClick={next} aria-label="Next">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
