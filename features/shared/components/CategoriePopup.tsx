// FILE: CategoriePopup.tsx
// AANGEMAAKT: 31-03-2026 00:00
// VERSIE: 1
// GEWIJZIGD: 02-04-2026 00:15
//
// WIJZIGINGEN (02-04-2026 00:15):
// - onBevestigStart callback: wordt als eerste aangeroepen bij Opslaan, vóór state-updates en API calls
// WIJZIGINGEN (31-03-2026 20:00):
// - datum_aanpassing i.p.v. originele_datum; t.datum is altijd de originele importdatum
// - onDatumWijzig vereenvoudigd: (datum: string | null) → null wist datum_aanpassing
// - tijdelijkeOrigineleDatum state verwijderd; undefined/null/string sentinel op tijdelijkeDatum
// WIJZIGINGEN (31-03-2026 02:00):
// - Woordfrequentie analyse: onAnalyseer prop, Analyseer/Verberg knop, tellers in omschrijving chips
// WIJZIGINGEN (31-03-2026 00:00):
// - Geëxtraheerd uit TransactiesTabel.tsx: patronModal popup als gedeeld component
// - Props: patronModal data, setPatronModal, onBevestig, onSluiten, budgettenPotjes, rekeningen, uniekeCategorieenDropdown

'use client';

import { useState } from 'react';
import { ChevronRight, ChevronsLeft, ChevronsRight, ArrowLeft, ArrowRight, ArrowLeftRight, Settings } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import type { TransactieMetCategorie } from '@/lib/transacties';
import type { Periode } from '@/lib/maandperiodes';
import { formatDatum } from '@/features/shared/utils/format';

export interface PatronModalData {
  transactie: TransactieMetCategorie;
  toelichting: string;
  nieuweCat: string;
  catNieuw: boolean;
  nieuweCatRekeningId: string;
  subcategorie: string;
  subcatOpties: string[];
  subcatGearchiveerd?: string[];
  subcatNieuw: boolean;
  naamChips: { label: string; waarde: string }[];
  gekozenNaamChips: string[];
  chips: { label: string; waarde: string }[];
  gekozenWoorden: string[];
  scope: 'enkel' | 'alle';
  bedragMin: number | null;
  bedragMax: number | null;
}

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; type?: string; kleur?: string | null; kleur_auto?: number; }

interface CategoriePopupProps {
  patronModal: PatronModalData;
  setPatronModal: React.Dispatch<React.SetStateAction<PatronModalData | null>>;
  onBevestig: () => void;
  onBevestigStart?: () => void;
  onSluiten: () => void;
  onReset?: () => void;
  onAnalyseer: () => Promise<Record<string, number>>;
  onDatumWijzig: (datum: string | null) => Promise<void>;
  onVoegRekeningToe: (iban: string, naam: string) => void;
  budgettenPotjes: BudgetPotjeNaam[];
  rekeningen: Rekening[];
  periodes: Periode[];
  uniekeCategorieenDropdown: string[];
  alleSubcatMap?: Record<string, { naam: string; inActieveRegel: boolean }[]>;
  gebruikersProfiel?: 'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null;
}

function berekeningPeriodeBereik(jaar: number, maand: number, maandStartDag: number): { start: string } {
  function toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const prevMaand0 = maand === 1 ? 11 : maand - 2;
  const prevJaar   = maand === 1 ? jaar - 1 : jaar;
  const start = maandStartDag === 1
    ? new Date(jaar, maand - 1, 1)
    : new Date(prevJaar, prevMaand0, maandStartDag);
  return { start: toISO(start) };
}

export default function CategoriePopup({
  patronModal, setPatronModal, onBevestig, onBevestigStart, onSluiten, onReset, onAnalyseer, onDatumWijzig, onVoegRekeningToe,
  budgettenPotjes, rekeningen, periodes, uniekeCategorieenDropdown, alleSubcatMap, gebruikersProfiel,
}: CategoriePopupProps) {
  const [woordTellers, setWoordTellers]     = useState<Record<string, number> | null>(null);
  const [tellerLaden, setTellerLaden]       = useState(false);
  // undefined = geen lokale wijziging, null = herstel (wis datum_aanpassing), string = nieuwe datum
  const [tijdelijkeDatum, setTijdelijkeDatum] = useState<string | null | undefined>(undefined);
  const [subVerwijderVraag, setSubVerwijderVraag] = useState<{ oudeCategorie: string; oudeSubcategorie: string } | null>(null);
  const [vrijeKeuzeOpen, setVrijeKeuzeOpen]       = useState(false);
  const [vrijeKeuzeJaarOpen, setVrijeKeuzeJaarOpen] = useState(false);
  const [vrijeKeuzeJaar, setVrijeKeuzeJaar]       = useState<number>(new Date().getFullYear());
  const [vrijeKeuzeMaand, setVrijeKeuzeMaand]     = useState<number>(new Date().getMonth() + 1);
  const [rekeningFormOpen, setRekeningFormOpen]   = useState(false);
  const [rekeningNaam, setRekeningNaam]           = useState('');
  const [rekeningType, setRekeningType]           = useState<'betaal' | 'spaar'>('betaal');
  const [rekeningGroepId, setRekeningGroepId]     = useState<number | ''>('');
  const [gekozenBudgetIds, setGekozenBudgetIds]   = useState<number[]>([]);
  const [rekeningGroepen, setRekeningGroepen]     = useState<{ id: number; naam: string; rekening_ids: number[] }[]>([]);
  const [rekeningLaden, setRekeningLaden]         = useState(false);
  const [rekeningFout, setRekeningFout]           = useState<string | null>(null);
  const [rekeningKleurAuto, setRekeningKleurAuto] = useState(true);
  const [rekeningKleurWaarde, setRekeningKleurWaarde] = useState('#7c8cff');
  const [eigenRekFormOpen, setEigenRekFormOpen]   = useState(false);
  const [eigenRekLaden, setEigenRekLaden]         = useState(false);
  const [eigenRekFout, setEigenRekFout]           = useState<string | null>(null);
  const [bewerkRekeningId, setBewerkRekeningId]   = useState<number | null>(null);
  const [eigenRekForm, setEigenRekForm]           = useState<{
    naam: string; type: 'betaal' | 'spaar'; kleurAuto: boolean; kleur: string;
    groepId: number | ''; budgetIds: number[];
  }>({ naam: '', type: 'betaal', kleurAuto: false, kleur: '#7c8cff', groepId: '', budgetIds: [] });
  // Bedrag-bereik sectie standaard ingeklapt; opent automatisch als de regel al een bereik heeft
  const [bedragBereikOpen, setBedragBereikOpen] = useState(patronModal.bedragMin !== null || patronModal.bedragMax !== null);
  const [resetPreview, setResetPreview] = useState<{ categorie: string | null; subcategorie: string | null } | null>(null);
  const [resetBezig, setResetBezig] = useState(false);

  const t = patronModal.transactie;
  const isOmboeking = t.type === 'omboeking-af' || t.type === 'omboeking-bij';
  const eigenRekening = rekeningen.find(r => r.iban === t.iban_bban);

  // Effectieve datum: lokale keuze heeft voorrang, anders DB-aanpassing, anders importdatum
  const effectieveDatum     = tijdelijkeDatum !== undefined ? (tijdelijkeDatum ?? t.datum) : (t.datum_aanpassing ?? t.datum);
  const heeftDatumWijziging = tijdelijkeDatum !== undefined ? tijdelijkeDatum !== null : !!t.datum_aanpassing;

  const maandStartDag = periodes.length > 0 ? parseInt(periodes[0].start.slice(8, 10), 10) : 1;

  const currentPeriodeIdx = effectieveDatum
    ? periodes.findIndex(p => effectieveDatum >= p.start && effectieveDatum <= p.eind)
    : -1;
  const volgendePeriode = currentPeriodeIdx >= 0 && currentPeriodeIdx < periodes.length - 1
    ? periodes[currentPeriodeIdx + 1]
    : null;
  const vorigePeriode = currentPeriodeIdx > 0
    ? periodes[currentPeriodeIdx - 1]
    : null;

  const beschikbareJaren = [...new Set(periodes.map(p => p.jaar))].sort((a, b) => a - b);

  function stelDatumIn(nieuweDatum: string) {
    setTijdelijkeDatum(nieuweDatum);
    setPatronModal(m => m ? { ...m, scope: 'enkel' } : m);
    setVrijeKeuzeOpen(false);
    setVrijeKeuzeJaarOpen(false);
  }

  function handleVrijeKeuzeBevestig() {
    const periode = periodes.find(p => p.jaar === vrijeKeuzeJaar && p.maand === vrijeKeuzeMaand);
    const start = periode?.start ?? berekeningPeriodeBereik(vrijeKeuzeJaar, vrijeKeuzeMaand, maandStartDag).start;
    stelDatumIn(start);
  }

  async function openRekeningForm() {
    setRekeningNaam(t.naam_tegenpartij ?? '');
    setRekeningType('betaal');
    setRekeningGroepId('');
    setGekozenBudgetIds([]);
    setRekeningFout(null);
    setRekeningKleurAuto(true);
    setRekeningKleurWaarde('#7c8cff');
    const groepen = await fetch('/api/rekening-groepen').then(r => r.ok ? r.json() : []);
    setRekeningGroepen(groepen);
    setRekeningFormOpen(true);
  }

  async function handleRekeningToevoegen() {
    setRekeningLaden(true);
    setRekeningFout(null);
    try {
      const res = await fetch('/api/rekeningen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iban: t.tegenrekening_iban_bban, naam: rekeningNaam, type: rekeningType, kleur: rekeningKleurAuto ? null : rekeningKleurWaarde, kleur_auto: rekeningKleurAuto ? 1 : 0 }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        setRekeningFout(error ?? 'Onbekende fout');
        return;
      }
      const { id: nieuweId } = await res.json();
      if (rekeningGroepId !== '') {
        const groep = rekeningGroepen.find(g => g.id === rekeningGroepId);
        if (groep) {
          await fetch(`/api/rekening-groepen/${rekeningGroepId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekening_ids: [...groep.rekening_ids, nieuweId] }),
          });
        }
      }
      for (const budgetId of gekozenBudgetIds) {
        const bp = budgettenPotjes.find(b => b.id === budgetId);
        if (bp) {
          await fetch(`/api/budgetten-potjes/${budgetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekening_ids: [...bp.rekening_ids, nieuweId] }),
          });
        }
      }
      setRekeningFormOpen(false);
      onVoegRekeningToe(t.tegenrekening_iban_bban!, rekeningNaam);
    } catch {
      setRekeningFout('Er is een fout opgetreden.');
    } finally {
      setRekeningLaden(false);
    }
  }

  async function openRekeningEditForm(rek: Rekening) {
    if (!rek) return;
    setBewerkRekeningId(rek.id);
    const groepen: { id: number; naam: string; rekening_ids: number[] }[] =
      await fetch('/api/rekening-groepen').then(r => r.ok ? r.json() : []);
    setRekeningGroepen(groepen);
    const huidigeGroep = groepen.find(g => g.rekening_ids.includes(rek.id));
    const huidigeBudgetIds = budgettenPotjes.filter(bp => bp.rekening_ids.includes(rek.id)).map(bp => bp.id);
    setEigenRekForm({
      naam: rek.naam,
      type: (rek.type as 'betaal' | 'spaar') ?? 'betaal',
      kleurAuto: rek.kleur_auto === 1,
      kleur: rek.kleur ?? '#7c8cff',
      groepId: huidigeGroep?.id ?? '',
      budgetIds: huidigeBudgetIds,
    });
    setEigenRekFout(null);
    setEigenRekFormOpen(true);
  }

  async function handleEigenRekeningOpslaan() {
    const rek = rekeningen.find(r => r.id === bewerkRekeningId);
    if (!rek) return;
    setEigenRekLaden(true);
    setEigenRekFout(null);
    try {
      const res = await fetch(`/api/rekeningen/${rek.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iban: rek.iban, naam: eigenRekForm.naam, type: eigenRekForm.type, kleur: eigenRekForm.kleur || null, kleur_auto: eigenRekForm.kleurAuto ? 1 : 0 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEigenRekFout(body.error ?? 'Onbekende fout');
        return;
      }
      // Groepen bijwerken: verwijder uit groepen die niet meer gelden
      for (const groep of rekeningGroepen) {
        if (groep.rekening_ids.includes(rek.id) && groep.id !== eigenRekForm.groepId) {
          await fetch(`/api/rekening-groepen/${groep.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekening_ids: groep.rekening_ids.filter(id => id !== rek.id) }),
          });
        }
      }
      if (eigenRekForm.groepId !== '') {
        const nieuweGroep = rekeningGroepen.find(g => g.id === eigenRekForm.groepId);
        if (nieuweGroep && !nieuweGroep.rekening_ids.includes(rek.id)) {
          await fetch(`/api/rekening-groepen/${eigenRekForm.groepId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekening_ids: [...nieuweGroep.rekening_ids, rek.id] }),
          });
        }
      }
      // BudgetPotjes bijwerken
      for (const bp of budgettenPotjes) {
        const had = bp.rekening_ids.includes(rek.id);
        const heeft = eigenRekForm.budgetIds.includes(bp.id);
        if (had !== heeft) {
          await fetch(`/api/budgetten-potjes/${bp.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekening_ids: heeft ? [...bp.rekening_ids, rek.id] : bp.rekening_ids.filter(id => id !== rek.id) }),
          });
        }
      }
      setEigenRekFormOpen(false);
      onVoegRekeningToe(rek.iban, eigenRekForm.naam);
    } catch {
      setEigenRekFout('Er is een fout opgetreden.');
    } finally {
      setEigenRekLaden(false);
    }
  }

  async function handleBevestig() {
    // Check of oude subcategorie ongebruikt wordt na deze wijziging
    const oudeCategorie = patronModal.transactie.categorie;
    const oudeSubcategorie = patronModal.transactie.subcategorie;
    const nieuweSubcategorie = patronModal.subcategorie;

    if (oudeCategorie && oudeSubcategorie && oudeSubcategorie !== nieuweSubcategorie) {
      const res = await fetch(`/api/subcategorieen/gebruik?categorie=${encodeURIComponent(oudeCategorie)}&subcategorie=${encodeURIComponent(oudeSubcategorie)}`);
      if (res.ok) {
        const { aantal } = await res.json();
        if (aantal <= 1) {
          // Dit is de laatste — vraag de gebruiker
          setSubVerwijderVraag({ oudeCategorie, oudeSubcategorie });
          return;
        }
      }
    }

    await voltooiOpslaan(false);
  }

  async function voltooiOpslaan(verwijderOudeSubcategorie: boolean) {
    if (resetPreview) {
      onBevestigStart?.();
      await fetch(`/api/transacties/${patronModal.transactie.id}/reset`, { method: 'POST' });
      onReset?.();
      return;
    }
    onBevestigStart?.();
    if (tijdelijkeDatum !== undefined) {
      await onDatumWijzig(tijdelijkeDatum);
    }
    onBevestig();

    // Verwijder oude subcategorie als gebruiker dat heeft gekozen
    if (verwijderOudeSubcategorie && subVerwijderVraag) {
      const subs = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(subVerwijderVraag.oudeCategorie)}&volledig=1`).then(r => r.ok ? r.json() : []);
      const sub = subs.find((s: { naam: string }) => s.naam === subVerwijderVraag.oudeSubcategorie);
      if (sub) await fetch(`/api/subcategorieen/${sub.id}`, { method: 'DELETE' });
    }
    setSubVerwijderVraag(null);
  }

  const MAAND_NAMEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];

  const sectionLabel: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  };
  const subtielKnop: React.CSSProperties = {
    border: '1px solid var(--border)', background: 'none', color: 'var(--text-dim)',
    fontSize: 11, borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
  };
  const kaartStijl: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', flex: 1,
  };

  return (
    <div data-onboarding="categorie-popup" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
      <div data-onboarding="popup-kaart" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, minWidth: 360, maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 32px)', overflow: 'hidden' }}>
        <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-h)', fontSize: 16 }}>Omschrijving matchcriterium</h3>
        <p style={{ margin: '0 0 14px', color: 'var(--text)', fontSize: 13 }}>
          Categorie <strong>{patronModal.nieuweCat}</strong> wordt opgeslagen voor alle transacties van{' '}
          <strong>{patronModal.transactie.naam_tegenpartij ?? 'deze tegenpartij'}</strong>.
          Selecteer optioneel een terugkerend woord om de regel specifieker te maken:
        </p>

        {/* Sectie 1: Datum */}
        <div data-onboarding="popup-datum" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={sectionLabel}>Boekdatum <InfoTooltip volledigeBreedte tekst="De boekdatum bepaalt in welke maandperiode deze transactie wordt meegeteld. Standaard is dit de importdatum van de bank. Gebruik de knoppen om de transactie naar een aangrenzende periode te verplaatsen, of open het tandwiel om een specifieke maand en jaar te kiezen." /></div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            {/* Links: datum weergave */}
            <div>
              {heeftDatumWijziging ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{formatDatum(t.datum)}</span>
                    <ArrowRight size={13} style={{ color: 'var(--text-dim)', margin: '0 6px' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{formatDatum(effectieveDatum)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Geboekt in: {currentPeriodeIdx >= 0 ? `${MAAND_NAMEN[periodes[currentPeriodeIdx].maand - 1]} ${periodes[currentPeriodeIdx].jaar}` : '—'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 15, color: 'var(--text-h)', fontWeight: 600 }}>{formatDatum(effectieveDatum)}</div>
              )}
            </div>
            {/* Rechts: knoppen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              {heeftDatumWijziging ? (
                <button style={subtielKnop} onClick={() => {
                  if (tijdelijkeDatum !== undefined && tijdelijkeDatum !== null) {
                    // Undo lokale wijziging → terug naar DB-staat
                    setTijdelijkeDatum(undefined);
                  } else {
                    // Herstel importdatum → wis datum_aanpassing bij Opslaan
                    setTijdelijkeDatum(null);
                  }
                }}>
                  Herstel originele datum
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {volgendePeriode && (
                      <button style={subtielKnop} onClick={() => stelDatumIn(volgendePeriode.start)}>
                        Boeken in {MAAND_NAMEN[volgendePeriode.maand - 1]} {volgendePeriode.jaar}
                        <ChevronsRight size={13} />
                      </button>
                    )}
                    {vorigePeriode && (
                      <button style={subtielKnop} onClick={() => stelDatumIn(vorigePeriode.eind)}>
                        <ChevronsLeft size={13} />
                        Boeken in {MAAND_NAMEN[vorigePeriode.maand - 1]} {vorigePeriode.jaar}
                      </button>
                    )}
                  </div>
                  {/* Tandwiel + uitklapbare maand/jaar keuze in één uitbreidend kader */}
                  <div style={{
                    alignSelf: 'stretch', border: '1px solid var(--border)', borderRadius: 4,
                    display: 'flex', alignItems: 'stretch', flexShrink: 0, overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', padding: '0 5px', cursor: 'pointer', flexShrink: 0,
                        color: vrijeKeuzeOpen ? 'var(--accent)' : 'var(--text-dim)',
                        background: vrijeKeuzeOpen ? 'var(--accent-dim)' : 'none',
                        borderRight: vrijeKeuzeOpen ? '1px solid var(--border)' : 'none',
                      }}
                      onClick={() => { setVrijeKeuzeOpen(v => !v); setVrijeKeuzeJaarOpen(false); }}
                    >
                      <Settings size={14} />
                    </div>
                    {vrijeKeuzeOpen && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
                        <select
                          value={vrijeKeuzeMaand}
                          onChange={e => setVrijeKeuzeMaand(Number(e.target.value))}
                          style={{ fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-h)', padding: '2px 4px' }}
                        >
                          {MAAND_NAMEN.map((naam, i) => <option key={i} value={i + 1}>{naam}</option>)}
                        </select>
                        {!vrijeKeuzeJaarOpen ? (
                          <button
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-dim)', cursor: 'pointer', padding: '1px 5px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            onClick={() => {
                              setVrijeKeuzeJaarOpen(true);
                              const jaar = effectieveDatum ? parseInt(effectieveDatum.slice(0, 4), 10) : beschikbareJaren[beschikbareJaren.length - 1] ?? new Date().getFullYear();
                              setVrijeKeuzeJaar(beschikbareJaren.includes(jaar) ? jaar : beschikbareJaren[beschikbareJaren.length - 1] ?? jaar);
                            }}
                          >
                            <ChevronRight size={13} />
                          </button>
                        ) : (
                          <select
                            value={vrijeKeuzeJaar}
                            onChange={e => setVrijeKeuzeJaar(Number(e.target.value))}
                            style={{ fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-h)', padding: '2px 4px' }}
                          >
                            {beschikbareJaren.map(j => <option key={j} value={j}>{j}</option>)}
                          </select>
                        )}
                        <button onClick={handleVrijeKeuzeBevestig} style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>OK</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sectie 2: Rekeningen */}
        {t.tegenrekening_iban_bban && (
          <div data-onboarding="popup-rekeningen" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={sectionLabel}>Rekeningen <InfoTooltip volledigeBreedte tekst="Toont de eigen rekening (jouw bankrekening) en de tegenrekening (de andere partij). Klik het tandwiel bij een rekening om de instellingen te bekijken en aan te passen. Is de tegenrekening nog niet als eigen rekening toegevoegd, dan kun je dat via hetzelfde tandwiel doen." /></div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
              <div style={{ ...kaartStijl, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>Eigen rekening</div>
                  <div style={{ fontSize: 13, color: 'var(--text-h)', fontWeight: 600 }}>{t.rekening_naam ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.iban_bban ?? ''}</div>
                </div>
                {eigenRekening && (
                  <button
                    onClick={() => openRekeningEditForm(eigenRekening)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    title="Rekening bewerken"
                  >
                    <Settings size={14} />
                  </button>
                )}
              </div>
              <div style={{ color: 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {isOmboeking
                  ? <ArrowLeftRight size={16} />
                  : t.type === 'normaal-bij'
                    ? <ArrowLeft size={16} />
                    : <ArrowRight size={16} />
                }
              </div>
              <div style={{ ...kaartStijl, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>Tegenrekening</div>
                  <div style={{ fontSize: 13, color: 'var(--text-h)', fontWeight: 600 }}>{t.naam_tegenpartij ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.tegenrekening_iban_bban}</div>
                </div>
                {(() => {
                  const tegenRek = rekeningen.find(r => r.iban === t.tegenrekening_iban_bban);
                  return (
                    <button
                      onClick={() => tegenRek ? openRekeningEditForm(tegenRek) : openRekeningForm()}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      title={tegenRek ? 'Rekening bewerken' : 'Toevoegen als eigen rekening'}
                    >
                      <Settings size={14} />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Categorie */}
        <div data-onboarding="popup-categorie" data-cat-gekozen={patronModal.nieuweCat && patronModal.nieuweCat !== '__geen__' ? 'true' : undefined} data-cat-nieuw={patronModal.catNieuw ? 'true' : undefined} style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Categorie <InfoTooltip volledigeBreedte tekst="Kies een categorie voor deze transactie. De gekozen categorie wordt opgeslagen als matchregel, zodat toekomstige transacties van dezelfde tegenpartij automatisch gecategoriseerd worden. Kies 'Nieuwe categorie…' om zelf een categorie aan te maken." /></label>
          {patronModal.catNieuw ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={patronModal.nieuweCat}
                onChange={e => setPatronModal(m => m ? { ...m, nieuweCat: e.target.value } : m)}
                placeholder="Typ nieuwe categorie…"
                style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)', outline: 'none' }}
              />
              <button
                onClick={() => setPatronModal(m => m ? { ...m, catNieuw: false, nieuweCat: '' } : m)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
              >✕</button>
            </div>
          ) : (
            <select
              value={patronModal.nieuweCat}
              onChange={async (e) => {
                const val = e.target.value;
                if (val === '__nieuw__') {
                  setPatronModal(m => m ? { ...m, catNieuw: true, nieuweCat: '', nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [] } : m);
                  return;
                }
                if (val === '__geen__' || val === '') {
                  setPatronModal(m => m ? { ...m, nieuweCat: val, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [] } : m);
                  return;
                }
                if (alleSubcatMap) {
                  const subs = alleSubcatMap[val] ?? [];
                  const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
                  const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);
                  setPatronModal(m => m ? { ...m, nieuweCat: val, subcategorie: '', subcatOpties, subcatGearchiveerd } : m);
                  return;
                }
                // Fallback: synchronisch nieuweCat zetten, daarna async subcategorieën ophalen.
                setPatronModal(m => m ? { ...m, nieuweCat: val, subcategorie: '', subcatOpties: [] } : m);
                const subcatRes = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(val)}&volledig=1`);
                const subs: { naam: string; inActieveRegel: boolean }[] = subcatRes.ok ? await subcatRes.json() : [];
                const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
                const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);
                setPatronModal(m => m ? { ...m, subcatOpties, subcatGearchiveerd } : m);
              }}
              style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${resetPreview ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4, padding: '4px 8px', fontSize: 12, color: resetPreview ? 'var(--accent)' : 'var(--text-h)' }}
            >
              <option value="" disabled>— Selecteer categorie —</option>
              <option value="__geen__">— Geen categorie —</option>
              {Array.from(new Set([...budgettenPotjes.map(bp => bp.naam), ...uniekeCategorieenDropdown])).sort().map(naam => <option key={naam} value={naam}>{naam}</option>)}
              <option value="__nieuw__">Nieuwe categorie…</option>
            </select>
          )}
        </div>

        {/* Rekening (alleen bij nieuwe categorie, niet in uitgavenbeheer-profiel) */}
        {patronModal.catNieuw && gebruikersProfiel !== 'uitgavenbeheer' && (
          <div data-onboarding="popup-rekening-koppeling" style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Rekening koppelen (optioneel)</label>
            <select
              value={patronModal.nieuweCatRekeningId}
              onChange={e => setPatronModal(m => m ? { ...m, nieuweCatRekeningId: e.target.value } : m)}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}
            >
              <option value="">— Geen rekening —</option>
              {rekeningen.map(r => <option key={r.id} value={r.id}>{r.naam} ({r.iban})</option>)}
            </select>
          </div>
        )}

        {/* Subcategorie */}
        <div data-onboarding="popup-subcategorie" style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Subcategorie <InfoTooltip volledigeBreedte tekst="Verfijn de categorisatie met een subcategorie, zoals 'Boodschappen › Albert Heijn'. Subcategorieën zijn optioneel en worden ook als matchregel opgeslagen. Kies 'Nieuwe subcategorie…' om er een aan te maken." /></label>
          {patronModal.subcatNieuw ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={patronModal.subcategorie}
                onChange={e => setPatronModal(m => m ? { ...m, subcategorie: e.target.value } : m)}
                placeholder="Typ subcategorie…"
                style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)', outline: 'none' }}
              />
              <button
                onClick={() => setPatronModal(m => m ? { ...m, subcatNieuw: false, subcategorie: '' } : m)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
              >✕</button>
            </div>
          ) : (
            <select
              value={patronModal.subcategorie}
              onChange={e => {
                if (e.target.value === '__nieuw__') {
                  setPatronModal(m => m ? { ...m, subcatNieuw: true, subcategorie: '' } : m);
                } else {
                  setPatronModal(m => m ? { ...m, subcategorie: e.target.value } : m);
                }
              }}
              style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${resetPreview ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4, padding: '4px 8px', fontSize: 12, color: resetPreview ? 'var(--accent)' : 'var(--text-h)' }}
            >
              <option value="" disabled>— Selecteer subcategorie —</option>
              {patronModal.subcatOpties.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__nieuw__">Nieuwe subcategorie…</option>
            </select>
          )}
        </div>

        {/* Naam zoekwoord chips */}
        {patronModal.naamChips.length > 0 && (
          <div data-onboarding="popup-naam-match" style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              Match op naam (optioneel): <InfoTooltip volledigeBreedte tekst="Selecteer één of meer woorden uit de naam van de tegenpartij om de matchregel specifieker te maken. Zo matcht 'Lidl' alle filialen in plaats van alleen dit specifieke filiaal. Zonder selectie wordt de volledige naam als criterium gebruikt." />
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {patronModal.naamChips.map((chip, index) => {
                const actief = patronModal.gekozenNaamChips.includes(chip.waarde);
                return (
                  <button
                    key={`${chip.waarde}-${index}`}
                    onClick={() => setPatronModal(m => m ? { ...m, gekozenNaamChips: actief ? m.gekozenNaamChips.filter(w => w !== chip.waarde) : [...m.gekozenNaamChips, chip.waarde] } : m)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                      background: actief ? 'var(--accent-dim)' : 'var(--bg-surface)',
                      color: actief ? 'var(--accent)' : 'var(--text)',
                      fontWeight: actief ? 600 : 400,
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Omschrijving zoekwoord chips */}
        <div data-onboarding="popup-omschrijving-match" style={{ marginBottom: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            Match op omschrijving (optioneel): <InfoTooltip volledigeBreedte tekst="Selecteer een woord uit de omschrijving als extra matchcriterium. Handig wanneer één tegenpartij meerdere soorten transacties heeft. Klik 'Analyseer' om te zien hoe vaak elk woord voorkomt in eerdere transacties van deze tegenpartij." />
            <button
              disabled={tellerLaden}
              onClick={async () => {
                if (woordTellers) { setWoordTellers(null); return; }
                setTellerLaden(true);
                const result = await onAnalyseer();
                setWoordTellers(result);
                setTellerLaden(false);
              }}
              style={{
                marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)',
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                padding: '1px 8px', cursor: tellerLaden ? 'not-allowed' : 'pointer',
                opacity: tellerLaden ? 0.5 : 1,
              }}
            >
              {tellerLaden ? 'Laden…' : woordTellers ? 'Verberg' : 'Analyseer'}
            </button>
          </p>
          {patronModal.chips.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {patronModal.chips.map((chip, index) => {
                const actief = patronModal.gekozenWoorden.includes(chip.waarde);
                return (
                  <button
                    key={`${chip.waarde}-${index}`}
                    onClick={() => setPatronModal(m => m ? { ...m, gekozenWoorden: actief ? m.gekozenWoorden.filter(w => w !== chip.waarde) : [...m.gekozenWoorden, chip.waarde] } : m)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                      background: actief ? 'var(--accent-dim)' : 'var(--bg-surface)',
                      color: actief ? 'var(--accent)' : 'var(--text)',
                      fontWeight: actief ? 600 : 400,
                    }}
                  >
                    {chip.label}{woordTellers && woordTellers[chip.waarde] != null ? ` (${woordTellers[chip.waarde]})` : ''}
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 12 }}>Geen terugkerende woorden gevonden in de omschrijvingen.</p>
          )}
        </div>

        {/* Bedrag-bereik (optioneel matchcriterium, standaard ingeklapt) */}
        <div data-onboarding="popup-bedrag-bereik" style={{ marginBottom: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setBedragBereikOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', textAlign: 'left' }}
            >
              <span style={{ display: 'inline-block', transform: bedragBereikOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▸</span>
              Match op bedrag-bereik (optioneel)
              {!bedragBereikOpen && (patronModal.bedragMin !== null || patronModal.bedragMax !== null) && (
                <span style={{ color: 'var(--accent)', fontSize: 11 }}>
                  {patronModal.bedragMin !== null && patronModal.bedragMax !== null && patronModal.bedragMin === patronModal.bedragMax
                    ? `(exact ${patronModal.bedragMin})`
                    : `(${patronModal.bedragMin ?? '−∞'} … ${patronModal.bedragMax ?? '+∞'})`}
                </span>
              )}
            </button>
            <InfoTooltip volledigeBreedte tekst="Beperk de matchregel tot transacties binnen een bedrag-bereik. Vul beide velden met hetzelfde bedrag voor een exacte match. Laat één of beide velden leeg voor een open bereik. Negatieve bedragen voor uitgaven, positief voor ontvangsten." />
          </div>
          {bedragBereikOpen && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    const b = patronModal.transactie.bedrag ?? null;
                    if (b === null) return;
                    setPatronModal(m => m ? { ...m, bedragMin: b, bedragMax: b } : m);
                  }}
                  style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}
                >Exact bedrag overnemen</button>
                {(patronModal.bedragMin !== null || patronModal.bedragMax !== null) && (
                  <button
                    type="button"
                    onClick={() => setPatronModal(m => m ? { ...m, bedragMin: null, bedragMax: null } : m)}
                    style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}
                  >Wis</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Bedrag van</span>
                  <input
                    type="number"
                    step="0.01"
                    value={patronModal.bedragMin ?? ''}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setPatronModal(m => m ? { ...m, bedragMin: v } : m);
                    }}
                    placeholder="geen ondergrens"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Bedrag tot</span>
                  <input
                    type="number"
                    step="0.01"
                    value={patronModal.bedragMax ?? ''}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setPatronModal(m => m ? { ...m, bedragMax: v } : m);
                    }}
                    placeholder="geen bovengrens"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}
                  />
                </label>
              </div>
              {patronModal.bedragMin !== null && patronModal.bedragMax !== null && patronModal.bedragMin > patronModal.bedragMax && (
                <p style={{ margin: '4px 0 0', color: 'var(--red)', fontSize: 11 }}>Ondergrens mag niet groter zijn dan bovengrens.</p>
              )}
            </div>
          )}
        </div>

        {/* Toelichting */}
        <div data-onboarding="popup-toelichting" style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Toelichting (optioneel) <InfoTooltip volledigeBreedte tekst="Voeg een persoonlijke notitie toe aan deze transactie. De toelichting is zichtbaar in de transactielijst maar heeft geen invloed op de matchregel of categorisatie." /></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={patronModal.toelichting}
              onChange={e => setPatronModal(m => m ? { ...m, toelichting: e.target.value } : m)}
              placeholder="Optionele toelichting..."
              style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}
            />
            {patronModal.toelichting && (
              <button
                onClick={() => setPatronModal(m => m ? { ...m, toelichting: '' } : m)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Scope keuze */}
        <div data-onboarding="popup-scope" style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Toepassen op <InfoTooltip volledigeBreedte tekst="Kies of de categorie voor álle transacties van deze tegenpartij geldt (matchregel opslaan), of alleen voor deze ene transactie. Als je de boekdatum hebt aangepast, wordt automatisch 'Alleen deze transactie' geselecteerd. Is deze transactie eerder handmatig gecategoriseerd, dan verschijnt de knop 'Reset naar automatisch' waarmee je de handmatige keuze ongedaan maakt en de automatische categoriseringsregels opnieuw worden toegepast." /></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: heeftDatumWijziging ? 'var(--text-dim)' : 'var(--text)', cursor: heeftDatumWijziging ? 'not-allowed' : 'pointer', opacity: heeftDatumWijziging ? 0.5 : 1 }}>
              <input type="radio" checked={patronModal.scope === 'alle'} disabled={heeftDatumWijziging}
                onChange={() => setPatronModal(m => m ? { ...m, scope: 'alle' } : m)} />
              Alle transacties van {patronModal.transactie.naam_tegenpartij ?? 'deze tegenpartij'}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="radio" checked={patronModal.scope === 'enkel'}
                onChange={() => setPatronModal(m => m ? { ...m, scope: 'enkel' } : m)} />
              Alleen deze transactie
            </label>
          </div>
        </div>

        {/* Subcategorie verwijder-melding */}
        {subVerwijderVraag && (
          <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid var(--accent)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-h)' }}>
              De subcategorie <strong>{subVerwijderVraag.oudeSubcategorie}</strong> wordt hierna niet meer gebruikt. Verwijderen?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => voltooiOpslaan(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Verwijderen</button>
              <button onClick={() => voltooiOpslaan(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Behouden</button>
            </div>
          </div>
        )}

        </div>
        <div data-onboarding="popup-opslaan" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, padding: '12px 24px 20px', borderTop: '1px solid var(--border)' }}>
          {onReset && patronModal.transactie.handmatig_gecategoriseerd === 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto', flexWrap: 'wrap' }}>
            {!resetPreview ? (
              <button
                disabled={resetBezig}
                onClick={async () => {
                  setResetBezig(true);
                  const res = await fetch(`/api/transacties/${patronModal.transactie.id}/reset`);
                  if (res.ok) {
                    const preview: { categorie: string | null; subcategorie: string | null } = await res.json();
                    let subcatOpties: string[] = [];
                    let subcatGearchiveerd: string[] = [];
                    if (preview.categorie) {
                      const sr = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(preview.categorie)}&volledig=1`);
                      const subs: { naam: string; inActieveRegel: boolean }[] = sr.ok ? await sr.json() : [];
                      subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
                      subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);
                      if (preview.subcategorie && !subcatOpties.includes(preview.subcategorie) && !subcatGearchiveerd.includes(preview.subcategorie)) {
                        subcatOpties = [preview.subcategorie, ...subcatOpties];
                      }
                    }
                    setResetPreview(preview);
                    setPatronModal(m => m ? { ...m, nieuweCat: preview.categorie ?? '__geen__', subcategorie: preview.subcategorie ?? '', catNieuw: false, scope: 'alle', subcatOpties, subcatGearchiveerd } : m);
                  }
                  setResetBezig(false);
                }}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: resetBezig ? 'wait' : 'pointer', opacity: resetBezig ? 0.6 : 1 }}
                title="Wis handmatige categorisatie en herstel automatische matching"
              >{resetBezig ? 'Bezig…' : 'Reset naar automatisch'}</button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 6.5 4 9 10.5 2.5"/></svg>
                Hersteld naar automatisch — klik Opslaan om te bevestigen
              </span>
            )}
          </div>
        )}
          <button onClick={onSluiten} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Annuleer</button>
          {!subVerwijderVraag && (() => {
            const bedragOngeldig = patronModal.bedragMin !== null && patronModal.bedragMax !== null && patronModal.bedragMin > patronModal.bedragMax;
            const disabled = !patronModal.nieuweCat || (patronModal.catNieuw && !patronModal.nieuweCat.trim()) || bedragOngeldig;
            return (
              <button
                onClick={handleBevestig}
                disabled={disabled}
                style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: disabled ? 0.5 : 1 }}
              >Opslaan</button>
            );
          })()}
        </div>
      </div>

      {/* Mini popup: tegenrekening toevoegen als eigen rekening */}
      {rekeningFormOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, minWidth: 340, maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-h)', fontSize: 15 }}>Toevoegen als eigen rekening</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>IBAN</div>
              <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>{t.tegenrekening_iban_bban}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Naam</label>
              <input
                autoFocus
                value={rekeningNaam}
                onChange={e => setRekeningNaam(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Type</label>
              <select value={rekeningType} onChange={e => setRekeningType(e.target.value as 'betaal' | 'spaar')}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}>
                <option value="betaal">Betaalrekening</option>
                <option value="spaar">Spaarrekening</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Rekeninggroep (optioneel)</label>
              <select value={rekeningGroepId} onChange={e => setRekeningGroepId(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}>
                <option value="">— Geen groep —</option>
                {rekeningGroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Kleur</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={rekeningKleurWaarde} disabled={rekeningKleurAuto}
                  onChange={e => setRekeningKleurWaarde(e.target.value)}
                  style={{ width: 36, height: 30, padding: 2, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: rekeningKleurAuto ? 'default' : 'pointer', pointerEvents: rekeningKleurAuto ? 'none' : 'auto', opacity: rekeningKleurAuto ? 0.4 : 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rekeningKleurAuto} onChange={e => setRekeningKleurAuto(e.target.checked)} />
                  Automatisch
                </label>
              </div>
            </div>
            {budgettenPotjes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Gekoppelde categorieën (optioneel)</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {budgettenPotjes.map(bp => {
                    const actief = gekozenBudgetIds.includes(bp.id);
                    return (
                      <button
                        key={bp.id}
                        onClick={() => setGekozenBudgetIds(ids => actief ? ids.filter(id => id !== bp.id) : [...ids, bp.id])}
                        style={{
                          padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${actief ? (bp.kleur ?? 'var(--accent)') : 'var(--border)'}`,
                          background: actief ? `color-mix(in srgb, ${bp.kleur ?? 'var(--accent)'} 15%, transparent)` : 'var(--bg-surface)',
                          color: actief ? (bp.kleur ?? 'var(--accent)') : 'var(--text)',
                          fontWeight: actief ? 600 : 400,
                        }}
                      >{bp.naam}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {rekeningFout && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{rekeningFout}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRekeningFormOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Annuleer</button>
              <button
                onClick={handleRekeningToevoegen}
                disabled={rekeningLaden || !rekeningNaam.trim()}
                style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: rekeningNaam.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: rekeningNaam.trim() ? 1 : 0.5 }}
              >{rekeningLaden ? 'Toevoegen…' : 'Toevoegen'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Mini popup: eigen rekening bewerken */}
      {eigenRekFormOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, minWidth: 340, maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-h)', fontSize: 15 }}>Rekening bewerken</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>IBAN</div>
              <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>{eigenRekening?.iban}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Naam</label>
              <input autoFocus value={eigenRekForm.naam} onChange={e => setEigenRekForm(f => ({ ...f, naam: e.target.value }))}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Type</label>
              <select value={eigenRekForm.type} onChange={e => setEigenRekForm(f => ({ ...f, type: e.target.value as 'betaal' | 'spaar' }))}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}>
                <option value="betaal">Betaalrekening</option>
                <option value="spaar">Spaarrekening</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Kleur</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={eigenRekForm.kleur} disabled={eigenRekForm.kleurAuto}
                  onChange={e => setEigenRekForm(f => ({ ...f, kleur: e.target.value }))}
                  style={{ width: 36, height: 30, padding: 2, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: eigenRekForm.kleurAuto ? 'default' : 'pointer', pointerEvents: eigenRekForm.kleurAuto ? 'none' : 'auto', opacity: eigenRekForm.kleurAuto ? 0.4 : 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={eigenRekForm.kleurAuto} onChange={e => setEigenRekForm(f => ({ ...f, kleurAuto: e.target.checked }))} />
                  Automatisch
                </label>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Rekeninggroep (optioneel)</label>
              <select value={eigenRekForm.groepId} onChange={e => setEigenRekForm(f => ({ ...f, groepId: e.target.value === '' ? '' : Number(e.target.value) }))}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-h)' }}>
                <option value="">— Geen groep —</option>
                {rekeningGroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
              </select>
            </div>
            {budgettenPotjes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Gekoppelde categorieën (optioneel)</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {budgettenPotjes.map(bp => {
                    const actief = eigenRekForm.budgetIds.includes(bp.id);
                    return (
                      <button key={bp.id}
                        onClick={() => setEigenRekForm(f => ({ ...f, budgetIds: actief ? f.budgetIds.filter(id => id !== bp.id) : [...f.budgetIds, bp.id] }))}
                        style={{
                          padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${actief ? (bp.kleur ?? 'var(--accent)') : 'var(--border)'}`,
                          background: actief ? `color-mix(in srgb, ${bp.kleur ?? 'var(--accent)'} 15%, transparent)` : 'var(--bg-surface)',
                          color: actief ? (bp.kleur ?? 'var(--accent)') : 'var(--text)',
                          fontWeight: actief ? 600 : 400,
                        }}
                      >{bp.naam}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {eigenRekFout && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{eigenRekFout}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEigenRekFormOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Annuleer</button>
              <button onClick={handleEigenRekeningOpslaan} disabled={eigenRekLaden || !eigenRekForm.naam.trim()}
                style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: eigenRekForm.naam.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: eigenRekForm.naam.trim() ? 1 : 0.5 }}
              >{eigenRekLaden ? 'Opslaan…' : 'Opslaan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
