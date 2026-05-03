'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';

type Thema = 'donker' | 'licht' | 'systeem';

const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };
const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';
const labelCls = 'block text-xs text-[var(--text-dim)] mb-1';

const ZOOM_OPTIES = [25, 50, 75, 90, 100, 110, 125, 150, 175, 200];

export default function WeergaveInstellingen() {
  const [thema, setThema] = useState<Thema>('donker');
  const [uiZoom, setUiZoom] = useState<number>(100);

  function laad() {
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (d.thema) setThema(d.thema);
        if (typeof d.uiZoom === 'number') setUiZoom(d.uiZoom);
      })
      .catch(() => { /* stille refresh-fout */ });
  }

  useEffect(() => {
    laad();
    function onToegepast(e: Event) {
      const detail = (e as CustomEvent<{ thema: Thema }>).detail;
      if (detail) setThema(detail.thema);
    }
    window.addEventListener('thema-toegepast', onToegepast);
    window.addEventListener('instellingen-refresh', laad);
    return () => {
      window.removeEventListener('thema-toegepast', onToegepast);
      window.removeEventListener('instellingen-refresh', laad);
    };
  }, []);

  async function handleThemaChange(nieuw: Thema) {
    setThema(nieuw);
    window.dispatchEvent(new CustomEvent('thema-changed', { detail: { thema: nieuw } }));
    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thema: nieuw }),
    }).catch(() => { /* UI blijft via event-pad in sync */ });
  }

  async function handleZoomChange(nieuwZoom: number) {
    setUiZoom(nieuwZoom);
    window.dispatchEvent(new CustomEvent('zoom-changed', { detail: { zoom: nieuwZoom } }));
    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiZoom: nieuwZoom }),
    }).catch(() => { /* UI blijft in sync */ });
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Weergave</p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={subKop}>Thema</p>
          <InfoTooltip
            volledigeBreedte
            tekst="Schakel tussen een donker en licht uiterlijk van de app. 'Systeem' volgt automatisch de instelling van Windows of macOS — als je systeem in donkere modus staat, wordt FBS donker; staat het op licht, dan wordt FBS licht. De keuze wordt opgeslagen in je profiel zodat hij meegaat in een backup en op andere apparaten beschikbaar is. In de zijbalk zit ook een snelschakelknop om direct tussen donker en licht te wisselen."
          />
        </div>
        <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label className={labelCls}>Thema</label>
            <select
              className={inputCls}
              value={thema}
              onChange={e => handleThemaChange(e.target.value as Thema)}
              style={{ width: 'fit-content' }}
            >
              <option value="systeem">Systeem (volgt OS)</option>
              <option value="donker">Donker</option>
              <option value="licht">Licht</option>
            </select>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14, flex: 1 }}>
            Bij &lsquo;Systeem&rsquo; volgt FBS de donker/licht-voorkeur van Windows of macOS.
          </p>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={subKop}>Zoom</p>
          <InfoTooltip volledigeBreedte tekst="Maakt de hele app groter of kleiner. Handig op kleinere of lagere-resolutie schermen waar de standaardweergave te krap aanvoelt. Wijziging is direct zichtbaar." />
        </div>
        <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label className={labelCls}>Zoomniveau</label>
            <select
              className={inputCls}
              value={uiZoom}
              onChange={e => handleZoomChange(parseInt(e.target.value, 10))}
              style={{ width: 'fit-content' }}
            >
              {ZOOM_OPTIES.map(pct => (
                <option key={pct} value={pct}>{pct}%</option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14, flex: 1 }}>
            100% is de standaardweergave. Lager = compacter, hoger = groter.
          </p>
        </div>
      </div>
    </section>
  );
}
