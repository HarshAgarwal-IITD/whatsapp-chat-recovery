import { useEffect, useRef } from 'react';

const SWIPE_MIN = 50; // px of horizontal movement that counts as a swipe

export default function ImageLightbox({ images, index, onIndexChange, onClose }) {
  const touchRef = useRef(null);
  const image = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const prev = () => { if (hasPrev) onIndexChange(index - 1); };
  const next = () => { if (hasNext) onIndexChange(index + 1); };

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndexChange, onClose]);

  // Warm up neighbours so arrow/swipe navigation shows them instantly
  useEffect(() => {
    [images[index - 1], images[index + 1]].forEach(img => {
      if (img) new Image().src = img.url;
    });
  }, [images, index]);

  const onTouchStart = e => {
    if (e.touches.length !== 1) { touchRef.current = null; return; } // ignore pinch-zoom
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

  if (!image) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="lightbox-top">
        <div className="lightbox-info">
          <div className="lightbox-sender">{image.sender}</div>
          <div className="lightbox-meta">{image.caption}</div>
        </div>
        <span className="lightbox-counter">{index + 1} / {images.length}</span>
        <button className="lightbox-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <img
        key={image.url}
        src={image.url}
        alt={image.name}
        className="lightbox-img"
      />

      {hasPrev && (
        <button className="lightbox-btn lightbox-nav prev" onClick={prev} aria-label="Previous image">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button className="lightbox-btn lightbox-nav next" onClick={next} aria-label="Next image">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
