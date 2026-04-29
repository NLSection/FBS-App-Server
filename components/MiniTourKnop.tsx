'use client';

import { useEffect, useState } from 'react';


interface Props {
  tourId: string;
  title?: string;
  noAutoMargin?: boolean;
  klein?: boolean;
  type?: 'pagina' | 'instelling';
}

export default function MiniTourKnop({ tourId, title, noAutoMargin = false, klein = false, type = 'pagina' }: Props) {
  const standaardTitle =
    `Start de mini-tour van deze ${type}.\n` +
    `De mini-tour knoppen kunnen uitgeschakeld worden via de instellingenpagina.`;
  const effectiefTitle = title ?? standaardTitle;

  const [zichtbaar, setZichtbaar] = useState(false);

  useEffect(() => {
    let actief = true;
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then((inst: { helpModus: boolean } | null) => {
        if (actief && inst) setZichtbaar(!!inst.helpModus);
      })
      .catch(() => { /* default uit */ });
    function onWijzig(e: Event) {
      setZichtbaar((e as CustomEvent<{ aan: boolean }>).detail.aan);
    }
    window.addEventListener('helpmodus-changed', onWijzig);
    return () => { actief = false; window.removeEventListener('helpmodus-changed', onWijzig); };
  }, []);

  if (!zichtbaar) return null;

  const maat = klein ? 18 : 26;
  const fs   = klein ? 11 : 13;
  const brd  = klein ? 1.5 : 2;

  return (
    <button
      type="button"
      title={effectiefTitle}
      data-onboarding="minitour-knop"
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('start-mini-tour', { detail: { tourId } }));
      }}
      style={{
        marginLeft: noAutoMargin ? 0 : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: maat,
        height: maat,
        borderRadius: '50%',
        border: `${brd}px solid var(--accent)`,
        background: 'var(--accent-dim)',
        color: 'var(--accent)',
        fontSize: fs,
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      ?
    </button>
  );
}
