// FILE: VastePostenInstellingen.tsx
// AANGEMAAKT: 03-04-2026 19:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 19:00
//
// WIJZIGINGEN (03-04-2026 19:00):
// - Initiële aanmaak: instellingen voor vaste lasten overzicht

'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import MiniTourKnop from '@/components/MiniTourKnop';
import PreviewKnoppen from './PreviewKnoppen';

interface VLInst {
  vastePostenOverzicht: string;
  vastePostenAfwijkingProcent: number;
  vastePostenVergelijk: string;
  vastePostenNieuwDrempel: string;
  vastePostenSubtabelPeriode: string;
  vastePostenVerbergDrempel: string;
}

const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';

interface Props {
  compact?: boolean;
}

export default function VastePostenInstellingen({ compact = false }: Props) {
  const [inst, setInst] = useState<VLInst | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then((d: VLInst | null) => {
        if (d) setInst({ vastePostenOverzicht: d.vastePostenOverzicht, vastePostenAfwijkingProcent: d.vastePostenAfwijkingProcent, vastePostenVergelijk: d.vastePostenVergelijk, vastePostenNieuwDrempel: d.vastePostenNieuwDrempel, vastePostenSubtabelPeriode: d.vastePostenSubtabelPeriode, vastePostenVerbergDrempel: d.vastePostenVerbergDrempel });
      })
      .catch(() => {});
  }, []);

  async function opslaan(update: Partial<VLInst>) {
    if (!inst) return;
    setInst({ ...inst, ...update });
    setBezig(true);
    setFout(null);
    const res = await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    setBezig(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setFout(d.error ?? 'Opslaan mislukt.');
      return;
    }
    window.dispatchEvent(new CustomEvent('vaste-posten-inst-applied', { detail: update }));
  }

  const tooltipTekst = (
    <p style={{ margin: 0 }}>Bepaalt hoe vaste posten op de Vaste Posten pagina worden getoond, vergeleken met voorgaande periodes, en wanneer ze automatisch verborgen of als 'nieuw' gemarkeerd worden. Elk veld hieronder heeft een eigen toelichting.</p>
  );

  const rijStijl: React.CSSProperties = compact
    ? { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }
    : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
  const labelStijl: React.CSSProperties = { fontSize: 13, color: 'var(--text-h)' };
  const selectStijl: React.CSSProperties = { width: 110, flexShrink: 0, marginLeft: 'auto' };

  const maandOpties = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36];

  const velden = (
    <div className={compact ? 'inst-velden' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 12 }}>
      {compact && <style>{`.inst-velden > div { transition: background 80ms, border-color 80ms; } .inst-velden > div:hover { background: var(--accent-dim) !important; border-color: var(--accent) !important; }`}</style>}
      {/* 1. Periode voor verwachte datum */}
      <div style={rijStijl}>
        <span style={labelStijl}>Periode voor verwachte datum</span>
        <InfoTooltip volledigeBreedte tekst="Aantal voorgaande maanden waaruit de gemiddelde dag-van-de-maand wordt afgeleid waarop een vaste post normaal binnenkomt. Die gemiddelde dag wordt getoond als verwachte datum in de huidige periode. Met 'Dit jaar' worden alle voorgaande maanden van het geselecteerde jaar gebruikt." />
        <select
          value={inst?.vastePostenOverzicht ?? '4'}
          onChange={e => opslaan({ vastePostenOverzicht: e.target.value })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(d => (
            <option key={d} value={String(d)}>{d} {d === 1 ? 'maand' : 'maanden'}</option>
          ))}
          <option value="jaar">Dit jaar</option>
          <option value="alles">Alle maanden</option>
        </select>
      </div>

      {/* 2. Periode voor gemiddeld bedrag */}
      <div style={rijStijl}>
        <span style={labelStijl}>Periode voor gemiddeld bedrag</span>
        <InfoTooltip volledigeBreedte tekst="Aantal voorgaande maanden waaruit het gemiddelde bedrag wordt berekend. Het werkelijke bedrag van de huidige periode wordt hiermee vergeleken om de afwijking te bepalen. Wanneer de transactie van deze periode nog niet binnen is, wordt het meest recente bedrag uit deze vergelijkperiode getoond als verwachte waarde. Met 'Dit jaar' worden alle voorgaande maanden van het geselecteerde jaar gebruikt." />
        <select
          value={inst?.vastePostenVergelijk ?? '3'}
          onChange={e => opslaan({ vastePostenVergelijk: e.target.value })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(d => (
            <option key={d} value={String(d)}>{d} {d === 1 ? 'maand' : 'maanden'}</option>
          ))}
          <option value="jaar">Dit jaar</option>
          <option value="alles">Alle maanden</option>
        </select>
      </div>

      {/* 3. Drempel afwijkings-markering */}
      <div style={rijStijl}>
        <span style={labelStijl}>Drempel afwijkings-badge</span>
        <InfoTooltip volledigeBreedte tekst="Als het werkelijke bedrag met meer dan dit percentage afwijkt van het gemiddelde, wordt een 'gestegen met' of 'gedaald met' badge getoond bij de vaste post." />
        <select
          value={inst?.vastePostenAfwijkingProcent ?? 0}
          onChange={e => opslaan({ vastePostenAfwijkingProcent: parseInt(e.target.value) })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {[5, 10, 15, 20, 25, 30].map(d => (
            <option key={d} value={d}>{d}%</option>
          ))}
        </select>
      </div>

      {/* 4. Periode voor "nieuw" badge */}
      <div style={rijStijl}>
        <span style={labelStijl}>Periode voor &quot;nieuw&quot; badge</span>
        <InfoTooltip volledigeBreedte tekst="Als een vaste post in de afgelopen periode niet is voorgekomen — of helemaal nooit eerder — krijgt deze de badge 'nieuw' in plaats van 'ontbrak X maanden'. Een terugkomer na lange afwezigheid wordt zo ook als nieuw gemarkeerd. Met 'Dit jaar' geldt: nieuw als geen voorkomens dit jaar vóór de huidige periode." />
        <select
          value={inst?.vastePostenNieuwDrempel ?? '12'}
          onChange={e => opslaan({ vastePostenNieuwDrempel: e.target.value })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {[6, 9, 12, 18, 24, 36].map(d => (
            <option key={d} value={String(d)}>{d} maanden</option>
          ))}
          <option value="jaar">Dit jaar</option>
          <option value="alles">Alle maanden</option>
        </select>
      </div>

      {/* 5. Periode voor subtabel transacties */}
      <div style={rijStijl}>
        <span style={labelStijl}>Periode voor weergave transacties</span>
        <InfoTooltip volledigeBreedte tekst="Bepaalt welke transacties zichtbaar zijn in de uitklapbare subtabel onder een vaste post. Kies een aantal voorgaande maanden (inclusief de huidige), of 'Dit jaar' om alle transacties van januari t/m december van het geselecteerde jaar te tonen." />
        <select
          value={inst?.vastePostenSubtabelPeriode ?? '3'}
          onChange={e => opslaan({ vastePostenSubtabelPeriode: e.target.value })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(d => (
            <option key={d} value={String(d)}>{d} {d === 1 ? 'maand' : 'maanden'}</option>
          ))}
          <option value="jaar">Dit jaar</option>
          <option value="alles">Alle maanden</option>
        </select>
      </div>

      {/* 6. Periode voor automatisch verbergen */}
      <div style={rijStijl}>
        <span style={labelStijl}>Periode voor automatisch verbergen</span>
        <InfoTooltip volledigeBreedte tekst="Een vaste post wordt verborgen uit de Vaste Posten pagina als er in de afgelopen periode (inclusief de huidige) geen enkele matchende transactie was. Zodra er weer een matchende transactie binnenkomt verschijnt de regel automatisch terug. De 'ontbrak X maanden' badge gebruikt deze instelling ook als bovengrens. Met 'Dit jaar': verborgen als geen voorkomens dit jaar tot nu toe." />
        <select
          value={inst?.vastePostenVerbergDrempel ?? '4'}
          onChange={e => opslaan({ vastePostenVerbergDrempel: e.target.value })}
          className={inputCls}
          style={selectStijl}
          disabled={bezig || !inst}
        >
          {maandOpties.map(d => (
            <option key={d} value={String(d)}>{d} {d === 1 ? 'maand' : 'maanden'}</option>
          ))}
          <option value="jaar">Dit jaar</option>
          <option value="alles">Alle maanden</option>
        </select>
      </div>
    </div>
  );

  // Compact mode (popover/modal) — geen section-title wrapper, geen card
  if (compact) {
    if (!inst) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Laden…</div>;
    return (
      <div>
        {velden}
        {fout && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{fout}</p>}
      </div>
    );
  }

  const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };

  if (!inst) return (
    <section data-onboarding="inst-vaste-posten">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Vaste Posten instellingen</p>
        <MiniTourKnop tourId="vaste-posten" type="instelling" />
      </div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={subKop}>Vaste Posten</p>
        </div>
        <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>Laden…</div>
      </div>
    </section>
  );

  return (
    <section data-onboarding="inst-vaste-posten">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Vaste Posten instellingen</p>
        <MiniTourKnop tourId="vaste-posten" type="instelling" />
      </div>
      <div data-onboarding="inst-vaste-posten-tabel" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div
          style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          onContextMenu={e => {
            if (localStorage.getItem('dev-preview-modus') !== 'true') return;
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'vaste-posten', x: e.clientX, y: e.clientY } }));
          }}
        >
          <p style={subKop}>Vaste Posten</p>
          <InfoTooltip volledigeBreedte tekst={tooltipTekst} />
          <div style={{ marginLeft: 'auto' }}>
            <PreviewKnoppen sectieId="vaste-posten" />
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {velden}
          {fout && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{fout}</p>}
        </div>
      </div>
    </section>
  );
}
