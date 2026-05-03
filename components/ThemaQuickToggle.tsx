'use client';

import { useEffect, useState } from 'react';

type Thema = 'donker' | 'licht' | 'systeem';

function effectief(thema: Thema): 'donker' | 'licht' {
  if (thema !== 'systeem') return thema;
  if (typeof window === 'undefined') return 'donker';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'licht' : 'donker';
}

interface Props { collapsed: boolean; }

export default function ThemaQuickToggle({ collapsed }: Props) {
  const [thema, setThema] = useState<Thema>('donker');

  useEffect(() => {
    const opgeslagen = (localStorage.getItem('thema') as Thema) || 'donker';
    setThema(opgeslagen);
    fetch('/api/instellingen').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.thema) setThema(d.thema);
    }).catch(() => { /* localStorage-keuze blijft staan */ });

    function onToegepast(e: Event) {
      const detail = (e as CustomEvent<{ thema: Thema }>).detail;
      if (detail) setThema(detail.thema);
    }
    window.addEventListener('thema-toegepast', onToegepast);
    return () => window.removeEventListener('thema-toegepast', onToegepast);
  }, []);

  async function toggle() {
    const nu = effectief(thema);
    const nieuw: Thema = nu === 'donker' ? 'licht' : 'donker';
    setThema(nieuw);
    window.dispatchEvent(new CustomEvent('thema-changed', { detail: { thema: nieuw } }));
    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thema: nieuw }),
    }).catch(() => { /* UI blijft in sync via localStorage */ });
  }

  const huidig = effectief(thema);
  const volgendeLabel = huidig === 'donker' ? 'Licht' : 'Donker';
  const titel = thema === 'systeem'
    ? `Thema: Systeem (${huidig === 'donker' ? 'Donker' : 'Licht'}) — klik voor ${volgendeLabel}`
    : `Thema: ${huidig === 'donker' ? 'Donker' : 'Licht'} — klik voor ${volgendeLabel}`;

  return (
    <button
      type="button"
      onClick={toggle}
      title={titel}
      aria-label={titel}
      style={{
        width: 28, height: 28, padding: 0,
        border: '1px solid var(--border)', borderRadius: '50%',
        background: 'var(--bg-card)', color: 'var(--text-dim)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        marginLeft: collapsed ? 0 : 'auto',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {huidig === 'donker' ? (
        // Maan icoon (huidige stand donker → toon maan)
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Zon icoon (huidige stand licht → toon zon)
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
