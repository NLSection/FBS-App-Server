'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import PreviewKnoppen from './PreviewKnoppen';
import { useLookupData } from '@/features/instellingen/hooks/LookupContext';

interface RekeningGroep {
  id: number;
  naam: string;
  volgorde: number;
  rekening_ids: number[];
}

interface Rekening {
  id: number;
  iban: string;
  naam: string;
  type: 'betaal' | 'spaar';
  kleur: string | null;
}

const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';
const labelCls = 'block text-xs text-[var(--text-dim)] mb-1';
const btnOpslaan = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' };
const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };

export default function RekeningGroepenBeheer() {
  const [groepen, setGroepen]       = useState<RekeningGroep[]>([]);
  const [rekeningen, setRekeningen] = useState<Rekening[]>([]);
  const [fout] = useState<string | null>(null);
  const [hoverId, setHoverId]       = useState<number | null>(null);
  const [toonToevoegen, setToonToevoegen] = useState(false);

  // Toevoegformulier
  const [formNaam, setFormNaam]         = useState('');
  const [formRekIds, setFormRekIds]     = useState<Set<number>>(new Set());
  const [toevoegBezig, setToevoegBezig] = useState(false);
  const [toevoegFout, setToevoegFout]   = useState<string | null>(null);

  // Bewerkformulier
  const [bewerkId, setBewerkId]         = useState<number | null>(null);
  const [bewerkNaam, setBewerkNaam]     = useState('');
  const [bewerkRekIds, setBewerkRekIds] = useState<Set<number>>(new Set());
  const [bewerkBezig, setBewerkBezig]   = useState(false);
  const [bewerkFout, setBewerkFout]     = useState<string | null>(null);
  const [bevestigVerwijder, setBevestigVerwijder] = useState(false);

  // Drag & drop
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: lookup, refresh: refreshLookup } = useLookupData();

  // Sync lookup-data uit context naar lokale state.
  useEffect(() => {
    if (!lookup) return;
    setGroepen((lookup.rekeningGroepen as RekeningGroep[]) ?? []);
    setRekeningen((lookup.rekeningen as Rekening[]) ?? []);
  }, [lookup]);

  useEffect(() => {
    const handler = () => refreshLookup();
    window.addEventListener('instellingen-refresh', handler);
    return () => window.removeEventListener('instellingen-refresh', handler);
  }, [refreshLookup]);

  // ── Toevoegen ──────────────────────────────────────────────────────────────
  async function handleToevoegen(e: React.FormEvent) {
    e.preventDefault();
    if (!formNaam.trim()) return;
    setToevoegBezig(true);
    setToevoegFout(null);
    const res = await fetch('/api/rekening-groepen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: formNaam.trim(), rekening_ids: [...formRekIds] }),
    });
    setToevoegBezig(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setToevoegFout(d.error ?? 'Toevoegen mislukt.');
      return;
    }
    setFormNaam('');
    setFormRekIds(new Set());
    setToonToevoegen(false);
    refreshLookup();
    window.dispatchEvent(new Event('instellingen-refresh'));
  }

  // ── Bewerken ───────────────────────────────────────────────────────────────
  function startBewerk(groep: RekeningGroep) {
    setBewerkId(groep.id);
    setBewerkNaam(groep.naam);
    setBewerkRekIds(new Set(groep.rekening_ids));
    setBewerkFout(null);
    setBevestigVerwijder(false);
  }

  async function handleOpslaan() {
    if (bewerkId === null) return;
    setBewerkBezig(true);
    setBewerkFout(null);
    const res = await fetch(`/api/rekening-groepen/${bewerkId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: bewerkNaam.trim(), rekening_ids: [...bewerkRekIds] }),
    });
    setBewerkBezig(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setBewerkFout(d.error ?? 'Opslaan mislukt.');
      return;
    }
    setBewerkId(null);
    refreshLookup();
    window.dispatchEvent(new Event('instellingen-refresh'));
  }

  async function handleVerwijder() {
    if (bewerkId === null) return;
    const res = await fetch(`/api/rekening-groepen/${bewerkId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setBewerkFout(d.error ?? 'Verwijderen mislukt.');
      setBevestigVerwijder(false);
      return;
    }
    setBewerkId(null);
    setBevestigVerwijder(false);
    refreshLookup();
    window.dispatchEvent(new Event('instellingen-refresh'));
  }

  // ── Drag & drop volgorde ───────────────────────────────────────────────────
  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  async function handleDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (from === null || from === index) return;

    const nieuw = [...groepen];
    const [verplaatst] = nieuw.splice(from, 1);
    nieuw.splice(index, 0, verplaatst);

    setGroepen(nieuw);
    await fetch('/api/rekening-groepen/volgorde', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nieuw.map((g, i) => ({ id: g.id, volgorde: i }))),
    });
    refreshLookup();
  }

  // ── Chips helper ───────────────────────────────────────────────────────────
  function RekeningChips({ geselecteerd, onChange }: { geselecteerd: Set<number>; onChange: (s: Set<number>) => void }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rekeningen.map(r => {
          const actief = geselecteerd.has(r.id);
          const kleur = r.kleur ?? '#748ffc';
          return (
            <button key={r.id} type="button"
              onClick={() => { const n = new Set(geselecteerd); if (actief) n.delete(r.id); else n.add(r.id); onChange(n); }}
              style={{ padding: '3px 10px', fontSize: 12, borderRadius: 12, cursor: 'pointer', border: actief ? `1.5px solid color-mix(in srgb, ${kleur} 30%, transparent)` : '1px solid var(--border)', background: actief ? `color-mix(in srgb, ${kleur} 15%, transparent)` : 'var(--bg-base)', color: actief ? kleur : 'var(--text-dim)', fontWeight: actief ? 600 : 400, transition: 'all 0.15s' }}>
              {r.naam}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const tooltipTekst = 'Maak groepen van rekeningen aan om ze als aparte tabbladen op het Dashboard en de Transacties pagina te tonen. Zonder groepen worden alle transacties van alle rekeningen samen weergegeven op het Dashboard. Elke groep toont een eigen Balans Budgetten en Potjes tabel en Overzicht per Categorie tabel. De volgorde van de groepen bepaalt de tabvolgorde — sleep rijen om de volgorde aan te passen. Het eerste tabblad is de startweergave van het Dashboard.';

  return (
    <div id="rekening-groepen" data-onboarding="inst-rekeninggroepen">

      {/* Toevoeg-knop + formulier — boven de card */}
      <button
        onClick={() => setToonToevoegen(v => !v)}
        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 12 }}>
        {toonToevoegen ? 'Annuleer' : '+ Groep toevoegen'}
      </button>
      {toonToevoegen && (
        <form onSubmit={handleToevoegen} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <label className={labelCls}>Naam</label>
            <input className={inputCls} value={formNaam} onChange={e => setFormNaam(e.target.value)} placeholder="Bijv. Huishouden" style={{ maxWidth: 300 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className={labelCls}>Rekeningen</label>
            <RekeningChips geselecteerd={formRekIds} onChange={setFormRekIds} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={toevoegBezig || !formNaam.trim()}
              style={{ ...btnOpslaan, opacity: toevoegBezig || !formNaam.trim() ? 0.5 : 1 }}>
              Toevoegen
            </button>
            <button type="button"
              onClick={() => { setToonToevoegen(false); setFormNaam(''); setFormRekIds(new Set()); setToevoegFout(null); }}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, padding: '7px 16px', borderRadius: 6, cursor: 'pointer' }}>
              Annuleer
            </button>
          </div>
          {toevoegFout && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{toevoegFout}</p>}
        </form>
      )}
      {fout && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{fout}</p>}

      {/* Rekeninggroepen card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div
          style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          onContextMenu={e => {
            if (localStorage.getItem('dev-preview-modus') !== 'true') return;
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'rekeninggroepen', x: e.clientX, y: e.clientY } }));
          }}
        >
          <p style={subKop}>Rekeninggroepen</p>
          <InfoTooltip volledigeBreedte tekst={tooltipTekst} />
          <div style={{ marginLeft: 'auto' }}>
            <PreviewKnoppen sectieId="rekeninggroepen" />
          </div>
        </div>

        {/* Tabel — edge-to-edge in de card */}
        {groepen.length === 0 ? (
          <p className="empty" style={{ margin: '0 20px 16px' }}>Nog geen rekeninggroepen aangemaakt.</p>
        ) : (
          <div className="table-wrapper">
            <table>
                <thead>
                  <tr>
                    <th style={{ width: 30, padding: '8px 4px' }} />
                    <th>Naam</th>
                    <th>Gekoppelde Rekeningen</th>
                  </tr>
                </thead>
                <tbody>
                  {groepen.map((groep, index) => (
                    <Fragment key={groep.id}>
                      <tr
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={e => handleDragOver(e, index)}
                        onDrop={() => handleDrop(index)}
                        onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
                        onClick={() => { if (bewerkId !== groep.id) startBewerk(groep); }}
                        onMouseEnter={() => setHoverId(groep.id)}
                        onMouseLeave={() => setHoverId(null)}
                        style={{
                          cursor: 'pointer',
                          background: bewerkId === groep.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : hoverId === groep.id ? 'var(--bg-hover)' : undefined,
                          borderTop: dragOverIndex === index ? '2px solid var(--accent)' : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center', cursor: 'grab', color: 'var(--text-dim)', fontSize: 14, padding: '8px 4px' }}>⠿</td>
                        <td>{groep.naam}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 4px' }}>
                          {groep.rekening_ids.length === 0
                            ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                            : groep.rekening_ids.map(rid => {
                                const rek = rekeningen.find(r => r.id === rid);
                                const kleur = rek?.kleur ?? '#748ffc';
                                return (
                                  <span key={rid} style={{ padding: '1px 8px', fontSize: 11, borderRadius: 10, background: `color-mix(in srgb, ${kleur} 15%, transparent)`, color: kleur, border: `1px solid color-mix(in srgb, ${kleur} 30%, transparent)`, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                    {rek?.naam ?? rid}
                                  </span>
                                );
                              })
                          }
                          </div>
                        </td>
                      </tr>
                      {bewerkId === groep.id && (
                        <tr>
                          <td colSpan={3} style={{ padding: '16px 20px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                            <div style={{ marginBottom: 12 }}>
                              <label className={labelCls}>Naam</label>
                              <input className={inputCls} value={bewerkNaam} onChange={e => setBewerkNaam(e.target.value)} style={{ maxWidth: 300 }} />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label className={labelCls}>Rekeningen</label>
                              <RekeningChips geselecteerd={bewerkRekIds} onChange={setBewerkRekIds} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button type="button" onClick={handleOpslaan} disabled={bewerkBezig || !bewerkNaam.trim()}
                                style={{ ...btnOpslaan, opacity: bewerkBezig || !bewerkNaam.trim() ? 0.5 : 1 }}>
                                Opslaan
                              </button>
                              <button type="button" onClick={() => { setBewerkId(null); setBevestigVerwijder(false); }}
                                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, padding: '7px 16px', borderRadius: 6, cursor: 'pointer' }}>
                                Annuleer
                              </button>
                              <div style={{ flex: 1 }} />
                              {bevestigVerwijder ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 12, color: 'var(--red)' }}>Groep verwijderen?</span>
                                  <button type="button" onClick={handleVerwijder}
                                    style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                                    Verwijderen
                                  </button>
                                  <button type="button" onClick={() => setBevestigVerwijder(false)}
                                    style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                    Annuleer
                                  </button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => setBevestigVerwijder(true)} title="Verwijder"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center' }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              )}
                            </div>
                            {bewerkFout && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{bewerkFout}</p>}
                          </td>
                        </tr>
                      )}
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
