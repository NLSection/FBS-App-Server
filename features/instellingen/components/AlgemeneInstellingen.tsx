// FILE: AlgemeneInstellingen.tsx
// AANGEMAAKT: 25-03-2026 21:00
// VERSIE: 2
// GEWIJZIGD: 12-04-2026
//
// WIJZIGINGEN (12-04-2026):
// - Periode configuraties: modal na opslaan startdag + uitklapbare geschiedenis
// WIJZIGINGEN (25-03-2026 21:00):
// - Initiële aanmaak: MaandStartDag instelling (1–28)

'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import MiniTourKnop from '@/components/MiniTourKnop';
import Modal from '@/components/Modal';
import PreviewKnoppen from './PreviewKnoppen';
import WipBadge from '@/components/WipBadge';
import { MINI_TOURS, STAP_LIBRARY } from '@/features/onboarding/components/OnboardingWizard';

const MAANDEN_LANG = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';
const labelCls = 'block text-xs text-[var(--text-dim)] mb-1';
const btnOpslaan = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' };
const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };

const TOUR_LABELS: Record<string, string> = {
  'onboarding-volledig': 'Volledige onboarding', 'inst-startdag': 'Startdag',
  'dashboard': 'Dashboard', 'dashboard-bls': 'Dashboard BLS', 'dashboard-cat': 'Dashboard Categorie',
  'vaste-posten': 'Vaste Posten', 'rekeningen': 'Rekeningen', 'rekeninggroepen': 'Rekeninggroepen',
  'categorieen': 'Categorieën', 'backup': 'Backup', 'import': 'Import',
  'transacties': 'Transacties', 'categorisatie': 'Categorisatie', 'trends': 'Trends', 'instellingen': 'Instellingen',
};

interface PeriodeConfig {
  id: number;
  maandStartDag: number;
  geldigVanaf: string;
  aangemaaktOp: string;
}

function berekenPeriode(startdag: number) {
  const nu = new Date();
  let startMaand = nu.getMonth();
  let startJaar  = nu.getFullYear();
  if (nu.getDate() < startdag) {
    startMaand--;
    if (startMaand < 0) { startMaand = 11; startJaar--; }
  }
  const eindMaand = (startMaand + 1) % 12;
  const eindJaar  = startMaand === 11 ? startJaar + 1 : startJaar;
  const eindDag   = startdag > 1 ? startdag - 1 : new Date(eindJaar, eindMaand + 1, 0).getDate();
  return {
    start: `${startdag} ${MAANDEN_LANG[startMaand]}`,
    eind:  `${eindDag} ${MAANDEN_LANG[eindMaand]}`,
    label: `Financiële maand ${MAANDEN_LANG[eindMaand]}`,
  };
}

function geldigVanafLabel(geldigVanaf: string): string {
  if (geldigVanaf === '0000-01') return 'Alle maanden';
  const [y, m] = geldigVanaf.split('-').map(Number);
  return `${MAANDEN_LANG[m - 1]} ${y}`;
}

function geldigTotLabel(geldigVanaf: string | undefined): string {
  if (!geldigVanaf) return 'heden';
  const [y, m] = geldigVanaf.split('-').map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${MAANDEN_LANG[prevM - 1]} ${prevY}`;
}

function effectiefTot(c: PeriodeConfig, alleConfigs: PeriodeConfig[]): string {
  // Vroegste latere config die meer recent is dan C (en dus wint voor zijn periode)
  const latere = alleConfigs
    .filter(d => d.geldigVanaf > c.geldigVanaf && d.aangemaaktOp > c.aangemaaktOp)
    .sort((a, b) => a.geldigVanaf.localeCompare(b.geldigVanaf));
  return latere.length > 0 ? geldigTotLabel(latere[0].geldigVanaf) : 'heden';
}

type Profiel = 'potjesbeheer' | 'uitgavenbeheer' | 'handmatig';

interface Props {
  compact?: boolean;
  sectie?: 'startdag' | 'profiel' | 'minitour';
}

export default function AlgemeneInstellingen({ compact = false, sectie }: Props) {
  const [maandStartDag, setMaandStartDag] = useState<number>(27);
  const [bezig, setBezig]                 = useState(false);
  const [fout, setFout]                   = useState<string | null>(null);
  const [succes, setSucces]               = useState(false);
  const [helpModus, setHelpModus]         = useState(false);
  const [profiel, setProfiel]             = useState<Profiel | null>(null);
  const [tourKeuze, setTourKeuze]         = useState('onboarding-volledig');
  const [stapKeuze, setStapKeuze]         = useState(0);

  // Periode configs
  const [configs, setConfigs]             = useState<PeriodeConfig[]>([]);
  const [historieklap, setHistorieKlap]   = useState(true);

  // Modal state
  const [modalOpen, setModalOpen]         = useState(false);
  const [geplandeDag, setGeplandeDag]     = useState<number>(27);
  const [modalKeuze, setModalKeuze]       = useState<'huidig' | 'specifiek' | 'alle'>('huidig');
  const [modalMaand, setModalMaand]       = useState<number>(new Date().getMonth() + 1);
  const [modalJaar, setModalJaar]         = useState<number>(new Date().getFullYear());
  const [beschikbarePeriodes, setBeschikbarePeriodes] = useState<{ jaar: number; maand: number }[]>([]);

  function laad() {
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.maandStartDag) setMaandStartDag(d.maandStartDag);
        if (d?.gebruikersProfiel) setProfiel(d.gebruikersProfiel);
        setHelpModus(!!d?.helpModus);
      });
    fetch('/api/periode-configuraties')
      .then(r => r.ok ? r.json() : [])
      .then(setConfigs);
    fetch('/api/periodes')
      .then(r => r.ok ? r.json() : [])
      .then((periodes: { jaar: number; maand: number; status: string }[]) => {
        setBeschikbarePeriodes(periodes.filter(p => p.status !== 'toekomstig').map(p => ({ jaar: p.jaar, maand: p.maand })));
      });
  }

  useEffect(() => {
    laad();
    window.addEventListener('instellingen-refresh', laad);
    return () => window.removeEventListener('instellingen-refresh', laad);
  }, []);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setSucces(false);
    // Stel de geplande dag in en open de modal
    setGeplandeDag(maandStartDag);
    const nu = new Date();
    const nuJaar = nu.getFullYear();
    const nuMaand = nu.getMonth() + 1;
    // Gebruik de meest recente beschikbare periode als standaard, anders huidige kalendermaand
    const laatste = beschikbarePeriodes[beschikbarePeriodes.length - 1];
    setModalJaar(laatste?.jaar ?? nuJaar);
    setModalMaand(laatste?.maand ?? nuMaand);
    setModalKeuze('huidig');
    setModalOpen(true);
  }

  async function handleModalBevestig() {
    setBezig(true);
    setFout(null);

    let geldigVanaf: string;

    if (modalKeuze === 'huidig') {
      const nu = new Date();
      geldigVanaf = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}`;
    } else if (modalKeuze === 'specifiek') {
      geldigVanaf = `${modalJaar}-${String(modalMaand).padStart(2, '0')}`;
    } else {
      geldigVanaf = '0000-01';
    }

    const res = await fetch('/api/periode-configuraties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maandStartDag: geplandeDag, geldigVanaf }),
    });

    setBezig(false);
    setModalOpen(false);

    if (!res.ok) {
      const d = await res.json();
      setFout(d.error ?? 'Opslaan mislukt.');
    } else {
      setSucces(true);
      setTimeout(() => window.dispatchEvent(new CustomEvent('instellingen-refresh')), 800);
    }
  }

  async function handleVerwijderConfig(id: number) {
    const res = await fetch(`/api/periode-configuraties/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      setFout(d.error ?? 'Verwijderen mislukt.');
      return;
    }
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }

  function toggleHelpModus() {
    const nieuw = !helpModus;
    setHelpModus(nieuw);
    fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ helpModus: nieuw }),
    }).catch(() => { /* UI blijft in sync */ });
    window.dispatchEvent(new CustomEvent('helpmodus-changed', { detail: { aan: nieuw } }));
  }

  // Jaar/maand-opties op basis van beschikbare periodes
  const beschikbareJaren = [...new Set(beschikbarePeriodes.map(p => p.jaar))].sort((a, b) => a - b);
  const maandenVoorJaar  = (jaar: number) => beschikbarePeriodes.filter(p => p.jaar === jaar).map(p => p.maand).sort((a, b) => a - b);

  // ── Bare content (voor compact/modal gebruik) ────────────────────────────────

  const startdagContent = (
    <form onSubmit={handleFormSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <label className={labelCls}>Maand start dag</label>
          <select
            className={inputCls}
            value={maandStartDag}
            onChange={e => { setMaandStartDag(parseInt(e.target.value, 10)); setSucces(false); }}
            style={{ width: 'fit-content' }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14, flex: 1 }}>
          Kies de dag waarop jouw financiële maand begint.
        </p>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {fout   && <p style={{ color: 'var(--red)',   fontSize: 12, margin: 0 }}>{fout}</p>}
          {succes && <p style={{ color: 'var(--green)', fontSize: 12, margin: 0 }}>Opgeslagen.</p>}
          <button type="submit" disabled={bezig}
            style={{ ...btnOpslaan, opacity: bezig ? 0.6 : 1, cursor: bezig ? 'not-allowed' : 'pointer' }}>
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
      {/* Periode preview */}
      {(() => {
        const p = berekenPeriode(maandStartDag);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap' }}>{p.start}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-surface)', padding: '0 8px', fontSize: 11, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap' }}>{p.eind}</span>
          </div>
        );
      })()}

      {/* Periode geschiedenis */}
      {configs.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setHistorieKlap(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 10, transition: 'transform 0.15s', display: 'inline-block', transform: historieklap ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            Geconfigureerde perioden ({configs.length})
          </button>
          {historieklap && (
            <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--accent-dim)' }}>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Startdag</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Van toepassing op</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Ingesteld op</th>
                    <th style={{ padding: '6px 4px', width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c, i) => {
                    // Overschreven: er bestaat een latere config die dezelfde of een eerdere periode dekt
                    const overschreven = configs.some(d => d.aangemaaktOp > c.aangemaaktOp && d.geldigVanaf <= c.geldigVanaf);
                    return (
                    <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-h)', fontWeight: 600 }}>dag {c.maandStartDag}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {overschreven
                            ? (c.geldigVanaf === '0000-01' ? 'Alle maanden' : geldigVanafLabel(c.geldigVanaf))
                            : c.geldigVanaf === '0000-01'
                              ? `${beschikbarePeriodes.length > 0 ? `${MAANDEN_LANG[beschikbarePeriodes[0].maand - 1]} ${beschikbarePeriodes[0].jaar}` : 'Alle maanden'} – ${effectiefTot(c, configs)}`
                              : `${geldigVanafLabel(c.geldigVanaf)} – ${effectiefTot(c, configs)}`
                          }
                          {overschreven && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: '#b45309', background: 'none', border: '1px solid #b45309', borderRadius: 4, padding: '0px 4px', whiteSpace: 'nowrap' }}>
                              overschreven
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {c.aangemaaktOp.replace('T', ' ').substring(0, 16)}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        {(() => {
                          const initId = configs.filter(x => x.geldigVanaf === '0000-01').reduce((a, b) => a.id < b.id ? a : b, configs.find(x => x.geldigVanaf === '0000-01')!).id;
                          const heeftSpecifiek = configs.some(x => x.geldigVanaf !== '0000-01');
                          const meerdercatchAll = configs.filter(x => x.geldigVanaf === '0000-01').length > 1;
                          if (c.id === initId) return !heeftSpecifiek && meerdercatchAll;
                          return true;
                        })() && (
                          <button
                            type="button"
                            title="Verwijder configuratie"
                            onClick={() => handleVerwijderConfig(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'inline-flex', alignItems: 'center' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </form>
  );

  const PROFIEL_DEFAULTS: Record<'potjesbeheer' | 'uitgavenbeheer', { dashboardBlsTonen: boolean; dashboardCatTonen: boolean; omboekingenAuto: boolean }> = {
    potjesbeheer:   { dashboardBlsTonen: true,  dashboardCatTonen: true, omboekingenAuto: true  },
    uitgavenbeheer: { dashboardBlsTonen: false, dashboardCatTonen: true, omboekingenAuto: false },
  };

  async function handleKiesProfiel(p: 'potjesbeheer' | 'uitgavenbeheer') {
    setProfiel(p);
    const defaults = PROFIEL_DEFAULTS[p];
    await Promise.all([
      fetch('/api/instellingen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gebruikersProfiel: p, ...defaults }),
      }),
      fetch('/api/dashboard-tabs/profiel-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blsTonen: defaults.dashboardBlsTonen, catTonen: defaults.dashboardCatTonen }),
      }),
    ]);
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }

  async function handleKiesHandmatig() {
    setProfiel('handmatig');
    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gebruikersProfiel: 'handmatig' }),
    });
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }

  const kaartStijl = (p: 'potjesbeheer' | 'uitgavenbeheer'): React.CSSProperties => ({
    width: '100%', paddingBottom: '100%', height: 0, borderRadius: 12, cursor: 'pointer',
    border: profiel === p ? '2px solid var(--accent)' : '2px solid var(--border)',
    transition: 'border-color 0.15s',
    position: 'relative', overflow: 'hidden',
  });

  const actifBadge = (p: 'potjesbeheer' | 'uitgavenbeheer') => profiel === p ? (
    <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5.5 3.5 7.5 8.5 2.5" /></svg>
      Actief
    </span>
  ) : null;

  const profielContent = (
    <>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Potjesbeheer kaart */}
      <div style={{ flex: 1, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={kaartStijl('potjesbeheer')} onClick={() => handleKiesProfiel('potjesbeheer')}>
          {actifBadge('potjesbeheer')}
          <img src="/PotjesbeheerCard.png" alt="Potjesbeheer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>Budgetbeheer</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Budgetten · Omboekingen · Categoriekoppeling</p>
          </div>
        </div>
      </div>
      {/* Uitgavenbeheer kaart */}
      <div style={{ flex: 1, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={kaartStijl('uitgavenbeheer')} onClick={() => handleKiesProfiel('uitgavenbeheer')}>
          {actifBadge('uitgavenbeheer')}
          <img src="/UitgavenbeheerCard.png" alt="Uitgavenbeheer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>Uitgavenbeheer</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Categorieën · Trends · Bestedingspatroon</p>
          </div>
        </div>
      </div>
    </div>
    {/* Handmatige profiel configuratie balk */}
    <div
      onClick={handleKiesHandmatig}
      style={{
        marginTop: 12, padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
        border: profiel === 'handmatig' ? '2px solid var(--accent)' : '1px solid var(--border)',
        background: profiel === 'handmatig' ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-card))' : 'var(--bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Handmatige profiel configuratie</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-dim)' }}>Alle profiel-gestuurde instellingen zelf beheren, zonder automatische beperkingen.</p>
      </div>
      {profiel === 'handmatig' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5.5 3.5 7.5 8.5 2.5" /></svg>
          Actief
        </span>
      )}
    </div>
    </>
  );

  const minitourContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          ...(compact ? { padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', transition: 'background 80ms, border-color 80ms', cursor: 'default' } : {})
        }}
        onMouseEnter={compact ? (e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent)'; }) : undefined}
        onMouseLeave={compact ? (e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; }) : undefined}
      >
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Help-knoppen tonen <WipBadge /></p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Toont een help-knop naast elke sectie waarmee je een mini-rondleiding voor dat onderdeel kunt starten.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleHelpModus}
          role="switch"
          aria-checked={helpModus}
          style={{
            position: 'relative', width: 44, height: 24, borderRadius: 12,
            border: 'none', cursor: 'pointer',
            background: helpModus ? 'var(--accent)' : 'var(--border)',
            transition: 'background 0.2s', flexShrink: 0, padding: 0,
            marginLeft: 'auto',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: helpModus ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>
      <div
        data-onboarding="inst-rondleiding"
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          ...(compact ? { padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', transition: 'background 80ms, border-color 80ms', cursor: 'default' } : {})
        }}
        onMouseEnter={compact ? (e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent)'; }) : undefined}
        onMouseLeave={compact ? (e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; }) : undefined}
      >
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Rondleiding opnieuw starten <WipBadge /></p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Doorloop de volledige onboarding rondleiding opnieuw — zonder je data te wijzigen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('onboarding-herstart'))}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
            padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            flexShrink: 0, marginLeft: 'auto', whiteSpace: 'nowrap',
          }}
        >
          Start rondleiding →
        </button>
      </div>
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <select className={inputCls} style={{ flex: 1 }} value={tourKeuze} onChange={e => { setTourKeuze(e.target.value); setStapKeuze(0); }}>
              {Object.keys(MINI_TOURS).map(id => <option key={id} value={id}>{TOUR_LABELS[id] ?? id}</option>)}
            </select>
            <select className={inputCls} style={{ flex: 2 }} value={stapKeuze} onChange={e => setStapKeuze(Number(e.target.value))}>
              {(MINI_TOURS[tourKeuze] ?? []).map((id, i) => {
                const t = STAP_LIBRARY[id]?.titel;
                const label = t ? (typeof t === 'string' ? t : Object.values(t)[0] as string) : id;
                return <option key={id} value={i}>{i + 1}. {label}</option>;
              })}
            </select>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('dev-start-tour', { detail: { tourId: tourKeuze, stapIndex: stapKeuze } }))}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            Start vanaf stap {stapKeuze + 1}
          </button>
        </div>
      )}
    </div>
  );

  // ── Modal: keuze startdag geldigheid ────────────────────────────────────────

  const modal = (
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Startdag wijzigen naar dag ${geplandeDag}`} breedte={440}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 16px' }}>
        Vanaf welke maand geldt de nieuwe startdag?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Optie 1: Huidige maand */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" name="keuze" checked={modalKeuze === 'huidig'} onChange={() => setModalKeuze('huidig')} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>
              Vanaf deze maand ({MAANDEN_LANG[new Date().getMonth()]} {new Date().getFullYear()})
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
              Historische perioden blijven ongewijzigd.
            </p>
          </div>
        </label>

        {/* Optie 2: Specifieke maand */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" name="keuze" checked={modalKeuze === 'specifiek'} onChange={() => setModalKeuze('specifiek')} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Vanaf een andere maand</p>
            <p style={{ margin: '2px 0 6px', fontSize: 12, color: 'var(--text-dim)' }}>
              Kies een maand waarvoor transacties beschikbaar zijn.
            </p>
            {modalKeuze === 'specifiek' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={modalMaand}
                  onChange={e => setModalMaand(parseInt(e.target.value))}
                  disabled={maandenVoorJaar(modalJaar).length <= 1}
                  className={inputCls}
                  style={{ width: 'auto', opacity: maandenVoorJaar(modalJaar).length <= 1 ? 0.5 : 1 }}
                >
                  {maandenVoorJaar(modalJaar).map(m => <option key={m} value={m}>{MAANDEN_LANG[m - 1]}</option>)}
                </select>
                <select
                  value={modalJaar}
                  onChange={e => {
                    const jaar = parseInt(e.target.value);
                    setModalJaar(jaar);
                    const maanden = maandenVoorJaar(jaar);
                    if (!maanden.includes(modalMaand)) setModalMaand(maanden[maanden.length - 1] ?? 1);
                  }}
                  disabled={beschikbareJaren.length <= 1}
                  className={inputCls}
                  style={{ width: 'auto', opacity: beschikbareJaren.length <= 1 ? 0.5 : 1 }}
                >
                  {beschikbareJaren.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
            )}
          </div>
        </label>

        {/* Optie 3: Alle maanden */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" name="keuze" checked={modalKeuze === 'alle'} onChange={() => setModalKeuze('alle')} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Alle maanden met transacties</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
              De nieuwe startdag geldt voor alle maanden. Eerdere specifieke instellingen blijven bewaard in de geschiedenis en kunnen daar worden verwijderd.
            </p>
          </div>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setModalOpen(false)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={handleModalBevestig}
          disabled={bezig}
          style={{ ...btnOpslaan, opacity: bezig ? 0.6 : 1, cursor: bezig ? 'not-allowed' : 'pointer' }}
        >
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </Modal>
  );

  // ── Compact / modal mode ─────────────────────────────────────────────────────

  if (compact) {
    if (sectie === 'startdag') return <>{startdagContent}{modal}</>;
    if (sectie === 'profiel')  return profielContent;
    if (sectie === 'minitour') return minitourContent;
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{startdagContent}{modal}{profielContent}{minitourContent}</div>;
  }

  // ── Volledige pagina-render ──────────────────────────────────────────────────

  if (sectie === 'minitour') {
    return (
      <>
        {modal}
        <div data-onboarding="inst-minitour" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            <p style={subKop}>Hulp & Rondleiding</p>
          </div>
          <div style={{ padding: 20 }}>
            {minitourContent}
          </div>
        </div>
      </>
    );
  }

  const toonStartdag = !sectie || sectie === 'startdag';
  const toonProfiel  = !sectie || sectie === 'profiel';

  return (
    <>
      {modal}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <p className="section-title" style={{ margin: 0 }}>Algemene instellingen</p>
          <MiniTourKnop tourId="inst-startdag" type="instelling" />
        </div>

        {toonStartdag && (
          <div data-onboarding="inst-startdag" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            <div
              style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              onContextMenu={e => {
                if (localStorage.getItem('dev-preview-modus') !== 'true') return;
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'startdag', x: e.clientX, y: e.clientY } }));
              }}
            >
              <p style={subKop}>Startdag financiële periode</p>
              <InfoTooltip volledigeBreedte tekst="Stel hier in op welke dag van de maand een nieuwe financiële periode begint. Dit heeft invloed op de periodenavigatie op de Transacties-pagina, de tabellen Balans Budgetten en Potjes en Overzicht per Categorie op het Dashboard, en het Vaste Posten Overzicht. Een wijziging is direct zichtbaar na het opslaan." />
              <div style={{ marginLeft: 'auto' }}>
                <PreviewKnoppen sectieId="startdag" />
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {startdagContent}
            </div>
          </div>
        )}

        {toonProfiel && (
          <div id="inst-profiel" data-onboarding="inst-profiel" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={subKop}>Gebruikersprofiel</p>
              <InfoTooltip volledigeBreedte tekst="Kies hoe je FBS wilt gebruiken. Bij Budgetbeheer worden omboekingen tussen je eigen rekeningen automatisch herkend en is de Balans Budgetten en Potjes tabel beschikbaar. Bij Uitgavenbeheer ligt de focus op categorisatie en het Overzicht per Categorie. Je kunt op elk moment wisselen." />
            </div>
            <div style={{ padding: 20 }}>
              {profielContent}
            </div>
          </div>
        )}

      </section>
    </>
  );
}
