'use client';

// Past de uiZoom-instelling toe via `transform: scale()` op <html> met
// gecompenseerde dimensies, zodat de viewport altijd gevuld blijft —
// content schaalt mee maar er ontstaat geen horizontale scroll bij
// zoomen-in en geen witte rand bij zoomen-uit. Bij scale 0.5 is de
// logische viewport 200% breed (meer content past); bij scale 1.5 is de
// logische viewport ~67% breed (minder content past, alles groter).

import { useEffect } from 'react';

function pasZoomToe(zoomPct: number): void {
  const schaal = Math.max(0.25, Math.min(2.0, zoomPct / 100));
  const html = document.documentElement;
  const body = document.body;
  if (!body) return;
  if (schaal === 1) {
    html.style.overflow = '';
    body.style.transform = '';
    body.style.transformOrigin = '';
    body.style.width = '';
    body.style.height = '';
  } else {
    const inv = 100 / schaal;
    // body wordt logisch breder/hoger zodat layout-children (flex, %)
    // meer/minder ruimte krijgen; transform scaled rendering zodat de
    // viewport altijd gevuld blijft. html.overflow:hidden voorkomt
    // scroll door de oversized body box.
    html.style.overflow = 'hidden';
    body.style.transform = `scale(${schaal})`;
    body.style.transformOrigin = 'top left';
    body.style.width = `${inv}vw`;
    body.style.height = `${inv}vh`;
  }
}

export default function ZoomController() {
  useEffect(() => {
    let cancelled = false;

    // Initial: lees uit DB en pas toe (bij app-start of na restore).
    async function laadInitieel() {
      try {
        const res = await fetch('/api/instellingen');
        if (!res.ok) return;
        const data = await res.json() as { uiZoom?: number };
        if (cancelled) return;
        await pasZoomToe(data.uiZoom ?? 100);
      } catch { /* niet kritiek */ }
    }

    // Live: dropdown stuurt nieuwe waarde direct mee via event payload —
    // geen extra API-call, geen race-condition met de PUT die nog onderweg is.
    function onZoomChanged(e: Event) {
      const detail = (e as CustomEvent<{ zoom: number }>).detail;
      if (typeof detail?.zoom === 'number') void pasZoomToe(detail.zoom);
    }

    laadInitieel();
    window.addEventListener('zoom-changed', onZoomChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('zoom-changed', onZoomChanged);
    };
  }, []);

  return null;
}
