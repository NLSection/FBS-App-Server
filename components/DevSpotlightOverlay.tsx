'use client';

import { useEffect, useRef, useState } from 'react';
import { STAP_LIBRARY } from '@/features/onboarding/components/OnboardingWizard';

type Profiel = 'potjesbeheer' | 'uitgavenbeheer';

function resolve(val: string | Partial<Record<Profiel, string>> | undefined, profiel: Profiel): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  return val[profiel] ?? Object.values(val)[0] ?? '';
}

type Rect = { top: number; left: number; width: number; height: number };

export default function DevSpotlightOverlay() {
  const [stapId, setStapId]   = useState<string | null>(null);
  const [profiel, setProfiel] = useState<Profiel>('potjesbeheer');
  const [rect, setRect]       = useState<Rect | null>(null);
  const pollRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dev-spotlight');
    if (!id || !STAP_LIBRARY[id]) return;
    setStapId(id);
    const p = params.get('dev-profiel') as Profiel | null;
    if (p === 'potjesbeheer' || p === 'uitgavenbeheer') setProfiel(p);
  }, []);

  useEffect(() => {
    if (!stapId) return;
    const stap = STAP_LIBRARY[stapId];
    const selector = stap?.selector;
    if (!selector) return;

    let tries = 0;
    function poll() {
      const el = document.querySelector(selector!);
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = stap.padding ?? 10;
        const eL = r.left - pad, eT = r.top - pad;
        const eW = r.width + pad * 2, eH = r.height + pad * 2;
        setRect({ top: eT, left: eL, width: eW, height: eH });
        // Stuur element-positie naar parent-frame zodat de iframe-thumbnail kan inzoomen
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'dev-spotlight-rect', eL, eT, eW, eH }, window.location.origin);
        }
      } else if (tries < 40) {
        tries++;
        pollRef.current = setTimeout(poll, 200);
      }
    }
    poll();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [stapId]);

  if (!stapId) return null;
  const stap = STAP_LIBRARY[stapId];
  if (!stap) return null;

  const titel     = resolve(stap.titel, profiel);
  const tekst     = resolve(stap.tekst, profiel);
  const afbeelding = resolve(stap.afbeelding, profiel) || stap.afbeeldingPad || '';

  // Balloon positie: boven het element als dit in de onderste helft van het scherm zit
  const ballonOnder = rect ? rect.top < (typeof window !== 'undefined' ? window.innerHeight / 2 : 400) : false;

  return (
    <>
      {rect && (
        <svg
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9000 }}
        >
          <defs>
            <mask id="dev-spot-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={4} fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#dev-spot-mask)" />
          <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={4} fill="none" stroke="var(--accent)" strokeWidth={2} />
        </svg>
      )}

      <div style={{
        position: 'fixed',
        bottom: ballonOnder ? 'auto' : 16,
        top: ballonOnder ? (rect ? rect.top + rect.height + 12 : 'auto') : 'auto',
        left: '50%', transform: 'translateX(-50%)',
        width: 380, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        zIndex: 9001, fontFamily: 'inherit',
      }}>
        <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-h)' }}>{titel}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
          maxHeight: 160, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 80%, transparent)' }}>
          {tekst}
        </p>
        {afbeelding && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={afbeelding} alt="" style={{ marginTop: 10, maxWidth: '100%', borderRadius: 6, display: 'block' }} />
        )}
        <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Dev spotlight — alleen-lezen
        </p>
      </div>
    </>
  );
}
