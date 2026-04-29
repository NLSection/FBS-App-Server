'use client';

import { useEffect } from 'react';

// Ctrl+Shift+H: toggle zichtbaarheid van alle dev-toolbars (voor handmatige screenshots via Snipping Tool e.d.)
export default function DevToolbarHotkey() {
  useEffect(() => {
    let verborgen = false;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        verborgen = !verborgen;
        document.querySelectorAll<HTMLElement>('[data-dev-toolbar]').forEach(t => {
          t.style.display = verborgen ? 'none' : '';
        });
        // Korte feedback
        const melding = document.createElement('div');
        melding.textContent = verborgen ? 'Dev-toolbars verborgen (Ctrl+Shift+H om te tonen)' : 'Dev-toolbars zichtbaar';
        melding.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--bg-card); border: 1px solid var(--accent); color: var(--text-h); padding: 8px 16px; border-radius: 8px; font-size: 13px; z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.4);';
        document.body.appendChild(melding);
        setTimeout(() => melding.remove(), 2000);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return null;
}
