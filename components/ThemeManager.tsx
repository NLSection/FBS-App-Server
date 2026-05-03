'use client';

import { useEffect } from 'react';

type Thema = 'donker' | 'licht' | 'systeem';

function pasThemaToe(thema: Thema) {
  const effectief: 'donker' | 'licht' = thema === 'systeem'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'licht' : 'donker')
    : thema;
  if (effectief === 'licht') {
    document.documentElement.setAttribute('data-theme', 'licht');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export default function ThemeManager() {
  useEffect(() => {
    let huidigeKeuze: Thema = (localStorage.getItem('thema') as Thema) || 'donker';
    pasThemaToe(huidigeKeuze);

    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const dbKeuze: Thema = d.thema === 'donker' ? 'donker' : d.thema === 'licht' ? 'licht' : 'systeem';
        if (dbKeuze !== huidigeKeuze) {
          huidigeKeuze = dbKeuze;
          localStorage.setItem('thema', dbKeuze);
          pasThemaToe(dbKeuze);
          window.dispatchEvent(new CustomEvent('thema-toegepast', { detail: { thema: dbKeuze } }));
        }
      })
      .catch(() => { /* eerste paint behoudt localStorage-keuze */ });

    function onWijziging(e: Event) {
      const detail = (e as CustomEvent<{ thema: Thema }>).detail;
      if (!detail) return;
      huidigeKeuze = detail.thema;
      localStorage.setItem('thema', detail.thema);
      pasThemaToe(detail.thema);
      window.dispatchEvent(new CustomEvent('thema-toegepast', { detail: { thema: detail.thema } }));
    }
    window.addEventListener('thema-changed', onWijziging);

    const mql = window.matchMedia('(prefers-color-scheme: light)');
    function onSysteemChange() {
      if (huidigeKeuze === 'systeem') {
        pasThemaToe('systeem');
        window.dispatchEvent(new CustomEvent('thema-toegepast', { detail: { thema: 'systeem' } }));
      }
    }
    if (mql.addEventListener) mql.addEventListener('change', onSysteemChange);
    else mql.addListener(onSysteemChange);

    return () => {
      window.removeEventListener('thema-changed', onWijziging);
      if (mql.removeEventListener) mql.removeEventListener('change', onSysteemChange);
      else mql.removeListener(onSysteemChange);
    };
  }, []);

  return null;
}
