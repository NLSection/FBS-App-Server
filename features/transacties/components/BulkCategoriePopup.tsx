'use client';

import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  aantal: number;
  aantalUniekeNamen?: number;
  onClose: () => void;
  onBevestig: (categorie: string, subcategorie: string, toelichting: string, maakRegels: boolean) => void;
}

interface Categorie { naam: string; beschermd: number }
interface Subcategorie { categorie: string; naam: string; inActieveRegel?: boolean }

export default function BulkCategoriePopup({ open, aantal, aantalUniekeNamen, onClose, onBevestig }: Props) {
  const [categorieen, setCategorieen] = useState<Categorie[]>([]);
  const [subPerCat, setSubPerCat] = useState<Record<string, string[]>>({});
  const [, setSubGearchiveerdPerCat] = useState<Record<string, string[]>>({});
  const [categorie, setCategorie] = useState('');
  const [subcategorie, setSubcategorie] = useState('');
  const [nieuweSub, setNieuweSub] = useState(false);
  const [toelichting, setToelichting] = useState('');
  const [maakRegels, setMaakRegels] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategorie(''); setSubcategorie(''); setNieuweSub(false); setToelichting(''); setMaakRegels(false);
    fetch('/api/budgetten-potjes').then(r => r.ok ? r.json() : []).then(setCategorieen);
    fetch('/api/subcategorieen?volledig=1').then(r => r.ok ? r.json() : []).then((subs: Subcategorie[]) => {
      const actief: Record<string, string[]> = {};
      const gearch: Record<string, string[]> = {};
      for (const s of subs) {
        const bucket = s.inActieveRegel ? actief : gearch;
        if (!bucket[s.categorie]) bucket[s.categorie] = [];
        bucket[s.categorie].push(s.naam);
      }
      setSubPerCat(actief);
      setSubGearchiveerdPerCat(gearch);
    });
  }, [open]);

  if (!open) return null;

  const gesorteerdeCategorieen = [...categorieen].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  const subOpties = [...(subPerCat[categorie] ?? [])].sort((a, b) => a.localeCompare(b, 'nl'));
  const kanOpslaan = !!categorie && !!subcategorie.trim();

  async function bevestig() {
    if (!kanOpslaan) return;
    if (nieuweSub) {
      await fetch('/api/subcategorieen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie, naam: subcategorie.trim() }),
      });
    }
    onBevestig(categorie, subcategorie.trim(), toelichting, maakRegels);
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  };
  const kaartStijl: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px',
  };
  const inputStijl: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)', boxSizing: 'border-box',
  };

  return (
    <div data-selectie-behouden style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, minWidth: 360, maxWidth: 520, width: '100%' }}>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-h)', fontSize: 16 }}>Categoriseer selectie</h3>
        <p style={{ margin: '0 0 14px', color: 'var(--text)', fontSize: 13 }}>
          {aantal} transactie{aantal === 1 ? '' : 's'} krijgen deze categorisatie.
        </p>

        {/* Sectie: Categorie + subcategorie */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={sectionLabel}>Categorie</div>
          <div style={{ ...kaartStijl, marginBottom: 10 }}>
            <select
              value={categorie}
              onChange={e => { setCategorie(e.target.value); setSubcategorie(''); setNieuweSub(false); }}
              style={inputStijl}
            >
              <option value="" disabled>— Selecteer categorie —</option>
              {gesorteerdeCategorieen.map(c => <option key={c.naam} value={c.naam}>{c.naam}</option>)}
            </select>
          </div>

          <div style={sectionLabel}>Subcategorie</div>
          <div style={kaartStijl}>
            {nieuweSub ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={subcategorie}
                  onChange={e => setSubcategorie(e.target.value)}
                  placeholder="Typ subcategorie…"
                  style={inputStijl}
                />
                <button onClick={() => { setNieuweSub(false); setSubcategorie(''); }}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <select
                disabled={!categorie}
                value={subcategorie}
                onChange={e => {
                  if (e.target.value === '__nieuw__') { setNieuweSub(true); setSubcategorie(''); }
                  else setSubcategorie(e.target.value);
                }}
                style={inputStijl}
              >
                <option value="" disabled>— Selecteer subcategorie —</option>
                {subOpties.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__nieuw__">Nieuwe subcategorie…</option>
              </select>
            )}
          </div>
        </div>

        {/* Sectie: Toelichting */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={sectionLabel}>Toelichting <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optioneel)</span></div>
          <div style={kaartStijl}>
            <input
              value={toelichting}
              onChange={e => setToelichting(e.target.value)}
              placeholder="Optionele toelichting…"
              style={inputStijl}
            />
          </div>
        </div>

        {/* Sectie: Modus */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Wat wil je doen?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ ...kaartStijl, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', borderColor: !maakRegels ? 'var(--accent)' : 'var(--border)', background: !maakRegels ? 'var(--accent-dim)' : 'var(--bg-surface)' }}>
              <input type="radio" name="bulk-mode" checked={!maakRegels} onChange={() => setMaakRegels(false)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>🔒 Alleen deze transacties (Aangepast)</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Markeert alleen de geselecteerde transacties — geen matchregel, geen invloed op toekomstige transacties.</div>
              </div>
            </label>
            <label style={{ ...kaartStijl, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', borderColor: maakRegels ? 'var(--accent)' : 'var(--border)', background: maakRegels ? 'var(--accent-dim)' : 'var(--bg-surface)' }}>
              <input type="radio" name="bulk-mode" checked={maakRegels} onChange={() => setMaakRegels(true)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Categoriseer + maak regels</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  Per unieke tegenpartij{aantalUniekeNamen !== undefined ? ` (${aantalUniekeNamen} regel${aantalUniekeNamen === 1 ? '' : 's'})` : ''} wordt een regel aangemaakt. Soortgelijke transacties elders worden ook opgepakt.
                </div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
            Annuleer
          </button>
          <button
            disabled={!kanOpslaan}
            onClick={bevestig}
            style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: kanOpslaan ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: kanOpslaan ? 1 : 0.5 }}
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
