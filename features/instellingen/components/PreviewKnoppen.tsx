'use client';

import { useEffect, useState } from 'react';

const DEV_KEY = 'dev-preview-modus';

interface Props {
  sectieId: string;
}

export default function PreviewKnoppen({ sectieId }: Props) {
  const [zichtbaar, setZichtbaar] = useState(false);

  useEffect(() => {
    setZichtbaar(localStorage.getItem(DEV_KEY) === 'true');
    function onWijzig(e: Event) {
      setZichtbaar((e as CustomEvent<{ aan: boolean }>).detail.aan);
    }
    window.addEventListener('dev-preview-changed', onWijzig);
    return () => window.removeEventListener('dev-preview-changed', onWijzig);
  }, []);

  if (!zichtbaar) return null;

  function openModal() {
    window.dispatchEvent(new CustomEvent('preview-modal', { detail: { sectieId } }));
  }

  function openMenu(e: React.MouseEvent) {
    window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId, x: e.clientX, y: e.clientY } }));
  }

  const knopStijl: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '4px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
  };

  return (
    <div style={{
      display: 'inline-flex',
      border: '1.5px solid var(--accent)',
      borderRadius: 6,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <button
        type="button"
        title="Toon als modal"
        onClick={openModal}
        style={knopStijl}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {/* Modal icoon: venster met titelbalk */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <line x1="1" y1="6" x2="15" y2="6" />
        </svg>
      </button>
      <div style={{ width: 1, background: 'var(--accent)', opacity: 0.4 }} />
      <button
        type="button"
        title="Toon als contextmenu"
        onClick={openMenu}
        style={knopStijl}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {/* Menu icoon: drie lijnen */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      </button>
    </div>
  );
}
