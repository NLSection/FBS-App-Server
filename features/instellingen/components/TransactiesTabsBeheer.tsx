'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import { useLookupData } from '@/features/instellingen/hooks/LookupContext';

interface TransactiesTab {
  id: number;
  type: 'groep' | 'rekening';
  entiteit_id: number;
  naam: string;
  volgorde: number;
}
interface Keuze { type: 'groep' | 'rekening'; entiteit_id: number; naam: string; }

const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };
const btnOpslaan = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' };
const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';

export default function TransactiesTabsBeheer({ compact = false }: { compact?: boolean } = {}) {
  const [tabs, setTabs] = useState<TransactiesTab[]>([]);
  const [keuzes, setKeuzes] = useState<Keuze[]>([]);
  const [toonForm, setToonForm] = useState(false);
  const [formKeuze, setFormKeuze] = useState('');
  const [fout, setFout] = useState<string | null>(null);

  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: lookup } = useLookupData();

  const laadTabs = useCallback(async () => {
    const r = await fetch('/api/transacties-tabs');
    setTabs(r.ok ? await r.json() : []);
  }, []);

  useEffect(() => { laadTabs(); }, [laadTabs]);

  // Beschikbare keuzes uit lookup-data + huidige tabs.
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

  async function handleToevoegen(e: React.FormEvent) {
    e.preventDefault();
    if (!formKeuze) return;
    const [type, idStr] = formKeuze.split(':');
    const res = await fetch('/api/transacties-tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, entiteit_id: Number(idStr) }),
    });
    if (!res.ok) { const d = await res.json(); setFout(d.error ?? 'Toevoegen mislukt.'); return; }
    setToonForm(false);
    setFormKeuze('');
    setFout(null);
    laadTabs();
  }

  async function handleVerwijder(id: number) {
    await fetch(`/api/transacties-tabs/${id}`, { method: 'DELETE' });
    laadTabs();
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

    await fetch('/api/transacties-tabs/volgorde', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nieuw.map((t, i) => ({ id: t.id, volgorde: i }))),
    });
    laadTabs();
  }

  return (
    <div>
      {/* Toevoeg-knop + formulier */}
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
          <p style={subKop}>Transacties tabbladen</p>
          <InfoTooltip volledigeBreedte tekst="Bepaal welke rekeningen en rekeninggroepen als tabblad op de Transacties-pagina verschijnen en in welke volgorde. Als er geen tabbladen zijn geconfigureerd worden alle rekeningen en groepen automatisch getoond." />
        </div>
      )}
      <div style={compact ? undefined : { background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        {tabs.length === 0 ? (
          <p className="empty" style={{ margin: compact ? '8px 0' : '16px 20px' }}>Nog geen tabbladen geconfigureerd — alle rekeningen en groepen worden automatisch getoond.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30, padding: '8px 4px' }} />
                  <th>Naam</th>
                  <th style={{ width: 70 }}>Type</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {tabs.map((tab, index) => (
                  <tr
                    key={tab.id}
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
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleVerwijder(tab.id)} title="Verwijder"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
