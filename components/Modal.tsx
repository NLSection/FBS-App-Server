'use client';

import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  breedte?: number;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, breedte = 480, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: '100%', maxWidth: breedte,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            background: 'var(--accent-dim)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)' }}>{title}</span>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 18, lineHeight: 1, padding: '0 2px',
              }}
            >✕</button>
          </div>
        )}
        <div style={{ padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
