'use client';

import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import ProfielBeheerBadge from './ProfielBeheerBadge';
import { useLookupData } from '@/features/instellingen/hooks/LookupContext';

interface DashboardTab {
  id: number;
  type: 'groep' | 'rekening';
  entiteit_id: number;
  naam: string;
  bls_tonen: boolean;
  cat_tonen: boolean;
  bls_trx_uitgeklapt: boolean;
  cat_uitklappen: boolean;
  cat_trx_uitgeklapt: boolean;
  volgorde: number;
}
interface Keuze { type: 'groep' | 'rekening'; entiteit_id: number; naam: string; }

const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };
const btnOpslaan = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' };
const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';

function ToggleKlein({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 32, height: 18, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: disabled ? 0.4 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => !disabled && onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 9, background: checked ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' }} />
      <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </label>
  );
}

export default function DashboardTabsBeheer({ compact = false }: { compact?: boolean } = {}) {
  const [tabs, setTabs] = useState<DashboardTab[]>([]);
  const [keuzes, setKeuzes] = useState<Keuze[]>([]);
  const [toonForm, setToonForm] = useState(false);
  const [formKeuze, setFormKeuze] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [profiel, setProfiel] = useState<string | null>(null);

  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: lookup, refresh: refreshLookup } = useLookupData();

  // Eigen tabs + instellingen apart laden (niet in lookup-data).
  const laadEigen = useCallback(async () => {
    const [r1, r4] = await Promise.all([
      fetch('/api/dashboard-tabs'),
      fetch('/api/instellingen'),
    ]);
    const tabData: DashboardTab[] = r1.ok ? await r1.json() : [];
    if (r4.ok) { const inst = await r4.json(); setProfiel(inst.gebruikersProfiel ?? null); }
    setTabs(tabData);
  }, []);

  useEffect(() => { laadEigen(); }, [laadEigen]);

  // Beschikbare keuzes berekenen uit tabs + lookup-data (groepen + rekeningen).
  useEffect(() => {
    if (!lookup) return;
    const groepen = (lookup.rekeningGroepen as { id: number; naam: string }[]) ?? [];
    const rekeningen = (lookup.rekeningen as { id: number; naam: string }[]) ?? [];
    const gebruikteGroepen = new Set(tabs.filter(t => t.type === 'groep').map(t => t.entiteit_id));
    const gebruikteRekeningen = new Set(tabs.filter(t => t.type === 'rekening').map(t => t.entiteit_id));
    const beschikbaar: Keuze[] = [
      ...groepen.filter(g => !gebruikteGroepen.has(g.id)).map(g => ({ type: 'groep' as const, entiteit_id: g.id, naam: `Groep: ${g.naam}` })),
      ...rekeningen.filter(r => !gebruikteRekeningen.has(r.id)).map(r => ({ type: 'rekening' as const, entiteit_id: r.id, naam: `Rekening: ${r.naam}` })),
    ];
    setKeuzes(beschikbaar);
  }, [lookup, tabs]);

  useEffect(() => {
    const handler = () => { refreshLookup(); laadEigen(); };
    window.addEventListener('instellingen-refresh', handler);
    window.addEventListener('dash-inst-applied', handler);
    return () => {
      window.removeEventListener('instellingen-refresh', handler);
      window.removeEventListener('dash-inst-applied', handler);
    };
  }, [refreshLookup, laadEigen]);

  async function handleToevoegen(e: React.FormEvent) {
    e.preventDefault();
    if (!formKeuze) return;
    const [type, idStr] = formKeuze.split(':');
    const res = await fetch('/api/dashboard-tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, entiteit_id: Number(idStr) }),
    });
    if (!res.ok) { const d = await res.json(); setFout(d.error ?? 'Toevoegen mislukt.'); return; }
    setToonForm(false);
    setFormKeuze('');
    setFout(null);
    laadEigen();
  }

  async function handleToggle(id: number, veld: 'bls_tonen' | 'cat_tonen' | 'bls_trx_uitgeklapt' | 'cat_uitklappen' | 'cat_trx_uitgeklapt', v: boolean) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, [veld]: v } : t));
    await fetch(`/api/dashboard-tabs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [veld]: v }),
    });
    window.dispatchEvent(new CustomEvent('dash-inst-applied', { detail: { [veld]: v, tabId: id } }));
  }

  async function handleVerwijder(id: number) {
    await fetch(`/api/dashboard-tabs/${id}`, { method: 'DELETE' });
    laadEigen();
  }

  function handleDragStart(index: number) { dragIndex.current = index; }
  function handleDragOver(e: React.DragEvent, index: number) { e.preventDefault(); setDragOverIndex(index); }

  async function handleDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (from === null || from === index) return;

    const nieuw = [...tabs];
    const [verplaatst] = nieuw.splice(from, 1);
    nieuw.splice(index, 0, verplaatst);
    setTabs(nieuw);

    await fetch('/api/dashboard-tabs/volgorde', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nieuw.map((t, i) => ({ id: t.id, volgorde: i }))),
    });
    laadEigen();
  }

  const tooltipTekst = 'Bepaal welke rekeningen en rekeninggroepen als tabblad op het Dashboard verschijnen. Het meest linkse tabblad is de startpagina van de app. Per tabblad kun je instellen of de Balans Budgetten en Potjes tabel en de Overzicht per Categorie tabel getoond worden, en of rijen standaard uitgeklapt worden.';

  return (
    <div data-onboarding="inst-dashboard-tabs">

      {/* Toevoeg-knop + formulier — boven de card */}
      <button
        onClick={() => setToonForm(v => !v)}
        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 12 }}>
        {toonForm ? 'Annuleer' : '+ Tabblad toevoegen'}
      </button>
      {toonForm && (
        <form onSubmit={handleToevoegen} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Rekening of groep</label>
            {keuzes.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Alle rekeningen en groepen zijn al toegevoegd als tabblad.</p>
              : <select className={inputCls} value={formKeuze} onChange={e => setFormKeuze(e.target.value)} style={{ maxWidth: 360 }}>
                  <option value="">Kies…</option>
                  {keuzes.map(k => (
                    <option key={`${k.type}:${k.entiteit_id}`} value={`${k.type}:${k.entiteit_id}`}>{k.naam}</option>
                  ))}
                </select>
            }
          </div>
          {fout && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{fout}</p>}
          {keuzes.length > 0 && (
            <button type="submit" disabled={!formKeuze} style={{ ...btnOpslaan, opacity: !formKeuze ? 0.5 : 1 }}>Toevoegen</button>
          )}
        </form>
      )}

      {/* Tabbladen card */}
      {!compact && (
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderRadius: '10px 10px 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
          <p style={subKop}>Dashboard tabbladen</p>
          <InfoTooltip volledigeBreedte tekst={tooltipTekst} />
        </div>
      )}
      <div style={compact ? undefined : { background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        {tabs.length === 0 ? (
          <p className="empty" style={{ margin: compact ? '8px 0' : '16px 20px' }}>Nog geen tabbladen geconfigureerd. Voeg een rekening of groep toe om te beginnen.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30, padding: '8px 4px' }} />
                  <th>Naam</th>
                  <th style={{ width: 50 }}>Type</th>
                  <th style={{ textAlign: 'center', width: 80 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span>Balans</span>
                      {(profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') && <ProfielBeheerBadge />}
                    </div>
                  </th>
                  <th style={{ textAlign: 'center', width: 80 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span>Categorie</span>
                      {(profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') && <ProfielBeheerBadge />}
                    </div>
                  </th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {tabs.map((tab, index) => (
                  <Fragment key={tab.id}>
                    <tr
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={e => handleDragOver(e, index)}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
                      style={{ borderTop: dragOverIndex === index ? '2px solid var(--accent)' : undefined }}
                    >
                      <td style={{ textAlign: 'center', cursor: 'grab', color: 'var(--text-dim)', fontSize: 14, padding: '8px 4px' }}>⠿</td>
                      <td style={{ fontWeight: 500 }}>{tab.naam}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {tab.type === 'groep' ? 'Groep' : 'Rekening'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ToggleKlein checked={tab.bls_tonen} onChange={v => handleToggle(tab.id, 'bls_tonen', v)} disabled={profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer'} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ToggleKlein checked={tab.cat_tonen} onChange={v => handleToggle(tab.id, 'cat_tonen', v)} disabled={profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer'} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleVerwijder(tab.id)} title="Verwijder"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr key={`${tab.id}-detail`}>
                        <td colSpan={6} style={{ background: 'var(--bg)', padding: '8px 16px 10px 48px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 200 }}>Balans: Transacties standaard uitgeklapt</span>
                              <ToggleKlein checked={tab.bls_trx_uitgeklapt} onChange={v => handleToggle(tab.id, 'bls_trx_uitgeklapt', v)} disabled={profiel === 'uitgavenbeheer'} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 200 }}>Categorieën: Subcategorieën standaard uitgeklapt</span>
                              <ToggleKlein checked={tab.cat_uitklappen} onChange={v => handleToggle(tab.id, 'cat_uitklappen', v)} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 200 }}>Categorieën: Transacties standaard uitgeklapt</span>
                              <ToggleKlein checked={tab.cat_trx_uitgeklapt} onChange={v => handleToggle(tab.id, 'cat_trx_uitgeklapt', v)} />
                            </div>
                          </div>
                        </td>
                      </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
