'use client';

import { useEffect, useRef, useState } from 'react';
import type { TekenGebied } from '@/features/onboarding/components/OnboardingWizard';

export const DEV_TEKEN_RESULT_KEY = 'dev-teken-result';

function extractSelector(el: HTMLElement): string {
  const onb = el.getAttribute('data-onboarding');
  if (onb) return `[data-onboarding="${onb}"]`;
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).filter(c => !c.startsWith('_')).slice(0, 2).join('.');
  return cls ? `${tag}.${cls}` : tag;
}

function vindAnker(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    if (cur.getAttribute('data-onboarding') || cur.id) return cur;
    cur = cur.parentElement;
  }
  return el;
}

export default function DevTekenModus() {
  const [stapId, setStapId] = useState<string | null>(null);
  const [actief, setActief] = useState(false);
  const tekenRef = useRef<{ startX: number; startY: number } | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dev-teken');
    if (!id) return;
    setStapId(id);
  }, []);

  useEffect(() => {
    if (!actief) return;
    document.body.style.cursor = 'crosshair';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { document.body.style.cursor = ''; setActief(false); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [actief]);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    tekenRef.current = { startX: e.clientX, startY: e.clientY };
    setRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!tekenRef.current) return;
    const { startX, startY } = tekenRef.current;
    setRect({
      left: Math.min(startX, e.clientX),
      top: Math.min(startY, e.clientY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY),
    });
  }

  function onMouseUp(e: React.MouseEvent) {
    if (!tekenRef.current || !stapId) return;
    const { startX, startY } = tekenRef.current;
    tekenRef.current = null;
    const left   = Math.min(startX, e.clientX);
    const top    = Math.min(startY, e.clientY);
    const width  = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);
    setRect(null);
    if (width < 5 || height < 5) return;

    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const anker = vindAnker(centerX, centerY);
    let ankerSelector = 'body';
    let relLeft = left, relTop = top;
    if (anker) {
      const ar = anker.getBoundingClientRect();
      ankerSelector = extractSelector(anker);
      relLeft = left - ar.left;
      relTop  = top  - ar.top;
    }

    const tekenGebied: TekenGebied = { ankerSelector, relLeft, relTop, width, height };
    document.body.style.cursor = '';
    localStorage.setItem(DEV_TEKEN_RESULT_KEY, JSON.stringify({ stapId, tekenGebied }));
    window.close();
  }

  if (!stapId) return null;

  // Wacht-fase: pagina bruikbaar, banner met start-knop
  if (!actief) {
    return (
      <div data-dev-teken-overlay style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'color-mix(in srgb, #e67700 90%, #000)',
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: '#fff', fontFamily: 'inherit',
      }}>
        <strong>Teken-modus</strong>
        <span style={{ opacity: 0.85 }}>Navigeer naar de juiste pagina en stel de gewenste staat in.</span>
        <button
          onClick={() => setActief(true)}
          style={{
            marginLeft: 'auto', padding: '4px 14px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: '#e67700', border: 'none', borderRadius: 5, cursor: 'pointer',
          }}
        >
          Start tekenen
        </button>
        <button
          onClick={() => window.close()}
          style={{
            padding: '4px 10px', fontSize: 13, background: 'transparent',
            color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5, cursor: 'pointer', opacity: 0.75,
          }}
        >
          Annuleren
        </button>
      </div>
    );
  }

  // Actief: crosshair-overlay
  return (
    <div
      data-dev-teken-overlay
      style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        background: 'color-mix(in srgb, #e67700 90%, #000)',
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: '#fff', fontFamily: 'inherit', pointerEvents: 'none',
      }}>
        <strong>Teken-modus actief</strong>
        <span style={{ opacity: 0.85 }}>Sleep om een highlight-gebied te tekenen. Esc = terug.</span>
      </div>
      {rect && rect.width > 2 && rect.height > 2 && (
        <div style={{
          position: 'absolute',
          left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          border: '2px solid var(--accent)',
          background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
