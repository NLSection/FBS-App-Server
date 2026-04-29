// FILE: ImportForm.tsx
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 02:00
//
// WIJZIGINGEN (03-04-2026 02:00):
// - Herbouwd: drag & drop zone, automatische import, voortgangsindicator, importgeschiedenis
// WIJZIGINGEN (30-03-2026 16:30):
// - categorie_id dropdown → categorie_ids checkboxes (many-to-many)
// WIJZIGINGEN (30-03-2026):
// - Modal voor onbekende rekeningen: toevoegen / negeren / permanent negeren per IBAN
// WIJZIGINGEN (25-03-2026 17:30):
// - Initiële aanmaak: formulier voor CSV-import met resultaatweergave

'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ImportTransactiesSubtabel from '@/features/import/components/ImportTransactiesSubtabel';

interface ImportResultaat {
  importId: number;
  aantalNormaalAf: number;
  aantalNormaalBij: number;
  aantalOmboekingAf: number;
  aantalOmboekingBij: number;
  totaal: number;
  overgeslagen: number;
  gecategoriseerd: number;
  ongecategoriseerd: number;
}

interface OnbekendeRekening {
  iban: string;
  eersteTransactie: string | null;
}

interface RekeningKeuze {
  iban: string;
  eersteTransactie: string | null;
  actie: 'toevoegen' | 'negeren' | 'permanent';
  naam: string;
  type: 'betaal' | 'spaar';
  categorie_ids: number[];
}

interface Categorie { id: number; naam: string; kleur: string | null; beschermd: number; }

interface ImportGeschiedenis {
  id: number;
  bestandsnaam: string;
  geimporteerd_op: string;
  aantal_transacties: number;
  aantal_nieuw: number;
}


interface BestandStatus {
  naam: string;
  status: 'wacht' | 'bezig' | 'klaar' | 'fout';
  resultaat?: ImportResultaat;
  fout?: string;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--text-h)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-dim)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

interface ExtraRekening {
  iban: string;
  naam: string;
  type: 'betaal' | 'spaar';
}

export default function ImportForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bestandStatussen, setBestandStatussen] = useState<BestandStatus[]>([]);
  const [fout, setFout] = useState<string | null>(null);

  const [profiel, setProfiel] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then((inst: { gebruikersProfiel: string | null } | null) => {
        if (inst?.gebruikersProfiel) setProfiel(inst.gebruikersProfiel);
      })
      .catch(() => {});
  }, []);
  const [onbekend, setOnbekend]               = useState<OnbekendeRekening[] | null>(null);
  const [keuzes, setKeuzes]                   = useState<RekeningKeuze[]>([]);
  const [opgeslagenBestanden, setOpgeslagenBestanden] = useState<File[]>([]);
  const [categorieen, setCategorieen]         = useState<Categorie[]>([]);
  const [geschiedenis, setGeschiedenis]       = useState<ImportGeschiedenis[]>([]);
  const [openImport, setOpenImport]           = useState<number | null>(null);
  const [, setLaatste]                 = useState<{ nieuw: number; duplicaten: number; gecategoriseerd: number; ongecategoriseerd: number } | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('fbs-laatste-import') ?? 'null'); } catch { return null; }
  });
  const [dbStats, setDbStats] = useState<{ totaal: number; gecategoriseerd: number; ongecategoriseerd: number; categorieen: number; subcategorieen: number } | null>(null);

  // Fase 2: extra eigen rekeningen toevoegen (alleen potjesbeheer)
  const [fase2, setFase2] = useState(false);
  const [fase2Rekeningen, setFase2Rekeningen] = useState<string[]>([]); // namen van zojuist bevestigde rekeningen
  const [extraRek, setExtraRek] = useState<ExtraRekening>({ iban: '', naam: '', type: 'spaar' });
  const [extraToegevoegd, setExtraToegevoegd] = useState<ExtraRekening[]>([]);
  const [extraBezig, setExtraBezig] = useState(false);
  const [extraFout, setExtraFout] = useState<string | null>(null);

  function laadStats() {
    fetch('/api/stats').then(r => r.ok ? r.json() : null).then(setDbStats).catch(() => {});
  }

  useEffect(() => {
    fetch('/api/budgetten-potjes').then(r => r.ok ? r.json() : []).then(setCategorieen).catch(() => {});
    laadGeschiedenis();
    laadStats();
  }, []);

  function laadGeschiedenis() {
    fetch('/api/imports').then(r => r.ok ? r.json() : []).then(setGeschiedenis).catch(() => {});
  }

  function toggleImport(id: number) {
    setOpenImport(prev => prev === id ? null : id);
  }

  const startImport = useCallback(async (bestanden: File[]) => {
    if (bestanden.length === 0 || bezig) return;
    setOpgeslagenBestanden(bestanden);
    setBestandStatussen(bestanden.map(b => ({ naam: b.name, status: 'bezig' })));
    setFout(null);

    const formData = new FormData();
    for (const b of bestanden) formData.append('files', b);
    await verstuurFormData(formData, bestanden);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bezig]);

  async function verstuurFormData(formData: FormData, bestanden: File[]) {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setFout(data.error ?? 'Import mislukt.');
        setBestandStatussen(bestanden.map(b => ({ naam: b.name, status: 'fout', fout: data.error })));
      } else if (data.onbekendeRekeningen) {
        setOnbekend(data.onbekendeRekeningen);
        setKeuzes((data.onbekendeRekeningen as OnbekendeRekening[]).map(r => ({
          iban: r.iban, eersteTransactie: r.eersteTransactie,
          actie: 'toevoegen', naam: '', type: 'betaal', categorie_ids: [],
        })));
        setBestandStatussen(bestanden.map(b => ({ naam: b.name, status: 'wacht' })));
      } else {
        const resultaten = data.resultaten as ImportResultaat[];
        setBestandStatussen(bestanden.map((b, i) => ({
          naam: b.name, status: 'klaar', resultaat: resultaten[i],
        })));
        const totalen = {
          nieuw: resultaten.reduce((s, r) => s + r.totaal - r.overgeslagen, 0),
          duplicaten: resultaten.reduce((s, r) => s + r.overgeslagen, 0),
          gecategoriseerd: resultaten.reduce((s, r) => s + r.gecategoriseerd, 0),
          ongecategoriseerd: resultaten.reduce((s, r) => s + r.ongecategoriseerd, 0),
        };
        setLaatste(totalen);
        localStorage.setItem('fbs-laatste-import', JSON.stringify(totalen));
        laadGeschiedenis(); laadStats(); router.refresh();
        setOnbekend(null);

        // Potjesbeheer: toon fase 2 (extra eigen rekeningen) als er onbekende rekeningen waren
        const isOnboarding = typeof window !== 'undefined' && !localStorage.getItem('onboarding-voltooid');
        if (profiel === 'potjesbeheer' && isOnboarding && onbekend && onbekend.length > 0) {
          const bevestigdeNamen = keuzes.filter(k => k.actie === 'toevoegen').map(k => k.naam || k.iban);
          setFase2Rekeningen(bevestigdeNamen);
          setFase2(true);
        } else {
          const vd = data.recentsteDatum as string | null;
          if (vd) {
            const d = new Date(vd);
            router.push(`/transacties?maand=${d.getFullYear()}-${d.getMonth() + 1}`);
          } else {
            router.push('/transacties');
          }
        }
      }
    } catch {
      setFout('Verbindingsfout — import niet voltooid.');
      setBestandStatussen(bestanden.map(b => ({ naam: b.name, status: 'fout' })));
    } finally {
      setBezig(false);
    }
  }

  async function handleBevestig() {
    for (const k of keuzes) {
      if (k.actie === 'toevoegen' && !k.naam.trim()) {
        setFout(`Vul een naam in voor ${k.iban}.`);
        return;
      }
    }
    setFout(null);

    const bevestigde = keuzes
      .filter(k => k.actie === 'toevoegen')
      .map(k => ({ iban: k.iban, naam: k.naam.trim(), type: k.type, categorie_ids: k.categorie_ids }));
    const genegeerd  = keuzes.filter(k => k.actie === 'negeren').map(k => k.iban);
    const permanent  = keuzes.filter(k => k.actie === 'permanent').map(k => k.iban);

    const formData = new FormData();
    for (const b of opgeslagenBestanden) formData.append('files', b);
    formData.append('bevestigdeRekeningen',    JSON.stringify(bevestigde));
    formData.append('genegeerdeIbans',         JSON.stringify(genegeerd));
    formData.append('permanentGenegeerdeIbans', JSON.stringify(permanent));
    setBestandStatussen(opgeslagenBestanden.map(b => ({ naam: b.name, status: 'bezig' })));
    await verstuurFormData(formData, opgeslagenBestanden);
  }

  async function handleExtraToevoegen() {
    if (!extraRek.iban.trim() || !extraRek.naam.trim()) {
      setExtraFout('Vul zowel IBAN als naam in.');
      return;
    }
    setExtraBezig(true);
    setExtraFout(null);
    try {
      const res = await fetch('/api/rekeningen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iban: extraRek.iban.trim(), naam: extraRek.naam.trim(), type: extraRek.type }),
      });
      if (!res.ok) {
        const d = await res.json();
        setExtraFout(d.error ?? 'Toevoegen mislukt.');
        setExtraBezig(false);
        return;
      }
      setExtraToegevoegd(prev => [...prev, { ...extraRek, iban: extraRek.iban.trim(), naam: extraRek.naam.trim() }]);
      setExtraRek({ iban: '', naam: '', type: 'spaar' });
    } catch {
      setExtraFout('Verbindingsfout.');
    }
    setExtraBezig(false);
  }

  function sluitFase2() {
    setFase2(false);
    setExtraToegevoegd([]);
    setExtraRek({ iban: '', naam: '', type: 'spaar' });
    setExtraFout(null);
  }

  function updateKeuze(iban: string, patch: Partial<RekeningKeuze>) {
    setKeuzes(prev => prev.map(k => k.iban === iban ? { ...k, ...patch } : k));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const bestanden = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (bestanden.length > 0) startImport(bestanden);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const bestanden = e.target.files ? Array.from(e.target.files) : [];
    if (bestanden.length > 0) startImport(bestanden);
    if (inputRef.current) inputRef.current.value = '';
  }

  function openDevModal() {
    const mock: OnbekendeRekening[] = [
      { iban: 'NL91ABNA0417164300', eersteTransactie: 'Albert Heijn — boodschappen' },
      { iban: 'NL69INGB0123456789', eersteTransactie: null },
    ];
    setOnbekend(mock);
    setKeuzes(mock.map(r => ({ iban: r.iban, eersteTransactie: r.eersteTransactie, actie: 'toevoegen', naam: '', type: 'betaal', categorie_ids: [] })));
  }

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && searchParams.get('devmodal') === '1') {
      openDevModal();
    }
  }, []);

  return (
    <>
      {/* Database stats */}
      {dbStats && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Database</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            <Stat label="Transacties" waarde={dbStats.totaal} kleur="var(--text-h)" />
            <Stat label="Gecategoriseerd" waarde={dbStats.gecategoriseerd} kleur="var(--green)" />
            <StatLink href="/transacties?ongecategoriseerd=1" label="Ongecategoriseerd" waarde={dbStats.ongecategoriseerd} kleur={dbStats.ongecategoriseerd > 0 ? 'var(--red)' : 'var(--text-dim)'} />
            <StatLink href="/instellingen#budgetten-potjes" label="Categorieën" waarde={dbStats.categorieen} kleur="var(--accent)" />
            <StatLink href="/instellingen#budgetten-potjes" label="Subcategorieën" waarde={dbStats.subcategorieen} kleur="var(--accent)" />
          </div>
        </div>
      )}

      {/* Drag & drop zone */}
      <div
        data-onboarding="dropzone"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !bezig && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
          cursor: bezig ? 'not-allowed' : 'pointer',
          background: dragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
          transition: 'all 0.2s',
          marginBottom: 24,
        }}
      >
        <input ref={inputRef} type="file" accept=".csv" multiple onChange={handleFileChange} style={{ display: 'none' }} />
        <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>&#8593;</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4 }}>
          Sleep CSV bestanden hierheen
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          of klik om te bladeren
        </p>
      </div>

      {/* Foutmelding */}
      {fout && !onbekend && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>
          {fout}
        </div>
      )}

      {/* Bestandstatussen */}
      {bestandStatussen.length > 0 && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bestandStatussen.map((bs, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: bs.resultaat ? 10 : 0 }}>
                {bs.status === 'bezig' && <span style={{ color: 'var(--accent)', fontSize: 14 }}>&#9696;</span>}
                {bs.status === 'klaar' && <span style={{ color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>&#10003;</span>}
                {bs.status === 'fout' && <span style={{ color: 'var(--red)', fontSize: 14, fontWeight: 700 }}>&#10007;</span>}
                {bs.status === 'wacht' && <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>&#8987;</span>}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{bs.naam}</span>
                {bs.status === 'bezig' && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Importeren…</span>}
              </div>

              {bs.resultaat && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <Stat label="Nieuw" waarde={bs.resultaat.totaal - bs.resultaat.overgeslagen} kleur="var(--green)" />
                  <Stat label="Duplicaten" waarde={bs.resultaat.overgeslagen} kleur="var(--text-dim)" />
                  <Stat label="Gecategoriseerd" waarde={bs.resultaat.gecategoriseerd} kleur="var(--accent)" />
                  <Stat label="Ongecategoriseerd" waarde={bs.resultaat.ongecategoriseerd} kleur="var(--text-dim)" />
                </div>
              )}

              {bs.fout && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{bs.fout}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Importgeschiedenis */}
      {geschiedenis.length > 0 && (
        <div>
          <p className="section-title" style={{ marginBottom: 10 }}>Eerdere imports</p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Bestand</th>
                  <th style={{ textAlign: 'right' }}>Totaal</th>
                  <th style={{ textAlign: 'right' }}>Nieuw</th>
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {geschiedenis.slice(0, 10).map(imp => {
                  const isOpen = openImport === imp.id;
                  return (
                    <Fragment key={imp.id}>
                      <tr onClick={() => toggleImport(imp.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 12 }}>
                          {new Date(imp.geimporteerd_op).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ fontSize: 13 }}>{imp.bestandsnaam}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{imp.aantal_transacties}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--green)' }}>{imp.aantal_nieuw}</td>
                        <td style={{ width: 28, textAlign: 'center', color: 'var(--text-dim)', fontSize: 10 }}>
                          <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bls-expand">
                          <td colSpan={5} style={{ padding: '0 0 8px 0', background: 'var(--bg-base)' }}>
                            <ImportTransactiesSubtabel importId={imp.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: onbekende rekeningen */}
      {onbekend && (
        <div data-onboarding="onbekende-rekeningen-modal" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 28, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: '0 0 10px' }}>
              Onbekende rekeningen gevonden
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 6px', lineHeight: 1.6 }}>
              In dit CSV-bestand staan IBAN-nummers die FBS nog niet kent. Maak per rekening een keuze voordat de import wordt doorgezet.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 20px', lineHeight: 1.6 }}>
              Je kunt rekeningen altijd later toevoegen, bewerken of negeren via <strong>Instellingen</strong>.
            </p>

            {fout && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{fout}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {keuzes.map(k => (
                <div key={k.iban} style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 16,
                }}>
                  <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--text-h)', letterSpacing: '0.5px', marginBottom: 12 }}>
                    {k.iban}
                  </p>

                  {k.actie === 'toevoegen' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Naam *</label>
                        <input style={fieldStyle} value={k.naam} onChange={e => updateKeuze(k.iban, { naam: e.target.value })} placeholder="Eigen omschrijving" />
                      </div>
                      <div>
                        <label style={labelStyle}>Type</label>
                        <select style={fieldStyle} value={k.type} onChange={e => updateKeuze(k.iban, { type: e.target.value as 'betaal' | 'spaar' })}>
                          <option value="betaal">Betaalrekening</option>
                          <option value="spaar">Spaarrekening</option>
                        </select>
                      </div>
                      {categorieen.length > 0 && profiel !== 'uitgavenbeheer' && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ marginBottom: 6 }}>
                            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Koppel aan categorieën <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optioneel)</span></p>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>Transacties van een categorie horen op een vaste rekening thuis. Koppel je hier een categorie, dan signaleert het Dashboard automatisch als een transactie op de verkeerde rekening staat.</p>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {categorieen.filter(c => c.naam !== 'Omboekingen').map(c => {
                              const actief = k.categorie_ids.includes(c.id);
                              const kleur = c.kleur ?? '#748ffc';
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => updateKeuze(k.iban, {
                                    categorie_ids: actief ? k.categorie_ids.filter(id => id !== c.id) : [...k.categorie_ids, c.id],
                                  })}
                                  style={{
                                    padding: '3px 10px',
                                    fontSize: 12,
                                    borderRadius: 12,
                                    cursor: 'pointer',
                                    border: actief ? `1.5px solid color-mix(in srgb, ${kleur} 30%, transparent)` : '1px solid var(--border)',
                                    background: actief ? `color-mix(in srgb, ${kleur} 15%, transparent)` : 'var(--bg-base)',
                                    color: actief ? kleur : 'var(--text-dim)',
                                    fontWeight: actief ? 600 : 400,
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {c.naam}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Negeren-opties — subtiel, onderaan */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center', flexShrink: 0 }}>Niet toevoegen?</span>
                    {([
                      { actie: 'negeren' as const, label: 'Negeren (eenmalig)', title: 'Transacties worden nu geïmporteerd, maar de rekening wordt niet opgeslagen. Volgende import vraagt FBS opnieuw.' },
                      { actie: 'permanent' as const, label: 'Permanent negeren', title: 'Rekening en transacties worden bij alle toekomstige imports automatisch overgeslagen.' },
                    ]).map(({ actie, label, title }) => (
                      <label key={actie} title={title} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>
                        <input type="radio" name={`actie-${k.iban}`} value={actie} checked={k.actie === actie} onChange={() => updateKeuze(k.iban, { actie })} />
                        {label}
                      </label>
                    ))}
                    {k.actie !== 'toevoegen' && (
                      <button type="button" onClick={() => updateKeuze(k.iban, { actie: 'toevoegen' })} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Toch toevoegen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => { setOnbekend(null); setFout(null); setBestandStatussen([]); }}
                disabled={bezig}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: bezig ? 'not-allowed' : 'pointer' }}
              >
                Annuleer
              </button>
              <button
                onClick={handleBevestig}
                disabled={bezig}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: bezig ? 'not-allowed' : 'pointer', opacity: bezig ? 0.6 : 1 }}
              >
                {bezig ? 'Bezig…' : 'Bevestigen en importeren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fase 2: extra eigen rekeningen toevoegen (potjesbeheer onboarding) */}
      {fase2 && (
        <div data-onboarding="fase2-rekeningen" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 28, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: '0 0 10px' }}>
              Heb je nog meer eigen rekeningen?
            </p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.6 }}>
              Je hebt zojuist {fase2Rekeningen.length === 1 ? 'de rekening' : 'de rekeningen'}{' '}
              <strong>{fase2Rekeningen.join(', ')}</strong> toegevoegd uit je CSV.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.6 }}>
              Heb je nog andere rekeningen waar je geld naartoe overboekt? Denk aan spaarrekeningen, potjes of een gezamenlijke rekening. Voeg ze hier toe zodat FBS overboekingen herkent en ze niet als uitgave of inkomst meetelt.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Geen extra rekeningen? Klik dan op "Klaar, ga verder" onderaan.
            </p>

            {extraFout && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{extraFout}</p>
            )}

            {/* Toegevoegde extra rekeningen */}
            {extraToegevoegd.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zojuist toegevoegd</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {extraToegevoegd.map(r => (
                    <div key={r.iban} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '8px 12px',
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-dim)' }}>{r.iban}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-h)', fontWeight: 600 }}>{r.naam}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                        {r.type === 'betaal' ? 'Betaalrekening' : 'Spaarrekening'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Formulier extra rekening */}
            <div style={{
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 16,
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 12 }}>Rekening toevoegen</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>IBAN *</label>
                  <input
                    style={fieldStyle}
                    value={extraRek.iban}
                    onChange={e => setExtraRek(r => ({ ...r, iban: e.target.value }))}
                    placeholder="NLxxRABOxxxxxxxxxx"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Naam *</label>
                  <input
                    style={fieldStyle}
                    value={extraRek.naam}
                    onChange={e => setExtraRek(r => ({ ...r, naam: e.target.value }))}
                    placeholder="Bijv. Spaarrekening"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Type</label>
                  <select
                    style={{ ...fieldStyle, colorScheme: 'dark' }}
                    value={extraRek.type}
                    onChange={e => setExtraRek(r => ({ ...r, type: e.target.value as 'betaal' | 'spaar' }))}
                  >
                    <option value="betaal">Betaalrekening</option>
                    <option value="spaar">Spaarrekening</option>
                  </select>
                </div>
                <button
                  onClick={handleExtraToevoegen}
                  disabled={extraBezig}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '7px 18px', fontSize: 13, fontWeight: 600,
                    cursor: extraBezig ? 'not-allowed' : 'pointer',
                    opacity: extraBezig ? 0.6 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  {extraBezig ? 'Toevoegen…' : 'Toevoegen'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={sluitFase2}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Klaar, ga verder →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, waarde, kleur }: { label: string; waarde: number; kleur: string }) {
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: kleur, fontVariantNumeric: 'tabular-nums' }}>{waarde}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

function StatLink({ href, label, waarde, kleur }: { href: string; label: string; waarde: number; kleur: string }) {
  return (
    <a href={href} style={{ textDecoration: 'none', background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px', textAlign: 'center', display: 'block', cursor: 'pointer' }}
       onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))')}
       onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-base)')}>
      <div style={{ fontSize: 18, fontWeight: 700, color: kleur, fontVariantNumeric: 'tabular-nums' }}>{waarde}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </a>
  );
}
