'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  tekst?: string;
  plaatsing?: 'onder' | 'rechts';
}

export default function WipBadge({ tekst = 'Deze pagina is nog in ontwikkeling en kan onverwacht gedrag vertonen.', plaatsing = 'onder' }: Props) {
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLSpanElement | null>(null);

  function toon() {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = plaatsing === 'rechts' ? r.top : r.bottom + 6;
    const left = plaatsing === 'rechts' ? r.right + 8 : r.left;
    setCoord({ top, left });
  }

  return (
    <span
      ref={trigger}
      onMouseEnter={toon}
      onMouseLeave={() => setCoord(null)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'help', fontSize: '0.9em', userSelect: 'none' }}
      aria-label="Work in progress"
    >
      <span aria-hidden>🚧</span>
      <span aria-hidden>⚠️</span>
      {coord && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: coord.top,
            left: coord.left,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--text-h)',
            whiteSpace: 'normal',
            width: 280,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            fontWeight: 400,
            lineHeight: 1.4,
            pointerEvents: 'none',
          }}
        >
          {tekst}
        </span>,
        document.body
      )}
    </span>
  );
}
