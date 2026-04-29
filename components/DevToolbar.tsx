'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { anonimiseerHuidigePagina } from '@/lib/devAnonimiseer';
import DevScreenshotOverlay from './DevScreenshotOverlay';

const KEY_ANONIMISEER = 'dev-toolbar-anonimiseer';
const KEY_ANONIMISEER_MODUS = 'dev-anonimiseer-modus';
const KEY_SCREENSHOT = 'dev-toolbar-screenshot';

// Dev-only toolbar: Anonimiseer + Screenshot knoppen. Wordt alleen in development gerenderd.
export default function DevToolbar() {
  const pathname = usePathname();
  const [toonAnonimiseer, setToonAnonimiseer] = useState(false);
  const [anonimiseerModus, setAnonimiseerModus] = useState(false);
  const [toonScreenshot, setToonScreenshot] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [anonimiseerGelukt, setAnonimiseerGelukt] = useState(false);
  const [anonimiseerBezig, setAnonimiseerBezig] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const lees = () => {
      setToonAnonimiseer(localStorage.getItem(KEY_ANONIMISEER) === 'true');
      setAnonimiseerModus(localStorage.getItem(KEY_ANONIMISEER_MODUS) === 'true');
      setToonScreenshot(localStorage.getItem(KEY_SCREENSHOT) === 'true');
    };
    lees();
    const listener = () => lees();
    window.addEventListener('dev-toolbar-changed', listener);
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('dev-toolbar-changed', listener);
      window.removeEventListener('storage', listener);
    };
  }, []);

  // Bij pagina-wissel: reset anonimiseer-status (data is niet meer geanonimiseerd op nieuwe pagina)
  useEffect(() => {
    setAnonimiseerGelukt(false);
    setAnonimiseerBezig(false);
  }, [pathname]);

  // Doorlopende anonimiseer-modus: bij pagina-wissel en DOM-mutaties binnen <main>
  // automatisch anonimiseren. Debounce voorkomt gehamer tijdens data-loads.
  useEffect(() => {
    if (!anonimiseerModus) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9998',
      'background:#0f1117',
      'display:flex', 'align-items:center', 'justify-content:center',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(overlay);

    const main = document.querySelector('main') ?? document.body;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Na initiële load: permanente observer voor subtabellen (alleen childList, geen cascade)
    let subtabelPending = false;
    const subtabelObs = new MutationObserver(() => {
      if (subtabelPending) return;
      subtabelPending = true;
      Promise.resolve().then(() => {
        subtabelPending = false;
        anonimiseerHuidigePagina();
      });
    });

    const klaar = () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
      anonimiseerHuidigePagina();
      overlay.remove();
      subtabelObs.observe(main, { childList: true, subtree: true });
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(klaar, 300);
    };

    const obs = new MutationObserver(resetTimer);
    obs.observe(main, { childList: true, subtree: true });
    resetTimer();

    return () => {
      obs.disconnect();
      subtabelObs.disconnect();
      if (timer) clearTimeout(timer);
      overlay.remove();
    };
  }, [anonimiseerModus, pathname]);

  useEffect(() => {
    if (!toonAnonimiseer && !toonScreenshot) return;
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
      setPos({ top: r.top + r.height / 2 - 16, left: tekstEind + 16 });
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
  }, [toonAnonimiseer, toonScreenshot]);

  if (!toonAnonimiseer && !toonScreenshot && !anonimiseerModus) return null;

  function handleAnonimiseer() {
    if (anonimiseerBezig) return;
    setAnonimiseerBezig(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        anonimiseerHuidigePagina();
        setAnonimiseerBezig(false);
        setAnonimiseerGelukt(true);
      });
    });
  }

  const knop = (): React.CSSProperties => ({
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-h)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    outline: 'none',
  });

  const wrapStyle: React.CSSProperties = pos
    ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, display: 'flex', gap: 8 }
    : { position: 'fixed', bottom: 16, right: 16, zIndex: 9999, display: 'flex', gap: 8 };

  return (
    <div data-dev-toolbar="1" style={wrapStyle}>
      {toonAnonimiseer && (
        <button type="button" onClick={handleAnonimiseer} disabled={anonimiseerBezig} style={{
          ...knop(),
          cursor: anonimiseerBezig ? 'wait' : 'pointer',
        }} title="Anonimiseer namen/bedragen in huidige pagina (DOM-only, refresh = reset)">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {anonimiseerBezig && (
              <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'dev-spin 0.8s linear infinite' }}>
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="14 28" strokeLinecap="round" />
              </svg>
            )}
            {!anonimiseerBezig && anonimiseerGelukt && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            )}
            Anonimiseer
          </span>
          <style>{`@keyframes dev-spin { to { transform: rotate(360deg); } }`}</style>
        </button>
      )}
      {toonScreenshot && (
        <button type="button" onClick={() => setScreenshotOpen(true)} style={knop()} title="Maak een screenshot door een kader te slepen">
          Screenshot
        </button>
      )}
      <DevScreenshotOverlay open={screenshotOpen} onClose={() => setScreenshotOpen(false)} />
    </div>
  );
}
