'use client';

import { useEffect, useRef, useState } from 'react';

export const DEV_PICK_RESULT_KEY = 'dev-pick-result';

function extractSelector(el: HTMLElement): string {
  const onb = el.getAttribute('data-onboarding');
  if (onb) return `[data-onboarding="${onb}"]`;
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).filter(c => !c.startsWith('_')).slice(0, 2).join('.');
  return cls ? `${tag}.${cls}` : tag;
}

export default function DevPickModus() {
  const [stapId, setStapId] = useState<string | null>(null);
  const hoveredRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dev-pick');
    if (!id) return;
    setStapId(id);
  }, []);

  useEffect(() => {
    if (!stapId) return;
    document.body.style.cursor = 'crosshair';

    function clearHovered() {
      if (hoveredRef.current) {
        hoveredRef.current.style.outline = '';
        hoveredRef.current.style.outlineOffset = '';
        hoveredRef.current = null;
      }
    }

    function onMouseMove(e: MouseEvent) {
      clearHovered();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.closest('[data-dev-pick-overlay]')) return;
      hoveredRef.current = el;
      el.style.outline = '2px solid var(--accent)';
      el.style.outlineOffset = '2px';
    }

    function onClick(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.closest('[data-dev-pick-overlay]')) return;
      e.preventDefault();
      e.stopPropagation();
      const selector = extractSelector(el);
      clearHovered();
      document.body.style.cursor = '';
      localStorage.setItem(DEV_PICK_RESULT_KEY, JSON.stringify({ stapId, selector }));
      window.close();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        clearHovered();
        document.body.style.cursor = '';
        window.close();
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.cursor = '';
      clearHovered();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [stapId]);

  if (!stapId) return null;

  return (
    <div data-dev-pick-overlay style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'color-mix(in srgb, var(--accent) 90%, #000)',
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 13, color: '#fff', fontFamily: 'inherit',
    }}>
      <strong>Pick-modus</strong>
      <span style={{ opacity: 0.85 }}>Klik op een element om de selector op te slaan. Esc = annuleren.</span>
    </div>
  );
}
