// FILE: BudgettenPotjesBeheer.tsx
// AANGEMAAKT: 25-03-2026 19:30
// VERSIE: 1
// GEWIJZIGD: 31-03-2026 12:00
//
// WIJZIGINGEN (31-03-2026 12:00):
// - Annuleer-knop toegevoegd naast Opslaan in bewerk-formulier
// - Automatisch-checkbox toegevoegd bij kleur; picker+hex uitgegrijsd als aangevinkt
// - kiesAutomatischeKleur: maximale hoekafstand t.o.v. bestaande hues in HSL-ruimte
// WIJZIGINGEN (31-03-2026 11:00):
// - Hex-invoerveld toegevoegd naast kleurpicker; bidirectionele sync
// WIJZIGINGEN (30-03-2026 00:00):
// - Categorie toevoegen sectie verwijderd (aanmaken via transactiescherm)
//
// WIJZIGINGEN (28-03-2026 00:00):
// - Sectietitel hernoemd naar "Categorieën"
// - Type kolom en type veld verwijderd uit tabel en formulieren
// - Toevoeg-formulier titel hernoemd naar "Categorie toevoegen"
// WIJZIGINGEN (30-03-2026 15:00):
// - Dropdown gekoppelde rekening vervangen door radio buttons
// - Lege state tekst aangepast naar "Geen categorieën gevonden."

'use client';

import { Fragment, useEffect, useState } from 'react';
import { kiesAutomatischeKleur, kiesRandomKleur } from '@/lib/kleuren';
import InfoTooltip from '@/components/InfoTooltip';
import MiniTourKnop from '@/components/MiniTourKnop';
import ProfielBeheerBadge from './ProfielBeheerBadge';
import { useLookupData } from '@/features/instellingen/hooks/LookupContext';

interface BudgetPotje {
  id: number;
  naam: string;
  rekening_ids: number[];
  beschermd: number;
  kleur: string | null;
  kleur_auto: number;
}

interface Rekening {
  id: number;
  iban: string;
  naam: string;
  kleur: string | null;
}

interface Subcategorie {
  id: number;
  categorie: string;
  naam: string;
  inGebruik: boolean;
  inActieveRegel: boolean;
}

function alleGebruikteKleuren(items: BudgetPotje[], rekeningen: Rekening[], excludeId?: number): string[] {
  const catKleuren = items.filter(i => i.id !== excludeId).map(i => i.kleur).filter((k): k is string => !!k);
  const rekKleuren = rekeningen.map(r => r.kleur).filter((k): k is string => !!k);
  return [...catKleuren, ...rekKleuren];
}

const inputCls = 'w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)]';
const labelCls = 'block text-xs text-[var(--text-dim)] mb-1';
const btnOpslaan   = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' };

export default function BudgettenPotjesBeheer() {
  const [items, setItems]           = useState<BudgetPotje[]>([]);
  const [rekeningen, setRekeningen] = useState<Rekening[]>([]);
  const [, setFout]                 = useState<string | null>(null);
  const [hoverId, setHoverId]       = useState<number | null>(null);

  const [bewerkId, setBewerkId]         = useState<number | null>(null);
  const [bewerkForm, setBewerkForm]     = useState({ naam: '', rekening_ids: new Set<number>(), kleur: '', kleurAutomatisch: true });
  const [bewerkBezig, setBewerkBezig]   = useState(false);
  const [bewerkFout, setBewerkFout]     = useState<string | null>(null);

  // Subcategorieën
  const [openSubCats, setOpenSubCats]   = useState<Set<string>>(new Set());
  const [subCats, setSubCats]           = useState<Map<string, Subcategorie[]>>(new Map());
  const [subBewerkId, setSubBewerkId]   = useState<number | null>(null);
  const [subBewerkNaam, setSubBewerkNaam] = useState('');
  const [subDeletePopup, setSubDeletePopup] = useState<Subcategorie | null>(null);
  const [subDeleteGebruik, setSubDeleteGebruik] = useState<{ regels: number; aanpassingen: number } | null>(null);
  const [catDeletePopup, setCatDeletePopup] = useState<{ id: number; naam: string } | null>(null);
  const [catDeleteGebruik, setCatDeleteGebruik] = useState<{ regels: number; aanpassingen: number; subcategorieen: number } | null>(null);

  const [omboekingenAuto, setOmboekingenAuto]                     = useState(true);
  const [profiel, setProfiel]                                     = useState<string | null>(null);
  const [omboekToggleUit, setOmboekToggleUit]                     = useState(false);
  const [omboekToggleAan, setOmboekToggleAan]                     = useState(false);
  const [uitzonderingen, setUitzonderingen]   = useState<{ rekening_a_id: number; rekening_b_id: number; naam_a: string; naam_b: string }[]>([]);
  const [uitzNieuweA, setUitzNieuweA]         = useState<number | ''>('');
  const [uitzNieuweB, setUitzNieuweB]         = useState<number | ''>('');
  const [uitzFout, setUitzFout]               = useState<string | null>(null);

  const { data: lookup, refresh: refreshLookup } = useLookupData();

  async function laadInstellingenEnUitz() {
    const [r3, r4] = await Promise.all([
      fetch('/api/instellingen'),
      fetch('/api/omboeking-uitzonderingen'),
    ]);
    if (r3.ok) { const inst = await r3.json(); setOmboekingenAuto(inst.omboekingenAuto ?? true); setProfiel(inst.gebruikersProfiel ?? null); }
    if (r4.ok) setUitzonderingen(await r4.json());
  }

  // Sync lookup-data uit context: budgetten/rekeningen/subcategorieen.
  useEffect(() => {
    if (!lookup) return;
    setItems((lookup.budgettenPotjes as BudgetPotje[]) ?? []);
    setRekeningen((lookup.rekeningen as Rekening[]) ?? []);
    const alle = (lookup.subcategorieen as Subcategorie[]) ?? [];
    const map = new Map<string, Subcategorie[]>();
    for (const s of alle) {
      if (!map.has(s.categorie)) map.set(s.categorie, []);
      map.get(s.categorie)!.push(s);
    }
    setSubCats(map);
  }, [lookup]);

  useEffect(() => { laadInstellingenEnUitz(); }, []);

  useEffect(() => {
    const handler = () => { refreshLookup(); laadInstellingenEnUitz(); };
    window.addEventListener('instellingen-refresh', handler);
    return () => window.removeEventListener('instellingen-refresh', handler);
  }, [refreshLookup]);

  // Bereken effectieve kleuren per categorie, rekening houdend met alle andere kleuren
  const effectieveCatKleuren = (() => {
    const rekKleuren = rekeningen.map(r => r.kleur).filter((k): k is string => !!k);
    const map = new Map<number, string>();
    const gebruikt = [...rekKleuren];
    for (const item of items) {
      if (item.kleur) {
        map.set(item.id, item.kleur);
        gebruikt.push(item.kleur);
      } else {
        const auto = kiesAutomatischeKleur(gebruikt);
        map.set(item.id, auto);
        gebruikt.push(auto);
      }
    }
    return map;
  })();

  function openBewerk(item: BudgetPotje) {
    if (bewerkId === item.id) { setBewerkId(null); return; }
    setBewerkId(item.id);
    const kleurAutomatisch = item.kleur_auto === 1;
    const kleur = item.kleur ?? kiesAutomatischeKleur(alleGebruikteKleuren(items, rekeningen, item.id));
    setBewerkForm({ naam: item.naam, rekening_ids: new Set(item.rekening_ids), kleur, kleurAutomatisch });
    setBewerkFout(null);
  }

  async function handleBewerkOpslaan(item: BudgetPotje) {
    setBewerkBezig(true); setBewerkFout(null);
    const res = await fetch(`/api/budgetten-potjes/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam:         item.beschermd ? undefined : bewerkForm.naam.trim(),
        rekening_ids: Array.from(bewerkForm.rekening_ids),
        kleur:        bewerkForm.kleur || null,
        kleur_auto:   bewerkForm.kleurAutomatisch ? 1 : 0,
      }),
    });
    setBewerkBezig(false);
    if (!res.ok && res.status !== 204) {
      const d = await res.json();
      setBewerkFout(d.error ?? 'Opslaan mislukt.');
    } else {
      window.dispatchEvent(new CustomEvent('instellingen-refresh'));
      setBewerkId(null);
      refreshLookup();
    }
  }

  async function laadSubCats(categorie: string) {
    const res = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(categorie)}&volledig=1`);
    if (!res.ok) return;
    const data: Subcategorie[] = await res.json();
    setSubCats(prev => new Map(prev).set(categorie, data));
  }

  function toggleSubCats(categorie: string) {
    setOpenSubCats(prev => {
      const next = new Set(prev);
      if (next.has(categorie)) { next.delete(categorie); } else { next.add(categorie); laadSubCats(categorie); }
      return next;
    });
  }

  async function handleSubRename(sub: Subcategorie) {
    if (!subBewerkNaam.trim() || subBewerkNaam.trim() === sub.naam) { setSubBewerkId(null); return; }
    const res = await fetch(`/api/subcategorieen/${sub.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: subBewerkNaam.trim() }),
    });
    if (!res.ok && res.status !== 204) {
      const d = await res.json().catch(() => ({ error: 'Hernoemen mislukt.' }));
      setFout(d.error ?? 'Hernoemen mislukt.');
      return;
    }
    setSubBewerkId(null);
    laadSubCats(sub.categorie);
    refreshLookup();
  }

  async function handleSubDelete(sub: Subcategorie) {
    if (sub.inGebruik) {
      // Haal gebruik-aantallen op en toon popup
      const res = await fetch(`/api/subcategorieen/gebruik?categorie=${encodeURIComponent(sub.categorie)}&subcategorie=${encodeURIComponent(sub.naam)}`);
      if (res.ok) {
        const { aantal } = await res.json();
        setSubDeleteGebruik({ regels: aantal, aanpassingen: 0 });
      }
      setSubDeletePopup(sub);
      return;
    }
    const res = await fetch(`/api/subcategorieen/${sub.id}`, { method: 'DELETE' });
    if (res.ok) { laadSubCats(sub.categorie); refreshLookup(); }
  }

  async function handleDelete(id: number) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const gRes = await fetch(`/api/budgetten-potjes/gebruik?naam=${encodeURIComponent(item.naam)}`);
    if (gRes.ok) {
      const g = await gRes.json() as { regels: number; aanpassingen: number; subcategorieen: number };
      if (g.regels > 0 || g.aanpassingen > 0 || g.subcategorieen > 0) {
        setCatDeleteGebruik(g);
        setCatDeletePopup({ id, naam: item.naam });
        return;
      }
    }
    const res = await fetch(`/api/budgetten-potjes/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const d = await res.json();
      if (res.status === 409 && d.gebruik) {
        setCatDeleteGebruik(d.gebruik);
        setCatDeletePopup({ id, naam: item.naam });
        return;
      }
      setFout(d.error ?? 'Verwijderen mislukt.');
    } else {
      refreshLookup();
    }
  }

  return (
    <section data-onboarding="inst-categorieen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Categorisatie instellingen</p>
        <MiniTourKnop tourId="categorieen" type="instelling" />
      </div>

      {/* Omboekingen card */}
      {(() => { const omboekingItem = items.find(i => i.naam === 'Omboekingen'); if (!omboekingItem) return null; return (
        <div data-onboarding="inst-omboekingen-cat" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Omboekingen categorisatie</p>
              <InfoTooltip volledigeBreedte tekst="Omboekingen zijn transacties tussen je eigen rekeningen, zoals overboekingen van spaar- naar betaalrekening. Schakel Automatisch categoriseren in om alle transacties tussen eigen rekeningen automatisch als Omboekingen te categoriseren. Zet dit uit om omboeking-categorisatie volledig handmatig te beheren — gebruik dan Handmatige toewijzing om specifieke rekening-paren aan te wijzen die als Omboeking behandeld worden. Je kunt de categorie Omboekingen ook altijd handmatig toewijzen op de Transacties-pagina." />
            </div>
          </div>
          <div className="table-wrapper" style={{ marginBottom: 0 }}>
            <table style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: 50 }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead><tr><th>Naam</th><th>Kleur</th><th colSpan={2}>Automatisch categoriseren</th></tr></thead>
              <tbody>
                <tr onClick={() => openBewerk(omboekingItem)}
                  onMouseEnter={() => setHoverId(omboekingItem.id)} onMouseLeave={() => setHoverId(null)}
                  style={{ cursor: 'pointer', background: hoverId === omboekingItem.id ? 'var(--bg-hover)' : undefined }}>
                  <td style={{ color: 'var(--text-h)', fontWeight: 500 }}>{omboekingItem.naam}</td>
                  <td><span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: effectieveCatKleuren.get(omboekingItem.id) ?? '#748ffc', border: '1px solid var(--border)', verticalAlign: 'middle' }} /></td>
                  <td colSpan={2} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: (profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') ? 'not-allowed' : 'pointer', opacity: (profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') ? 0.4 : 1, pointerEvents: (profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') ? 'none' : undefined }}>
                      <input type="checkbox" checked={omboekingenAuto} onChange={e => {
                        if (!e.target.checked) { setOmboekToggleUit(true); return; }
                        setOmboekToggleAan(true);
                      }} style={{ display: 'none' }} />
                      <span style={{ display: 'inline-block', width: 36, height: 20, borderRadius: 10, background: omboekingenAuto ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: 2, left: omboekingenAuto ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{omboekingenAuto ? 'Aan' : 'Uit'}</span>
                    </label>
                    {(profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer') && <ProfielBeheerBadge />}
                    </div>
                  </td>
                </tr>
                {bewerkId === omboekingItem.id && (
                  <tr><td colSpan={4} style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <label className={labelCls}>Kleur</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <input type="color" value={bewerkForm.kleur || '#748ffc'} disabled={bewerkForm.kleurAutomatisch}
                          onChange={e => setBewerkForm(f => ({ ...f, kleur: e.target.value }))}
                          style={{ width: 40, height: 34, padding: 2, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: bewerkForm.kleurAutomatisch ? 'default' : 'pointer', pointerEvents: bewerkForm.kleurAutomatisch ? 'none' : 'auto' }} />
                        <button type="button" title="Andere kleur"
                          onClick={() => setBewerkForm(f => ({ ...f, kleur: kiesRandomKleur(alleGebruikteKleuren(items, rekeningen, bewerkId ?? undefined), f.kleur) }))}
                          disabled={!bewerkForm.kleurAutomatisch}
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', cursor: bewerkForm.kleurAutomatisch ? 'pointer' : 'not-allowed', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', opacity: bewerkForm.kleurAutomatisch ? 1 : 0.3 }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1v5h5" /><path d="M3.5 10a5 5 0 1 0 1-7L1 6" /></svg>
                        </button>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', width: 'fit-content' }}>
                        <input type="checkbox" checked={bewerkForm.kleurAutomatisch}
                          onChange={e => { const auto = e.target.checked; const kleur = auto ? kiesAutomatischeKleur(alleGebruikteKleuren(items, rekeningen, bewerkId ?? undefined)) : bewerkForm.kleur; setBewerkForm(f => ({ ...f, kleurAutomatisch: auto, kleur })); }} />
                        Automatisch
                      </label>
                    </div>
                    {bewerkFout && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{bewerkFout}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleBewerkOpslaan(omboekingItem)} disabled={bewerkBezig}
                        style={{ ...btnOpslaan, opacity: bewerkBezig ? 0.6 : 1, cursor: bewerkBezig ? 'not-allowed' : 'pointer' }}>
                        {bewerkBezig ? 'Opslaan…' : 'Opslaan'}
                      </button>
                      <button onClick={() => setBewerkId(null)} disabled={bewerkBezig}
                        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
                        Annuleer
                      </button>
                    </div>
                  </td></tr>
                )}
                {!omboekingenAuto && (
                  <tr><td colSpan={4} style={{ padding: '12px 20px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8 }}>Handmatige toewijzing</p>
                    {uitzonderingen.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Geen uitzonderingen ingesteld.</p>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                          {uitzonderingen.map(u => (
                            <div key={`${u.rekening_a_id}-${u.rekening_b_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                              <span style={{ flex: 1, color: 'var(--text)' }}>{u.naam_a} ↔ {u.naam_b}</span>
                              <button onClick={async () => {
                                await fetch('/api/omboeking-uitzonderingen', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rekening_a_id: u.rekening_a_id, rekening_b_id: u.rekening_b_id }) });
                                setUitzonderingen(prev => prev.filter(x => !(x.rekening_a_id === u.rekening_a_id && x.rekening_b_id === u.rekening_b_id)));
                              }} title="Verwijder uitzondering"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                    }
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <select value={uitzNieuweA} onChange={e => { setUitzNieuweA(e.target.value ? Number(e.target.value) : ''); setUitzFout(null); }}
                        className={inputCls} style={{ width: 'auto', flex: 1, minWidth: 120 }}>
                        <option value="">Rekening A…</option>
                        {rekeningen.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
                      </select>
                      <span style={{ color: 'var(--text-dim)', fontSize: 13, flexShrink: 0 }}>↔</span>
                      <select value={uitzNieuweB} onChange={e => { setUitzNieuweB(e.target.value ? Number(e.target.value) : ''); setUitzFout(null); }}
                        className={inputCls} style={{ width: 'auto', flex: 1, minWidth: 120 }}>
                        <option value="">Rekening B…</option>
                        {rekeningen.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
                      </select>
                      <button onClick={async () => {
                        if (!uitzNieuweA || !uitzNieuweB) { setUitzFout('Kies twee rekeningen.'); return; }
                        if (uitzNieuweA === uitzNieuweB) { setUitzFout('Kies twee verschillende rekeningen.'); return; }
                        setUitzFout(null);
                        const res = await fetch('/api/omboeking-uitzonderingen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rekening_a_id: uitzNieuweA, rekening_b_id: uitzNieuweB }) });
                        if (res.ok || res.status === 204) {
                          setUitzNieuweA(''); setUitzNieuweB('');
                          const r = await fetch('/api/omboeking-uitzonderingen');
                          if (r.ok) setUitzonderingen(await r.json());
                        }
                      }} style={{ ...btnOpslaan, whiteSpace: 'nowrap', flexShrink: 0 }}>Toevoegen</button>
                    </div>
                    {uitzFout && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{uitzFout}</p>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ); })()}

      {/* Regels opruimen card */}
      <RegelsOpruimenCard />

      {/* Aangepast opruimen card */}
      <AangepastOpruimenCard />

      {/* Categorieën card */}
      <div data-onboarding="inst-categorieen-tabel" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Categorieën</p>
            <InfoTooltip volledigeBreedte tekst={<>
              <p style={{ margin: '0 0 8px' }}>Overzicht van alle categorieën en hun subcategorieën. Nieuwe categorieën ontstaan automatisch bij het categoriseren van transacties — ze worden hier niet handmatig aangemaakt.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Aanpassen:</strong> klik op een rij om kleur en gekoppelde rekeningen te wijzigen. De gekoppelde rekeningen bepalen welke rekening hoort bij transacties in deze categorie — gebruikt door de Balans Budgetten en Potjes tabel op het Dashboard.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Hernoemen:</strong> nieuwe naam wordt automatisch overal bijgewerkt — in bestaande categorisatieregels én transacties.</p>
              <p style={{ margin: 0 }}><strong>Beschermd (🔒):</strong> categorieën met een slot-icoon kunnen niet hernoemd of verwijderd worden. Klik in de kolom Subcategorieën om subcategorieën te bekijken, hernoemen of verwijderen.</p>
            </>} />
          </div>
        </div>
      {items.filter(i => i.naam !== 'Omboekingen').length === 0 ? (
        <p className="empty" style={{ padding: '16px 20px' }}>Geen categorieën gevonden.</p>
      ) : (
        <div className="table-wrapper" style={{ marginBottom: 0 }}>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: 50 }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '25%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Kleur</th>
                <th>Gekoppelde Rekeningen</th>
                <th>Subcategorieën</th>
              </tr>
            </thead>
            <tbody>
              {(() => { let subKnopGeplaatst = false; return [...items].filter(i => i.naam !== 'Omboekingen').sort((a, b) => {
                if (a.beschermd !== b.beschermd) return b.beschermd - a.beschermd;
                return a.naam.localeCompare(b.naam, 'nl');
              }).map(item => { const isSubKnop = !subKnopGeplaatst && (subCats.get(item.naam) ?? []).length > 0; if (isSubKnop) subKnopGeplaatst = true; return (
                <Fragment key={item.id}>
                  <tr onClick={() => openBewerk(item)}
                    onMouseEnter={() => setHoverId(item.id)} onMouseLeave={() => setHoverId(null)}
                    style={{ cursor: 'pointer', background: hoverId === item.id ? 'var(--bg-hover)' : undefined }}>
                    <td style={{ color: 'var(--text-h)', fontWeight: 500 }}>
                      {item.beschermd
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13 }}>🔒</span>{item.naam}
                          </span>
                        : item.naam}
                    </td>
                    <td>
                      <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: effectieveCatKleuren.get(item.id) ?? '#748ffc', border: '1px solid var(--border)', verticalAlign: 'middle' }} />
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'normal', lineHeight: 1.6 }}>
                      {profiel === 'uitgavenbeheer' ? <ProfielBeheerBadge /> : item.rekening_ids.length === 0
                        ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                        : item.rekening_ids.map(rid => {
                            const rek = rekeningen.find(r => r.id === rid);
                            const kleur = rek?.kleur ?? '#748ffc';
                            return (
                              <span key={rid} style={{ display: 'inline-block', padding: '1px 8px', fontSize: 11, borderRadius: 10, background: `color-mix(in srgb, ${kleur} 15%, transparent)`, color: kleur, border: `1px solid color-mix(in srgb, ${kleur} 30%, transparent)`, marginRight: 4, marginBottom: 2, fontWeight: 500 }}>
                                {rek?.naam ?? `#${rid}`}
                              </span>
                            );
                          })}
                    </td>
                    <td {...(isSubKnop ? { 'data-onboarding': 'inst-subcategorie-knop' } : {})} onClick={e => { e.stopPropagation(); if (item.naam !== 'Omboekingen') toggleSubCats(item.naam); }}>
                      {item.naam !== 'Omboekingen' && (() => {
                        const aantal = (subCats.get(item.naam) ?? []).length;
                        const isOpen = openSubCats.has(item.naam);
                        return (
                          <span style={{ fontSize: 12, color: isOpen ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {aantal > 0 ? `${aantal} subcategorieën` : 'geen'}
                            <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                  {/* Subcategorieën subtabel */}
                  {openSubCats.has(item.naam) && (
                    <tr>
                      <td colSpan={4} style={{ padding: '8px 20px 8px 28px', background: 'var(--bg-card)' }}>
                        {(() => {
                          const subs = subCats.get(item.naam) ?? [];
                          if (subs.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Geen subcategorieën.</span>;
                          return (() => {
                              const renderSub = (sub: Subcategorie) => (
                                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ flex: 1, color: sub.inGebruik ? 'var(--text)' : 'var(--text-dim)', minWidth: 0, fontSize: 12 }}>
                                    {subBewerkId === sub.id ? (
                                      <input className={inputCls} value={subBewerkNaam}
                                        onChange={e => setSubBewerkNaam(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSubRename(sub); if (e.key === 'Escape') setSubBewerkId(null); }}
                                        onBlur={() => handleSubRename(sub)}
                                        autoFocus style={{ fontSize: 12, padding: '2px 6px', width: '100%' }} />
                                    ) : (
                                      <span onClick={() => { setSubBewerkId(sub.id); setSubBewerkNaam(sub.naam); }} style={{ cursor: 'pointer' }}
                                        title="Klik om te hernoemen">
                                        {sub.naam}
                                        {!sub.inGebruik
                                          ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-dim)' }}>(ongebruikt)</span>
                                          : !sub.inActieveRegel
                                            ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-dim)' }}>(gearchiveerd)</span>
                                            : null}
                                      </span>
                                    )}
                                  </div>
                                  <button onClick={() => handleSubDelete(sub)} title={sub.inGebruik ? 'Subcategorie is nog in gebruik — klik om regels te bekijken' : 'Verwijder subcategorie'}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub.inGebruik ? 'color-mix(in srgb, var(--red) 40%, transparent)' : 'var(--red)', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
                                </div>
                              );
                              // Verdeel over 3 kolommen (verticaal doorlopend)
                              const perKolom = Math.ceil(subs.length / 3);
                              const kol1 = subs.slice(0, perKolom);
                              const kol2 = subs.slice(perKolom, perKolom * 2);
                              const kol3 = subs.slice(perKolom * 2);
                              return (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 100px 1fr' }}>
                                  <div>{kol1.map(renderSub)}</div>
                                  <div />
                                  <div>{kol2.map(renderSub)}</div>
                                  <div />
                                  <div>{kol3.map(renderSub)}</div>
                                </div>
                              );
                            })();
                        })()}
                      </td>
                    </tr>
                  )}
                  {bewerkId === item.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div>
                            <label className={labelCls}>Naam</label>
                            <input className={inputCls} value={bewerkForm.naam}
                              onChange={e => setBewerkForm(f => ({ ...f, naam: e.target.value }))}
                              readOnly={!!item.beschermd}
                              style={item.beschermd ? { opacity: 0.4, cursor: 'default' } : {}} />
                          </div>
                          <div>
                            <label className={labelCls}>Kleur</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <input
                                type="color"
                                value={bewerkForm.kleur || '#748ffc'}
                                disabled={bewerkForm.kleurAutomatisch}
                                onChange={e => setBewerkForm(f => ({ ...f, kleur: e.target.value }))}
                                style={{ width: 40, height: 34, padding: 2, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: bewerkForm.kleurAutomatisch ? 'default' : 'pointer', pointerEvents: bewerkForm.kleurAutomatisch ? 'none' : 'auto' }}
                              />
                              <button type="button" title="Andere kleur"
                                onClick={() => setBewerkForm(f => ({ ...f, kleur: kiesRandomKleur(alleGebruikteKleuren(items, rekeningen, bewerkId ?? undefined), f.kleur) }))}
                                disabled={!bewerkForm.kleurAutomatisch}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', cursor: bewerkForm.kleurAutomatisch ? 'pointer' : 'not-allowed', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', opacity: bewerkForm.kleurAutomatisch ? 1 : 0.3 }}
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1v5h5" /><path d="M3.5 10a5 5 0 1 0 1-7L1 6" /></svg>
                              </button>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', width: 'fit-content' }}>
                              <input
                                type="checkbox"
                                checked={bewerkForm.kleurAutomatisch}
                                onChange={e => {
                                  const auto = e.target.checked;
                                  const kleur = auto
                                    ? kiesAutomatischeKleur(alleGebruikteKleuren(items, rekeningen, bewerkId ?? undefined))
                                    : bewerkForm.kleur;
                                  setBewerkForm(f => ({ ...f, kleurAutomatisch: auto, kleur }));
                                }}
                              />
                              Automatisch
                            </label>
                          </div>
                        </div>
                        {rekeningen.length > 0 && item.naam !== 'Omboekingen' && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                              <label className={labelCls} style={{ margin: 0 }}>Gekoppelde rekeningen</label>
                              {profiel === 'uitgavenbeheer' && <ProfielBeheerBadge />}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: profiel === 'uitgavenbeheer' ? 0.4 : 1, pointerEvents: profiel === 'uitgavenbeheer' ? 'none' : undefined }}>
                              {rekeningen.map(r => (
                                <button key={r.id} type="button" onClick={() => setBewerkForm(f => { const s = new Set(f.rekening_ids); s.has(r.id) ? s.delete(r.id) : s.add(r.id); return { ...f, rekening_ids: s }; })}
                                  style={(() => { const actief = bewerkForm.rekening_ids.has(r.id); const kleur = r.kleur ?? '#748ffc'; return { padding: '3px 10px', fontSize: 12, borderRadius: 12, cursor: 'pointer', border: actief ? `1.5px solid color-mix(in srgb, ${kleur} 30%, transparent)` : '1px solid var(--border)', background: actief ? `color-mix(in srgb, ${kleur} 15%, transparent)` : 'var(--bg-base)', color: actief ? kleur : 'var(--text-dim)', fontWeight: actief ? 600 : 400, transition: 'all 0.15s' }; })()}>
                                  {r.naam}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {bewerkFout && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{bewerkFout}</p>}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => handleBewerkOpslaan(item)} disabled={bewerkBezig}
                            style={{ ...btnOpslaan, opacity: bewerkBezig ? 0.6 : 1, cursor: bewerkBezig ? 'not-allowed' : 'pointer' }}>
                            {bewerkBezig ? 'Opslaan…' : 'Opslaan'}
                          </button>
                          <button onClick={() => setBewerkId(null)} disabled={bewerkBezig}
                            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
                            Annuleer
                          </button>
                          {!item.beschermd && (
                            <>
                              <div style={{ flex: 1 }} />
                              <button onClick={() => { handleDelete(item.id); setBewerkId(null); }} disabled={bewerkBezig} title="Verwijder"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ); }); })()}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Omboekingen auto UIT bevestiging */}
      {omboekToggleUit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setOmboekToggleUit(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Automatische categorisatie uitschakelen?</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
              Alle transacties die automatisch de categorie <strong>Omboekingen</strong> toegewezen hebben gekregen worden teruggezet naar <strong>ongecategoriseerd</strong>.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
              Transacties die je handmatig als Omboekingen hebt gecategoriseerd blijven ongewijzigd.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => setOmboekToggleUit(false)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
                Annuleer
              </button>
              <button onClick={async () => {
                setOmboekToggleUit(false);
                setOmboekingenAuto(false);
                await fetch('/api/instellingen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ omboekingenAuto: false }) });
              }} style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Uitschakelen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Omboekingen auto AAN bevestiging */}
      {omboekToggleAan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setOmboekToggleAan(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Automatische categorisatie inschakelen?</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
              Alle ongecategoriseerde transacties tussen eigen rekeningen worden automatisch gecategoriseerd als <strong>Omboekingen</strong>. De subcategorie wordt bepaald op basis van de omschrijving.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
              Transacties die je handmatig gecategoriseerd hebt blijven ongewijzigd.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => setOmboekToggleAan(false)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
                Annuleer
              </button>
              <button onClick={async () => {
                setOmboekToggleAan(false);
                setOmboekingenAuto(true);
                await fetch('/api/instellingen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ omboekingenAuto: true }) });
              }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Inschakelen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subcategorie in-gebruik popup */}
      {subDeletePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSubDeletePopup(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Subcategorie nog in gebruik</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
              De subcategorie <strong>{subDeletePopup.naam}</strong> in <strong>{subDeletePopup.categorie}</strong> wordt nog gebruikt door {subDeleteGebruik?.regels ?? 0} categorisatieregel(s) en/of aangepaste transactie(s) en kan daarom nog niet verwijderd worden.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
              Om deze subcategorie te kunnen verwijderen moet je eerst op de Categorisatie-pagina de betreffende regels en transacties een andere subcategorie geven.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => setSubDeletePopup(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>Annuleer</button>
              <button onClick={() => {
                setSubDeletePopup(null);
                window.location.href = `/categorisatie?categorie=${encodeURIComponent(subDeletePopup.categorie)}&subcategorie=${encodeURIComponent(subDeletePopup.naam)}&bron=instellingen`;
              }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Naar Categorisatie</button>
            </div>
          </div>
        </div>
      )}

      {/* Categorie in-gebruik popup */}
      {catDeletePopup && (() => {
        const g = catDeleteGebruik ?? { regels: 0, aanpassingen: 0, subcategorieen: 0 };
        const delen = [
          g.regels > 0 ? `${g.regels} categorisatieregel${g.regels === 1 ? '' : 's'}` : null,
          g.aanpassingen > 0 ? `${g.aanpassingen} aangepaste transactie${g.aanpassingen === 1 ? '' : 's'}` : null,
          g.subcategorieen > 0 ? `${g.subcategorieen} subcategorie${g.subcategorieen === 1 ? '' : 'ën'}` : null,
        ].filter(Boolean).join(', ');
        const naam = catDeletePopup.naam;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCatDeletePopup(null)}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Categorie nog in gebruik</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
                De categorie <strong>{naam}</strong> wordt nog gebruikt door {delen} en kan daarom nog niet verwijderd worden.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
                Om deze categorie te kunnen verwijderen moet je eerst op de Categorisatie-pagina de betreffende regels en transacties een andere categorie geven, en eventuele subcategorieën verwijderen.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button onClick={() => setCatDeletePopup(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>Annuleer</button>
                <button onClick={() => {
                  setCatDeletePopup(null);
                  window.location.href = `/categorisatie?categorie=${encodeURIComponent(naam)}&bron=instellingen`;
                }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Naar Categorisatie</button>
              </div>
            </div>
          </div>
        );
      })()}

    </section>
  );
}

function AangepastOpruimenCard() {
  const [maanden, setMaanden] = useState<number>(0);
  useEffect(() => {
    const laad = () => {
      fetch('/api/instellingen').then(r => r.ok ? r.json() : null).then((d: { aangepastAutoArchiveerMaanden?: number } | null) => {
        if (d) setMaanden(d.aangepastAutoArchiveerMaanden ?? 0);
      }).catch(() => {});
    };
    laad();
    window.addEventListener('instellingen-refresh', laad);
    return () => window.removeEventListener('instellingen-refresh', laad);
  }, []);
  async function save(nieuw: number) {
    setMaanden(nieuw);
    await fetch('/api/instellingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aangepastAutoArchiveerMaanden: nieuw }),
    });
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Aangepaste categorisaties opruimen</p>
          <InfoTooltip volledigeBreedte tekst="Archiveer automatisch aangepaste categorisaties ouder dan de ingestelde termijn (op basis van transactiedatum). Gearchiveerde aanpassingen verdwijnen uit de Aangepast-tab en tellen niet meer mee voor subcategorie-dropdowns, maar de transacties zelf en hun categorisatie blijven zichtbaar in dashboards en historie." />
        </div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-h)' }}>Automatisch archiveren ouder dan</label>
        <select value={maanden} onChange={e => save(Number(e.target.value))}
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }}>
          <option value={0}>Uit</option>
          <option value={6}>6 maanden</option>
          <option value={12}>12 maanden</option>
          <option value={18}>18 maanden</option>
          <option value={24}>24 maanden</option>
          <option value={36}>36 maanden</option>
        </select>
      </div>
    </div>
  );
}

function RegelsOpruimenCard() {
  const [maanden, setMaanden] = useState<number>(0);
  useEffect(() => {
    const laad = () => {
      fetch('/api/instellingen').then(r => r.ok ? r.json() : null).then((d: { regelAutoArchiveerMaanden?: number } | null) => {
        if (d) setMaanden(d.regelAutoArchiveerMaanden ?? 0);
      }).catch(() => {});
    };
    laad();
    window.addEventListener('instellingen-refresh', laad);
    return () => window.removeEventListener('instellingen-refresh', laad);
  }, []);
  async function save(nieuw: number) {
    setMaanden(nieuw);
    await fetch('/api/instellingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regelAutoArchiveerMaanden: nieuw }),
    });
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Categorisatieregels opruimen</p>
          <InfoTooltip volledigeBreedte tekst="Verwijder automatisch categorisatieregels die lang niet meer gebruikt zijn. Verwijderde regels doen geen auto-match meer. Transacties die door de verwijderde regel gecategoriseerd waren worden bevroren: ze behouden hun categorietekst maar worden niet meer automatisch bijgewerkt. Je kunt bevroren transacties handmatig herindelen via de categoriepopup." />
        </div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-h)' }}>Automatisch verwijderen na</label>
        <select value={maanden} onChange={e => save(Number(e.target.value))}
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }}>
          <option value={0}>Uit</option>
          <option value={6}>6 maanden ongebruikt</option>
          <option value={12}>12 maanden ongebruikt</option>
          <option value={18}>18 maanden ongebruikt</option>
          <option value={24}>24 maanden ongebruikt</option>
          <option value={36}>36 maanden ongebruikt</option>
        </select>
      </div>
    </div>
  );
}
