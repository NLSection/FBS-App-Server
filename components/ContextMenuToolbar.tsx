'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toggleContextMenuInspector, isInspectorActief } from '@/lib/devContextMenuInspector';

const KEY_INSPECTOR = 'tool-inspector';

export default function ContextMenuToolbar() {
  const pathname = usePathname();
  const [toonInspector, setToonInspector] = useState(false);
  const [inspectorActief, setInspectorActief] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const lees = () => setToonInspector(localStorage.getItem(KEY_INSPECTOR) === 'true');
    lees();
    const listener = () => lees();
    window.addEventListener('tool-toolbar-changed', listener);
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('tool-toolbar-changed', listener);
      window.removeEventListener('storage', listener);
    };
  }, []);

  useEffect(() => {
    document.getElementById('dev-menu-overlay')?.remove();
    document.getElementById('dev-arrow-svg')?.remove();
    document.getElementById('dev-inplace-menus')?.remove();
    if (isInspectorActief()) {
      toggleContextMenuInspector().then(() => setInspectorActief(false));
    } else {
      setInspectorActief(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!toonInspector) return;
    const bereken = () => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (!h1) { setPos(null); return; }
      const r = h1.getBoundingClientRect();
      const cs = getComputedStyle(h1);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let tekstBreedte = 0;
      if (ctx) {
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        tekstBreedte = ctx.measureText(h1.innerText).width;
      }
      const tekstEind = r.left + tekstBreedte;
      // Simpel: vaste offset in dev (ruimte voor DevToolbar), direct na h1 in prod
      const offset = process.env.NODE_ENV === 'development' ? 260 : 16;
      setPos({ top: r.top + r.height / 2 - 16, left: tekstEind + offset });
    };
    bereken();
    window.addEventListener('scroll', bereken, true);
    window.addEventListener('resize', bereken);
    const obs = new MutationObserver(() => {
      const h1 = document.querySelector('main h1');
      if (h1) bereken();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('scroll', bereken, true);
      window.removeEventListener('resize', bereken);
      obs.disconnect();
    };
  }, [toonInspector]);

  if (!toonInspector) return null;

  async function handleInspector() {
    if (bezig) return;
    setBezig(true);
    try {
      const actief = await toggleContextMenuInspector();
      setInspectorActief(actief);
    } finally {
      setBezig(false);
    }
  }

  const knopStijl: React.CSSProperties = {
    background: inspectorActief ? 'var(--accent)' : 'var(--bg-card)',
    border: `1px solid ${inspectorActief ? 'var(--accent)' : 'var(--border)'}`,
    color: inspectorActief ? '#fff' : 'var(--text-h)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: bezig ? 'wait' : 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    outline: 'none',
  };

  const wrapStyle: React.CSSProperties = pos
    ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9998, display: 'flex', gap: 8 }
    : { position: 'fixed', bottom: 16, right: 16, zIndex: 9998, display: 'flex', gap: 8 };

  return (
    <div data-dev-toolbar="1" style={wrapStyle}>
      <button type="button" onClick={handleInspector} style={knopStijl} disabled={bezig} title="Toon alle klik-, hover-, tandwiel- en rechtermuisklik-opties op deze pagina">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {bezig && (
            <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'ctm-spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="14 28" strokeLinecap="round" />
            </svg>
          )}
          {bezig ? 'Verzamelen…' : inspectorActief ? 'Pagina-opties uit' : 'Pagina-opties tonen'}
        </span>
        <style>{`@keyframes ctm-spin { to { transform: rotate(360deg); } }`}</style>
      </button>
    </div>
  );
}
