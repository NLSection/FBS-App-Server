'use client';
import { useState, useRef, useEffect } from 'react';

let tooltipTeller = 0;
const sluitCallbacks = new Map<number, () => void>();

export default function InfoTooltip({ tekst, volledigeBreedte }: { tekst: React.ReactNode; volledigeBreedte?: boolean }) {
  const [zichtbaar, setZichtbaar] = useState(false);
  const mijnId = useRef(++tooltipTeller);

  // Registreer sluit-callback voor onderlinge uitsluiting
  useEffect(() => {
    const id = mijnId.current;
    sluitCallbacks.set(id, () => setZichtbaar(false));
    return () => { sluitCallbacks.delete(id); };
  }, []);

  // Buiten-klik: alleen actief als tooltip open is
  useEffect(() => {
    if (!zichtbaar) return;
    function buitenKlik(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest(`[data-infotooltip="${mijnId.current}"]`)) setZichtbaar(false);
    }
    document.addEventListener('mousedown', buitenKlik);
    return () => document.removeEventListener('mousedown', buitenKlik);
  }, [zichtbaar]);

  function handleMouseDown(e: React.MouseEvent) {
    // nativeEvent.stopPropagation zodat de buitenKlik van open tooltips niet vurt
    e.nativeEvent.stopPropagation();
    if (!zichtbaar) {
      sluitCallbacks.forEach((fn, id) => { if (id !== mijnId.current) fn(); });
      setZichtbaar(true);
    } else {
      setZichtbaar(false);
    }
  }

  const knop = (
    <button
      type="button"
      data-infotooltip={mijnId.current}
      onMouseDown={handleMouseDown}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}
      title="Meer informatie"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="7" />
        <line x1="8" y1="7" x2="8" y2="11" />
        <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );

  const tekstvak = zichtbaar && (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      ...(volledigeBreedte ? {} : { position: 'absolute' as const, top: '100%', left: 0, zIndex: 50, marginTop: 6, minWidth: 320, maxWidth: 420 }),
    }}>
      {tekst}
    </div>
  );

  if (volledigeBreedte) {
    return (
      <>
        {knop}
        {zichtbaar && <div style={{ flexBasis: '100%', marginTop: 8, marginBottom: 4 }}>{tekstvak}</div>}
      </>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {knop}
      {tekstvak}
    </div>
  );
}
