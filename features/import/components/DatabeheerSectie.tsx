'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Periode } from '@/lib/maandperiodes';

const MAAND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

type Stap = 'idle' | 'confirming' | 'bezig';

interface Bereik { datumVanaf: string; datumTm: string; label: string; }

function chipStijl(actief: boolean, gevaar = false): React.CSSProperties {
  if (actief) return {
    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: gevaar ? 'var(--red)' : 'var(--accent)', color: '#fff',
  };
  return {
    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 400, cursor: 'pointer',
    background: 'var(--bg-card)', color: 'var(--text-dim)', border: '1px solid var(--border)',
  };
}

export default function DatabeheerSectie() {
  const [periodes, setPeriodes]           = useState<Periode[]>([]);
  const [jaren, setJaren]                 = useState<Set<number>>(new Set());
  const [maanden, setMaanden]             = useState<Set<number>>(new Set());
  const [aantalTotaal, setAantalTotaal]   = useState<number | null>(null);
  const [stap, setStap]                   = useState<Stap>('idle');
  const [resultaat, setResultaat]         = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/periodes').then(r => r.ok ? r.json() : []).then(setPeriodes).catch(() => {});
  }, []);

  const jaarOpties  = [...new Set(periodes.map(p => p.jaar))].sort((a, b) => a - b);
  const eenJaar     = jaren.size === 1 ? [...jaren][0] : null;
  const maandOpties = eenJaar !== null ? periodes.filter(p => p.jaar === eenJaar) : [];

  function buildBereiken(): Bereik[] {
    if (jaren.size === 0) return [];
    if (eenJaar !== null && maanden.size > 0) {
      return [...maanden].sort((a, b) => a - b).map(m => {
        const p = maandOpties.find(p => p.maand === m)!;
        return { datumVanaf: p.start, datumTm: p.eind, label: `${MAAND_KORT[p.maand - 1]} ${p.jaar}` };
      });
    }
    return [...jaren].sort((a, b) => a - b).map(jaar => {
      const jp = periodes.filter(p => p.jaar === jaar);
      return { datumVanaf: jp[0].start, datumTm: jp[jp.length - 1].eind, label: String(jaar) };
    });
  }

  const bereiken = buildBereiken();
  const heeftSelectie = bereiken.length > 0;

  const fetchAantal = useCallback(async (b: Bereik[]) => {
    if (b.length === 0) { setAantalTotaal(null); return; }
    try {
      const counts = await Promise.all(
        b.map(r => fetch(`/api/transacties/periode?datumVanaf=${r.datumVanaf}&datumTm=${r.datumTm}`)
          .then(r => r.ok ? r.json() : { aantal: 0 })
          .then((d: { aantal: number }) => d.aantal))
      );
      setAantalTotaal(counts.reduce((s, n) => s + n, 0));
    } catch { setAantalTotaal(null); }
  }, []);

  useEffect(() => {
    setStap('idle');
    setResultaat(null);
    fetchAantal(bereiken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jaren, maanden]);

  function toggleJaar(jaar: number) {
    setJaren(prev => {
      const next = new Set(prev);
      if (next.has(jaar)) next.delete(jaar); else next.add(jaar);
      return next;
    });
    setMaanden(new Set());
  }

  function toggleMaand(maand: number) {
    setMaanden(prev => {
      const next = new Set(prev);
      if (next.has(maand)) next.delete(maand); else next.add(maand);
      return next;
    });
  }

  async function voerUit() {
    if (bereiken.length === 0) return;
    setStap('bezig');
    try {
      let totaalVerwijderd = 0;
      for (const b of bereiken) {
        const r = await fetch('/api/transacties/periode', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datumVanaf: b.datumVanaf, datumTm: b.datumTm }),
        });
        const d = await r.json() as { verwijderd: number };
        totaalVerwijderd += d.verwijderd;
      }
      setResultaat(`${totaalVerwijderd} transacties verwijderd.`);
      setJaren(new Set()); setMaanden(new Set()); setStap('idle');
      fetch('/api/periodes').then(r => r.ok ? r.json() : []).then(setPeriodes).catch(() => {});
    } catch {
      setResultaat('Er ging iets mis. Probeer opnieuw.');
      setStap('idle');
    }
  }

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Databeheer</p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Transacties verwijderen</p>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-dim)' }}>
          Selecteer een of meerdere jaren. Bij één geselecteerd jaar kun je ook specifieke maanden kiezen.
        </p>

        {/* Jaar-chips */}
        {jaarOpties.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Geen data in de database.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: maandOpties.length > 0 ? 12 : 0 }}>
              {jaarOpties.map(jaar => (
                <button key={jaar} onClick={() => toggleJaar(jaar)} style={chipStijl(jaren.has(jaar))}>
                  {jaar}
                </button>
              ))}
            </div>

            {/* Maand-chips — alleen bij exact 1 jaar */}
            {maandOpties.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {maandOpties.map(p => (
                  <button key={p.maand} onClick={() => toggleMaand(p.maand)} style={chipStijl(maanden.has(p.maand))}>
                    {MAAND_KORT[p.maand - 1]}
                  </button>
                ))}
              </div>
            )}

            {/* Actie */}
            {heeftSelectie && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-dim)' }}>
                  Geselecteerd: <strong style={{ color: 'var(--text-h)' }}>{bereiken.map(b => b.label).join(', ')}</strong>
                  {aantalTotaal !== null && <> — <strong style={{ color: 'var(--red)' }}>{aantalTotaal} transacties</strong></>}
                </p>

                {stap === 'idle' && (
                  <button onClick={() => setStap('confirming')} style={chipStijl(true, true)}>
                    Verwijderen…
                  </button>
                )}

                {stap === 'confirming' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Zeker weten? Dit kan niet ongedaan worden gemaakt.</span>
                    <button onClick={voerUit} style={chipStijl(true, true)}>Ja, verwijder</button>
                    <button onClick={() => setStap('idle')} style={chipStijl(false)}>Annuleer</button>
                  </div>
                )}

                {stap === 'bezig' && (
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Bezig met verwijderen…</span>
                )}
              </div>
            )}
          </>
        )}

        {resultaat && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: resultaat.includes('mis') ? 'var(--red)' : 'var(--green)' }}>{resultaat}</p>
        )}
      </div>
    </section>
  );
}
