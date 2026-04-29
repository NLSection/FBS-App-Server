// FILE: CategorieenBeheer.tsx
// AANGEMAAKT: 25-03-2026 17:30
// VERSIE: 1
// GEWIJZIGD: 01-04-2026 23:45
//
// WIJZIGINGEN (03-04-2026 01:00):
// - Subcategorieën tab: matrix van categorieën × subcategorieën met inline bewerking
// WIJZIGINGEN (01-04-2026 23:45):
// - Naam tegenpartij (naam_origineel) bewerkbaar via inline klik-naar-input
// WIJZIGINGEN (01-04-2026 23:30):
// - Scrollbar sync: tab dependency toegevoegd aan ResizeObserver effects
// - Categorie/subcategorie: badge-weergave met dropdown bij klik i.p.v. permanente dropdown
// WIJZIGINGEN (01-04-2026 23:15):
// - maakNaamChips en analyseerOmschrijvingen: minimale woordlengte verwijderd (alle woorden als chip)
// WIJZIGINGEN (01-04-2026 23:00):
// - Categorieregels tab: inline bewerking per cel voor naam_zoekwoord, omschrijving_zoekwoord, toelichting, categorie, subcategorie
// - openRegelPopup niet meer aangeroepen vanuit Categorieregels tab
// WIJZIGINGEN (31-03-2026 14:30):
// - periodes state toegevoegd + fetch /api/periodes
// - handleDatumWijzig en handleVoegRekeningToe geïmplementeerd
// - CategoriePopup: periodes, onDatumWijzig, onVoegRekeningToe props meegegeven
// WIJZIGINGEN (31-03-2026 02:30):
// - onAnalyseer fix: alle omschrijvingsvelden (1+2+3) meenemen in woordfrequentie telling
// WIJZIGINGEN (31-03-2026 02:00):
// - onAnalyseer prop toegevoegd aan CategoriePopup: woordfrequentie analyse per tegenpartij
// WIJZIGINGEN (31-03-2026 01:30):
// - Tab "Aangepast" met 🔒 slotje in tab-knop en bij elke transactierij (naam tegenpartij)
// WIJZIGINGEN (31-03-2026 01:00):
// - Volledig herbouwd met twee tabs: Categorieregels + Aangepast
// - Beide tabs: categorie filterknoppen met tellers, zoekbalk, gesynchroniseerde scrollbar
// - CategoriePopup geïntegreerd voor rij-klik categorisatie
// - Tab Categorieregels: rijen klikbaar via CategoriePopup, verwijderknop behouden
// - Tab Aangepast: transacties met handmatig_gecategoriseerd === 1

'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import type { CategorieType } from '@/lib/categorisatie';
import type { TransactieMetCategorie } from '@/lib/transacties';
import type { Periode } from '@/lib/maandperiodes';
import { TypeLabel } from '@/features/shared/components/TypeLabel';
import InfoTooltip from '@/components/InfoTooltip';
import CategoriePopup from '@/features/shared/components/CategoriePopup';
import type { PatronModalData } from '@/features/shared/components/CategoriePopup';
import { maakNaamChips, analyseerOmschrijvingen } from '@/features/shared/utils/naamChips';
import { formatBedrag, formatDatum } from '@/features/shared/utils/format';

interface CategorieRegel {
  id: number;
  iban: string | null;
  naam_zoekwoord: string | null;
  naam_origineel: string | null;
  omschrijving_zoekwoord: string | null;
  toelichting: string | null;
  categorie: string;
  subcategorie: string | null;
  type: CategorieType;
  laatste_gebruik: string | null;
  bedrag_min: number | null;
  bedrag_max: number | null;
}

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; type?: string; kleur?: string | null; kleur_auto?: number; }

type Tab = 'regels' | 'aangepast';

const filterKnopStijl = (actief: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  border: '1px solid var(--border)',
  background: actief ? 'var(--accent)' : 'var(--bg-card)',
  color: actief ? '#fff' : 'var(--text)',
  fontWeight: actief ? 600 : 400,
});

function kleurBg(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return 'var(--accent-dim)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.15)`;
}


export default function CategorieenBeheer() {
  const [tab, setTab]                           = useState<Tab>('regels');
  const [bronInstellingen, setBronInstellingen] = useState(false);
  const [filterCategorie, setFilterCategorie]   = useState<string | null>(null);
  const [filterSubcategorie, setFilterSubcategorie] = useState<string | null>(null);
  const [subVerwijderMelding, setSubVerwijderMelding] = useState<{ categorie: string; subcategorie: string } | null>(null);
  const [regels, setRegels]                     = useState<CategorieRegel[]>([]);
  const [transacties, setTransacties]           = useState<TransactieMetCategorie[]>([]);
  const [budgettenPotjes, setBudgettenPotjes]   = useState<BudgetPotjeNaam[]>([]);
  const [rekeningen, setRekeningen]             = useState<Rekening[]>([]);
  const [periodes, setPeriodes]                 = useState<Periode[]>([]);
  const [uniekeCatDropdown, setUniekeCatDropdown] = useState<string[]>([]);
  const [reloadTrigger, setReloadTrigger]       = useState(0);
  const [patronModal, setPatronModal]           = useState<PatronModalData | null>(null);

  // Filter state per tab
  const [regelsCatFilter, setRegelsCatFilter]   = useState<string | 'alle'>('alle');
  const [regelsZoek, setRegelsZoek]             = useState('');
  const [aangepastCatFilter, setAangepastCatFilter] = useState<string | 'alle'>('alle');
  const [aangepastZoek, setAangepastZoek]       = useState('');

  // Uitklap-state per regel (voor subtabel met omschrijving/bedrag/toelichting/type)
  const [expandedRegelIds, setExpandedRegelIds] = useState<Set<number>>(new Set());
  function toggleExpand(id: number) {
    setExpandedRegelIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  // Archiveer state (beide tabs)
  const [archiveerMenuOpen, setArchiveerMenuOpen]                   = useState(false);
  const [aangepastArchiveerMenuOpen, setAangepastArchiveerMenuOpen] = useState(false);
  const [autoArchiveerMaanden, setAutoArchiveerMaanden]             = useState<number>(0);
  const [aangepastAutoArchiveerMaanden, setAangepastAutoArchiveerMaanden] = useState<number>(0);
  const [ongebruiktSinds, setOngebruiktSinds]                       = useState<number>(0);
  const [gebruikersProfiel, setGebruikersProfiel]                   = useState<'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null>(null);
  useEffect(() => {
    const laad = () => {
      fetch('/api/instellingen').then(r => r.ok ? r.json() : null).then((d: { regelAutoArchiveerMaanden?: number; aangepastAutoArchiveerMaanden?: number; gebruikersProfiel?: string | null } | null) => {
        if (d) {
          setAutoArchiveerMaanden(d.regelAutoArchiveerMaanden ?? 0);
          setAangepastAutoArchiveerMaanden(d.aangepastAutoArchiveerMaanden ?? 0);
          const p = d.gebruikersProfiel;
          setGebruikersProfiel((p === 'potjesbeheer' || p === 'uitgavenbeheer' || p === 'handmatig') ? p : null);
        }
      }).catch(() => {});
    };
    laad();
    window.addEventListener('instellingen-refresh', laad);
    return () => window.removeEventListener('instellingen-refresh', laad);
  }, []);
  async function saveAutoArchiveer(maanden: number) {
    setAutoArchiveerMaanden(maanden);
    await fetch('/api/instellingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regelAutoArchiveerMaanden: maanden }),
    });
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }
  async function saveAangepastAutoArchiveer(maanden: number) {
    setAangepastAutoArchiveerMaanden(maanden);
    await fetch('/api/instellingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aangepastAutoArchiveerMaanden: maanden }),
    });
    window.dispatchEvent(new CustomEvent('instellingen-refresh'));
  }


  // Sort state per tab
  const [regelsSortCol, setRegelsSortCol]       = useState<string | null>(null);
  const [regelsSortDir, setRegelsSortDir]       = useState<'asc' | 'desc'>('asc');
  const [aangepastSortCol, setAangepastSortCol] = useState<string | null>(null);
  const [aangepastSortDir, setAangepastSortDir] = useState<'asc' | 'desc'>('asc');


  // Inline edit state voor regels tab
  const [editingRegelCell, setEditingRegelCell] = useState<{ id: number; veld: string; waarde: string } | null>(null);

  async function saveRegelVeld(id: number, veld: string, waarde: string, regel: CategorieRegel) {
    const body: Record<string, unknown> = {
      categorie: regel.categorie,
      subcategorie: regel.subcategorie ?? null,
      toelichting: regel.toelichting ?? null,
      naam_origineel: regel.naam_origineel ?? null,
      type: regel.type,
      bedrag_min: regel.bedrag_min,
      bedrag_max: regel.bedrag_max,
      ...(regel.iban ? { iban: regel.iban } : {}),
    };
    if (veld === 'naam_origineel') body.naam_origineel = waarde || null;
    if (veld === 'naam_zoekwoord') body.naam_zoekwoord_raw = waarde || null;
    if (veld === 'omschrijving_zoekwoord') body.omschrijving_raw = waarde || null;
    if (veld === 'toelichting') body.toelichting = waarde || null;
    if (veld === 'iban') body.iban = waarde || null;
    if (veld === 'categorie') body.categorie = waarde;
    if (veld === 'subcategorie') body.subcategorie = waarde || null;
    if (veld === 'type') body.type = waarde;
    if (veld === 'bedrag_min') body.bedrag_min = waarde === '' ? null : Number(waarde);
    if (veld === 'bedrag_max') body.bedrag_max = waarde === '' ? null : Number(waarde);

    setEditingRegelCell(null);
    setRegels(prev => prev.map(r => r.id !== id ? r : {
      ...r,
      naam_origineel: veld === 'naam_origineel' ? (waarde || null) : r.naam_origineel,
      naam_zoekwoord: veld === 'naam_zoekwoord' ? (waarde || null) : r.naam_zoekwoord,
      omschrijving_zoekwoord: veld === 'omschrijving_zoekwoord' ? (waarde || null) : r.omschrijving_zoekwoord,
      toelichting: veld === 'toelichting' ? (waarde || null) : r.toelichting,
      iban: veld === 'iban' ? (waarde || null) : r.iban,
      categorie: veld === 'categorie' ? waarde : r.categorie,
      subcategorie: veld === 'subcategorie' ? (waarde || null) : r.subcategorie,
      type: veld === 'type' ? waarde as CategorieType : r.type,
      bedrag_min: veld === 'bedrag_min' ? (waarde === '' ? null : Number(waarde)) : r.bedrag_min,
      bedrag_max: veld === 'bedrag_max' ? (waarde === '' ? null : Number(waarde)) : r.bedrag_max,
    }));
    await fetch(`/api/categorieen/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    isReloadRef.current = true;
    setReloadTrigger(n => n + 1);
  }

  // Scroll preservation
  const scrollPosRef  = useRef(0);
  const isReloadRef   = useRef(false);

  // Scroll sync refs
  const topScrollRef1     = useRef<HTMLDivElement>(null);
  const tableWrapperRef1  = useRef<HTMLDivElement>(null);
  const syncingRef1       = useRef(false);
  const [containerWidth1, setContainerWidth1] = useState(0);
  const [hasOverflow1, setHasOverflow1] = useState(false);

  const topScrollRef2     = useRef<HTMLDivElement>(null);
  const tableWrapperRef2  = useRef<HTMLDivElement>(null);
  const syncingRef2       = useRef(false);
  const [containerWidth2, setContainerWidth2] = useState(0);
  const [hasOverflow2, setHasOverflow2] = useState(false);

  // Data laden
  // URL parameters lezen (o.a. vanuit instellingen-flow)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get('categorie');
    const sub = sp.get('subcategorie');
    const bron = sp.get('bron');
    if (cat) {
      setFilterCategorie(cat);
      setRegelsCatFilter(cat);
      setAangepastCatFilter(cat);
    }
    if (sub) {
      setFilterSubcategorie(sub);
      setRegelsZoek(sub);
      setAangepastZoek(sub);
    }
    if (bron === 'instellingen') setBronInstellingen(true);
  }, []);

  useEffect(() => {
    if (isReloadRef.current) scrollPosRef.current = window.scrollY;
    const promises: Promise<void>[] = [
      fetch('/api/categorieen').then(r => r.ok ? r.json() : []).then(setRegels),
      fetch('/api/periodes').then(r => r.ok ? r.json() : []).then(setPeriodes),
      fetch('/api/lookup-data').then(r => r.ok ? r.json() : null).then((d: { budgettenPotjes?: unknown[] | null; rekeningen?: unknown[] | null; uniekeCategorieen?: string[] | null } | null) => {
        setBudgettenPotjes((d?.budgettenPotjes ?? []) as Parameters<typeof setBudgettenPotjes>[0]);
        setRekeningen((d?.rekeningen ?? []) as Parameters<typeof setRekeningen>[0]);
        setUniekeCatDropdown(d?.uniekeCategorieen ?? []);
      }),
    ];
    promises.push(
      fetch('/api/transacties?handmatig_gecategoriseerd=1').then(r => r.ok ? r.json() : []).then((rows: TransactieMetCategorie[]) => {
        setTransacties(rows);
      })
    );
    Promise.all(promises).then(() => {
      if (isReloadRef.current) {
        requestAnimationFrame(() => { window.scrollTo(0, scrollPosRef.current); isReloadRef.current = false; });
      }
    });
  }, [reloadTrigger, tab]);

  // Check of subcategorie nog in gebruik is (vanuit instellingen-flow)
  useEffect(() => {
    if (!bronInstellingen || !filterCategorie || !filterSubcategorie) return;
    // Tel regels en aangepaste transacties die deze subcategorie gebruiken
    const regelsInGebruik = regels.filter(r => r.categorie === filterCategorie && r.subcategorie === filterSubcategorie).length;
    const aanpassingenInGebruik = transacties.filter(t => t.categorie === filterCategorie && t.subcategorie === filterSubcategorie).length;
    if (regelsInGebruik === 0 && aanpassingenInGebruik === 0) {
      setSubVerwijderMelding({ categorie: filterCategorie, subcategorie: filterSubcategorie });
    } else {
      setSubVerwijderMelding(null);
    }
  }, [regels, transacties, bronInstellingen, filterCategorie, filterSubcategorie]);

  // Scroll sync observers
  useEffect(() => {
    if (!tableWrapperRef1.current) return;
    const el = tableWrapperRef1.current;
    const obs = new ResizeObserver(() => { setContainerWidth1(el.scrollWidth); setHasOverflow1(el.scrollWidth > el.clientWidth); });
    obs.observe(el);
    return () => obs.disconnect();
  }, [regels, tab]);

  useEffect(() => {
    if (!tableWrapperRef2.current) return;
    const el = tableWrapperRef2.current;
    const obs = new ResizeObserver(() => { setContainerWidth2(el.scrollWidth); setHasOverflow2(el.scrollWidth > el.clientWidth); });
    obs.observe(el);
    return () => obs.disconnect();
  }, [transacties, tab]);

  function syncScroll1(source: 'top' | 'table') {
    if (syncingRef1.current) return;
    syncingRef1.current = true;
    if (source === 'top' && tableWrapperRef1.current && topScrollRef1.current)
      tableWrapperRef1.current.scrollLeft = topScrollRef1.current.scrollLeft;
    else if (source === 'table' && topScrollRef1.current && tableWrapperRef1.current)
      topScrollRef1.current.scrollLeft = tableWrapperRef1.current.scrollLeft;
    requestAnimationFrame(() => { syncingRef1.current = false; });
  }

  function syncScroll2(source: 'top' | 'table') {
    if (syncingRef2.current) return;
    syncingRef2.current = true;
    if (source === 'top' && tableWrapperRef2.current && topScrollRef2.current)
      tableWrapperRef2.current.scrollLeft = topScrollRef2.current.scrollLeft;
    else if (source === 'table' && topScrollRef2.current && tableWrapperRef2.current)
      topScrollRef2.current.scrollLeft = tableWrapperRef2.current.scrollLeft;
    requestAnimationFrame(() => { syncingRef2.current = false; });
  }

  // ── CategoriePopup logica (identiek aan TransactiesTabel) ─────────────

  async function openCategoriePopup(t: TransactieMetCategorie) {
    const naamChips = maakNaamChips(t.naam_tegenpartij ?? null);
    const chips = analyseerOmschrijvingen(t);

    if (t.categorie_id != null || t.categorie) {
      const regelsRes = await fetch('/api/categorieen');
      const allRegels: { id: number; naam_zoekwoord: string | null; omschrijving_zoekwoord: string | null; categorie: string; subcategorie: string | null; bedrag_min: number | null; bedrag_max: number | null }[] = regelsRes.ok ? await regelsRes.json() : [];
      const regel = t.categorie_id != null ? allRegels.find(r => r.id === t.categorie_id) ?? null : null;

      const categorie = t.categorie ?? '';
      const subcategorie = t.subcategorie ?? '';

      const naamZoekwoorden = regel?.naam_zoekwoord ? regel.naam_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenNaamChips = naamChips.filter(c => naamZoekwoorden.includes(c.waarde)).map(c => c.waarde);

      const omschrZoekwoorden = regel?.omschrijving_zoekwoord ? regel.omschrijving_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenWoorden = chips.filter(c => omschrZoekwoorden.includes(c.waarde)).map(c => c.waarde);

      const subcatRes = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(categorie)}&volledig=1`);
      const subs: { naam: string; inActieveRegel: boolean }[] = subcatRes.ok ? await subcatRes.json() : [];
      const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
      const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);

      setPatronModal({ transactie: t, toelichting: t.toelichting ?? '', nieuweCat: categorie, catNieuw: false, nieuweCatRekeningId: '', subcategorie, subcatOpties, subcatGearchiveerd, subcatNieuw: false, naamChips, gekozenNaamChips, chips, gekozenWoorden, scope: t.categorie_id != null ? 'alle' : 'enkel', bedragMin: regel?.bedrag_min ?? null, bedragMax: regel?.bedrag_max ?? null });
    } else {
      setPatronModal({ transactie: t, toelichting: t.toelichting ?? '', nieuweCat: '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [], subcatNieuw: false, naamChips, gekozenNaamChips: [], chips, gekozenWoorden: [], scope: 'alle', bedragMin: null, bedragMax: null });
    }
  }

  async function handleDatumWijzig(datum: string | null) {
    const tr = patronModal!.transactie;
    await fetch(`/api/transacties/${tr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datum_aanpassing: datum }),
    });
  }

  function handleVoegRekeningToe() {
    fetch('/api/rekeningen').then(r => r.ok ? r.json() : []).then(setRekeningen);
  }

  async function maakCategorieregel(
    t: TransactieMetCategorie, categorie: string, subcategorie: string,
    omschrWoord?: string | null, inclusiefIban = true,
    naamZoekWoord?: string | null, naamOrigineel?: string | null,
    toelichting?: string | null,
    bedragMin?: number | null, bedragMax?: number | null,
  ): Promise<number | null> {
    const body: Record<string, unknown> = {
      categorie, subcategorie: subcategorie || null,
      type: t.type,
      naam_origineel: naamOrigineel !== undefined ? naamOrigineel : (t.naam_tegenpartij ?? null),
      naam_zoekwoord_raw: naamZoekWoord ?? null,
      toelichting: toelichting ?? null,
      bedrag_min: bedragMin ?? null,
      bedrag_max: bedragMax ?? null,
    };
    if (inclusiefIban && t.tegenrekening_iban_bban) body.iban = t.tegenrekening_iban_bban;
    if (omschrWoord) body.omschrijving_raw = omschrWoord;
    const res = await fetch('/api/categorieen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const { id } = await res.json();
    return id as number;
  }

  async function triggerHermatch(toelichting?: string | null, categorieId?: number | null) {
    const extra = categorieId != null ? { toelichting: toelichting || null, categorie_id: categorieId } : {};
    await fetch('/api/categoriseer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra),
    });
  }

  async function vindMatchendeRegelId(
    t: TransactieMetCategorie, naamZoekwoord: string | null, omschrZoekwoord: string | null
  ): Promise<number | null> {
    const res = await fetch('/api/categorieen');
    if (!res.ok) return null;
    const allRegels: { id: number; naam_zoekwoord: string | null; iban: string | null; omschrijving_zoekwoord: string | null }[] = await res.json();
    const match = allRegels.find(r =>
      r.iban === (t.tegenrekening_iban_bban ?? null) &&
      r.naam_zoekwoord === naamZoekwoord &&
      r.omschrijving_zoekwoord === omschrZoekwoord
    );
    return match?.id ?? null;
  }

  async function handlePatronModalBevestig() {
    if (!patronModal) return;
    const { transactie: t, toelichting, nieuweCat, catNieuw, nieuweCatRekeningId, subcategorie, gekozenWoorden, gekozenNaamChips, scope, bedragMin, bedragMax } = patronModal;
    const gekozenNaamChip  = gekozenNaamChips.join(' ');
    const gekozenWoord     = gekozenWoorden.join(' ');
    const gekozenNaamLabel = patronModal.naamChips
      .filter(c => gekozenNaamChips.includes(c.waarde))
      .map(c => c.label)
      .join(' ') || t.naam_tegenpartij || null;
    const subcatWaarde = subcategorie === '__geen__' ? '' : subcategorie;
    setPatronModal(null);

    // Optimistic update: pas transactie direct aan in de lijst
    setTransacties(prev => prev.map(tr => {
      if (tr.id !== t.id) return tr;
      if (nieuweCat === '__geen__') return { ...tr, status: 'nieuw' as const, categorie: null, subcategorie: null, handmatig_gecategoriseerd: 0 };
      if (!nieuweCat) return tr;
      return { ...tr, status: 'verwerkt' as const, categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, handmatig_gecategoriseerd: scope === 'enkel' ? 1 : 0 };
    }));

    if (nieuweCat === '__geen__') {
      if (scope === 'alle') {
        const regelId = await vindMatchendeRegelId(t, gekozenNaamChip || null, gekozenWoord || null);
        if (regelId !== null) await fetch(`/api/categorieen/${regelId}`, { method: 'DELETE' });
        isReloadRef.current = true;
        setReloadTrigger(n => n + 1);
        triggerHermatch().then(() => { isReloadRef.current = true; setReloadTrigger(n => n + 1); });
      } else {
        await fetch(`/api/transacties/${t.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categorie_id: null, status: 'nieuw', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }),
        });
        isReloadRef.current = true;
        setReloadTrigger(n => n + 1);
      }
      return;
    }
    if (!nieuweCat) { isReloadRef.current = true; setReloadTrigger(n => n + 1); return; }

    if (scope === 'enkel') {
      if (catNieuw) {
        await fetch('/api/budgetten-potjes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }),
        });
      }
      await fetch(`/api/transacties/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, status: 'verwerkt', handmatig_gecategoriseerd: 1, toelichting: toelichting || null }),
      });
      isReloadRef.current = true;
      setReloadTrigger(n => n + 1);
      return;
    }

    let finalRegelId: number | null = null;
    if (catNieuw) {
      await fetch('/api/budgetten-potjes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }),
      });
      const regelId = await vindMatchendeRegelId(t, gekozenNaamChip || null, gekozenWoord || null);
      if (regelId !== null) {
        await fetch(`/api/categorieen/${regelId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null,
            toelichting: toelichting || null, naam_origineel: gekozenNaamLabel,
            naam_zoekwoord_raw: gekozenNaamChip || null, type: t.type,
            bedrag_min: bedragMin, bedrag_max: bedragMax,
            ...(t.tegenrekening_iban_bban ? { iban: t.tegenrekening_iban_bban } : {}),
          }),
        });
        finalRegelId = regelId;
      } else {
        finalRegelId = await maakCategorieregel(t, nieuweCat.trim(), subcatWaarde, gekozenWoord || null, true, gekozenNaamChip || null, gekozenNaamLabel, toelichting || null, bedragMin, bedragMax);
      }
    } else {
      finalRegelId = await maakCategorieregel(t, nieuweCat, subcatWaarde, gekozenWoord || null, true, gekozenNaamChip || null, gekozenNaamLabel, toelichting || null, bedragMin, bedragMax);
    }
    isReloadRef.current = true;
    setReloadTrigger(n => n + 1);
    triggerHermatch(toelichting || null, finalRegelId).then(() => { isReloadRef.current = true; setReloadTrigger(n => n + 1); });
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/categorieen/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Onbekende fout' }));
      alert(error);
      return;
    }
    setRegels(prev => prev.filter(r => r.id !== id));
  }

  // ── Tab 1: Categorieregels filtering ──────────────────────────────────

  const regelsUniekeCats = Array.from(new Set(regels.map(r => r.categorie)));
  const regelsCatTellers: Record<string, number> = {};
  for (const r of regels) regelsCatTellers[r.categorie] = (regelsCatTellers[r.categorie] ?? 0) + 1;

  const gefilterdeRegels = (
    regelsCatFilter === 'alle' ? regels : regels.filter(r => r.categorie === regelsCatFilter)
  )
    .filter(r => {
      if (ongebruiktSinds > 0) {
        if (!r.laatste_gebruik) return true;
        const grens = new Date();
        grens.setMonth(grens.getMonth() - ongebruiktSinds);
        if (new Date(r.laatste_gebruik) >= grens) return false;
      }
      if (!regelsZoek) return true;
      const q = regelsZoek.toLowerCase();
      return (
        r.iban?.toLowerCase().includes(q) ||
        r.naam_origineel?.toLowerCase().includes(q) ||
        r.naam_zoekwoord?.toLowerCase().includes(q) ||
        r.omschrijving_zoekwoord?.toLowerCase().includes(q) ||
        r.toelichting?.toLowerCase().includes(q) ||
        r.categorie.toLowerCase().includes(q) ||
        r.subcategorie?.toLowerCase().includes(q)
      );
    });

  function toggleRegelsSort(col: string) {
    if (regelsSortCol === col) setRegelsSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRegelsSortCol(col); setRegelsSortDir('asc'); }
  }

  const gesorteerdeRegels = regelsSortCol
    ? [...gefilterdeRegels].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[regelsSortCol!] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[regelsSortCol!] ?? '');
        const cmp = av.localeCompare(bv, 'nl');
        return regelsSortDir === 'asc' ? cmp : -cmp;
      })
    : gefilterdeRegels;

  // ── Tab 2: Aangepast filtering ────────────────────────────────────────

  const aangepastUniekeCats = Array.from(new Set(transacties.map(t => t.categorie).filter((c): c is string => c !== null)));
  const aangepastCatTellers: Record<string, number> = {};
  for (const t of transacties) if (t.categorie) aangepastCatTellers[t.categorie] = (aangepastCatTellers[t.categorie] ?? 0) + 1;

  const gefilterdeTransacties = (
    aangepastCatFilter === 'alle' ? transacties : transacties.filter(t => t.categorie === aangepastCatFilter)
  ).filter(t => {
    if (!aangepastZoek) return true;
    const q = aangepastZoek.toLowerCase();
    return (
      t.naam_tegenpartij?.toLowerCase().includes(q) ||
      t.omschrijving_1?.toLowerCase().includes(q) ||
      t.tegenrekening_iban_bban?.toLowerCase().includes(q) ||
      t.toelichting?.toLowerCase().includes(q) ||
      t.categorie?.toLowerCase().includes(q) ||
      t.subcategorie?.toLowerCase().includes(q)
    );
  });

  function toggleAangepastSort(col: string) {
    if (aangepastSortCol === col) setAangepastSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setAangepastSortCol(col); setAangepastSortDir('asc'); }
  }

  const gesorteerdeTransacties = aangepastSortCol
    ? [...gefilterdeTransacties].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[aangepastSortCol!] ?? '';
        const bv = (b as unknown as Record<string, unknown>)[aangepastSortCol!] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv), 'nl');
        return aangepastSortDir === 'asc' ? cmp : -cmp;
      })
    : gefilterdeTransacties;

  const actieveAangepast = gesorteerdeTransacties.filter(t => (t.gearchiveerd_aangepast ?? 0) !== 1);
  const gearchiveerdeAangepast = gesorteerdeTransacties.filter(t => (t.gearchiveerd_aangepast ?? 0) === 1);
  const [gearchiveerdeAangepastOpen, setGearchiveerdeAangepastOpen] = useState(false);

  async function toggleArchiveerAangepast(id: number, gearchiveerd: boolean) {
    setTransacties(prev => prev.map(t => t.id !== id ? t : { ...t, gearchiveerd_aangepast: gearchiveerd ? 1 : 0 }));
    await fetch(`/api/transacties/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gearchiveerd }),
    });
    isReloadRef.current = true;
    setReloadTrigger(n => n + 1);
  }

  async function verwijderAangepast(id: number) {
    // Reset aanpassing → transactie verdwijnt uit Aangepast tab (hermatch pakt 'm
    // op via auto-categorisatie regels, of status wordt 'nieuw' als er geen match is).
    if (!confirm('Verwijder deze aangepaste categorisatie? De transactie keert terug naar automatische categorisatie.')) return;
    setTransacties(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/transacties/${id}/reset`, { method: 'POST' });
    isReloadRef.current = true;
    setReloadTrigger(n => n + 1);
  }

  // ── Render helpers ────────────────────────────────────────────────────

  // Unieke subcategorieën per categorie voor dropdowns
  const [subcatsPerCat, setSubcatsPerCat] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch('/api/subcategorieen?volledig=1').then(r => r.ok ? r.json() : []).then((subs: { categorie: string; naam: string }[]) => {
      const map: Record<string, string[]> = {};
      for (const s of subs) {
        if (!map[s.categorie]) map[s.categorie] = [];
        map[s.categorie].push(s.naam);
      }
      setSubcatsPerCat(map);
    });
  }, [reloadTrigger]);

  const REGELS_KOLOMMEN = [
    { id: 'categorie', label: 'Categorie' },
    { id: 'subcategorie', label: 'Subcategorie' },
    { id: 'iban', label: 'IBAN' },
    { id: 'type', label: 'Type' },
    { id: 'naam_origineel', label: 'Naam tegenpartij' },
    { id: 'naam_zoekwoord', label: 'Naam zoekwoord' },
    { id: 'omschrijving_zoekwoord', label: 'Omschrijving zoekwoord' },
    { id: 'laatste_gebruik', label: 'Laatst gematched' },
  ];

  const AANGEPAST_KOLOMMEN = [
    { id: 'datum', label: 'Datum' },
    { id: 'iban_bban', label: 'IBAN eigen' },
    { id: 'tegenrekening_iban_bban', label: 'IBAN tegenrekening' },
    { id: 'naam_tegenpartij', label: 'Naam tegenpartij' },
    { id: 'bedrag', label: 'Bedrag' },
    { id: 'type', label: 'Type' },
    { id: 'categorie', label: 'Categorie' },
    { id: 'subcategorie', label: 'Subcategorie' },
    { id: 'toelichting', label: 'Toelichting' },
    { id: 'omschrijving_1', label: 'Omschrijving' },
  ];

  function renderCatFilterKnoppen(
    items: { categorie: string | null }[],
    uniekeCats: string[],
    catTellers: Record<string, number>,
    actieveFilter: string | 'alle',
    setFilter: (v: string | 'alle') => void,
  ) {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('alle')} style={filterKnopStijl(actieveFilter === 'alle')}>
          Alle categorieën ({items.length})
        </button>
        {[...uniekeCats].sort((a, b) => a.localeCompare(b, 'nl')).map(cat => {
          const kleur = budgettenPotjes.find(bp => bp.naam === cat)?.kleur ?? undefined;
          const actief = actieveFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                ...filterKnopStijl(actief),
                background: actief ? (kleur ?? 'var(--accent)') : 'var(--bg-card)',
                borderColor: kleur ?? 'var(--border)',
                color: actief ? '#fff' : (kleur ?? 'var(--text)'),
              }}
            >
              {cat} ({catTellers[cat] ?? 0})
            </button>
          );
        })}
      </div>
    );
  }

  function renderSortHeader(kolommen: { id: string; label: string }[], sortCol: string | null, sortDir: 'asc' | 'desc', toggleSort: (col: string) => void, extraTh?: boolean) {
    return (
      <tr>
        {kolommen.map(k => (
          <th
            key={k.id}
            onClick={() => toggleSort(k.id)}
            style={{ whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
              ...(k.id === 'bedrag' ? { textAlign: 'right' } : {}),
            }}
          >
            {k.label}
            <span style={{ marginLeft: 4, opacity: sortCol === k.id ? 1 : 0.3 }}>
              {sortCol === k.id && sortDir === 'desc' ? '↓' : '↑'}
            </span>
          </th>
        ))}
        {extraTh && <th style={{ width: 80 }}></th>}
      </tr>
    );
  }

  // ── Tabs ──────────────────────────────────────────────────────────────

  const tabStijl = (actief: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 16px', fontSize: 14, cursor: 'pointer',
    background: actief ? 'var(--bg-card)' : 'transparent',
    color: actief ? 'var(--accent)' : 'var(--text-muted)',
    fontWeight: actief ? 600 : 400, border: 'none',
    borderBottom: actief ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: -2,
  });

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {/* Subcategorie verwijder-melding (vanuit instellingen-flow) */}
      {subVerwijderMelding && (
        <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-h)' }}>
            De subcategorie <strong>{subVerwijderMelding.subcategorie}</strong> in <strong>{subVerwijderMelding.categorie}</strong> wordt niet meer gebruikt. Wil je deze verwijderen?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => {
              const subs = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(subVerwijderMelding.categorie)}&volledig=1`).then(r => r.ok ? r.json() : []);
              const sub = subs.find((s: { naam: string }) => s.naam === subVerwijderMelding.subcategorie);
              if (sub) await fetch(`/api/subcategorieen/${sub.id}`, { method: 'DELETE' });
              setSubVerwijderMelding(null);
              window.location.href = '/instellingen';
            }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Verwijderen
            </button>
            <button onClick={() => { setSubVerwijderMelding(null); setBronInstellingen(false); }}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Behouden
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        <button onClick={() => setTab('regels')} style={tabStijl(tab === 'regels')}>
          Categorieregels ({regels.length})
        </button>
        <button onClick={() => setTab('aangepast')} style={tabStijl(tab === 'aangepast')}>
          🔒 Aangepast ({transacties.filter(t => !t.gearchiveerd_aangepast).length})
        </button>
      </div>

      {/* Tab 1: Categorieregels */}
      {tab === 'regels' && (
        <>
          {renderCatFilterKnoppen(regels, regelsUniekeCats, regelsCatTellers, regelsCatFilter, setRegelsCatFilter)}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Zoek…"
                value={regelsZoek}
                onChange={e => setRegelsZoek(e.target.value)}
                style={{
                  width: '100%', height: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '6px 32px 6px 10px', fontSize: 13,
                  color: 'var(--text-h)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {regelsZoek && (
                <button onClick={() => setRegelsZoek('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setArchiveerMenuOpen(o => !o)} title="Opruim-instellingen"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', height: '100%' }}>
                <Settings size={14} />
              </button>
              {archiveerMenuOpen && (
                <>
                  <div onClick={() => setArchiveerMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 1000, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minWidth: 300, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Categorieregels opruimen</p>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Automatisch verwijderen na</label>
                    <select value={autoArchiveerMaanden} onChange={e => saveAutoArchiveer(Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)', marginBottom: 12 }}>
                      <option value={0}>Nooit opruimen</option>
                      <option value={6}>6 maanden ongebruikt</option>
                      <option value={12}>12 maanden ongebruikt</option>
                      <option value={18}>18 maanden ongebruikt</option>
                      <option value={24}>24 maanden ongebruikt</option>
                      <option value={36}>36 maanden ongebruikt</option>
                    </select>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Toon ongebruikt sinds (filter)</label>
                    <select value={ongebruiktSinds} onChange={e => setOngebruiktSinds(Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }}>
                      <option value={0}>Geen filter</option>
                      <option value={3}>3+ maanden</option>
                      <option value={6}>6+ maanden</option>
                      <option value={12}>12+ maanden</option>
                      <option value={24}>24+ maanden</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {gesorteerdeRegels.length === 0 ? (
            <p className="empty">Geen categorieregels gevonden.</p>
          ) : (
            <>
              {hasOverflow1 && (
                <div
                  ref={topScrollRef1}
                  onScroll={() => syncScroll1('top')}
                  style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, scrollbarColor: 'var(--border) var(--bg-base)', scrollbarWidth: 'thin' }}
                >
                  <div style={{ minWidth: containerWidth1 + 10, height: 1 }} />
                </div>
              )}
              <div ref={tableWrapperRef1} className="table-wrapper" onScroll={() => syncScroll1('table')}>
                <table className="compact" style={{ width: '100%' }}>
                  <thead>
                    {renderSortHeader(REGELS_KOLOMMEN, regelsSortCol, regelsSortDir, toggleRegelsSort, true)}
                  </thead>
                  <tbody>
                    {gesorteerdeRegels.map((r, regelIdx) => {
                      const catKleur = budgettenPotjes.find(bp => bp.naam === r.categorie)?.kleur ?? 'var(--accent)';
                      const isEditing = (veld: string) => editingRegelCell?.id === r.id && editingRegelCell?.veld === veld;
                      const inputStijl: React.CSSProperties = { width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: 4, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)', outline: 'none' };
                      const selectStijl: React.CSSProperties = { width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)', outline: 'none', cursor: 'pointer' };
                      return (
                        <Fragment key={r.id}>
                        <tr {...(regelIdx === 0 ? { 'data-onboarding': 'categorie-eerste-regel' } : {})}>
                          {/* Categorie — badge → dropdown/input bij klik */}
                          <td style={{ cursor: 'pointer' }} onClick={() => !isEditing('categorie') && !isEditing('categorie_nieuw') && setEditingRegelCell({ id: r.id, veld: 'categorie', waarde: r.categorie })}>
                            {isEditing('categorie') ? (
                              <select autoFocus style={selectStijl} value={editingRegelCell!.waarde}
                                onChange={e => {
                                  if (e.target.value === '__nieuw__') { setEditingRegelCell({ id: r.id, veld: 'categorie_nieuw', waarde: '' }); return; }
                                  saveRegelVeld(r.id, 'categorie', e.target.value, r);
                                }}
                                onBlur={() => setEditingRegelCell(null)}>
                                {[...regelsUniekeCats].sort((a, b) => a.localeCompare(b, 'nl')).map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="__nieuw__">+ Nieuw…</option>
                              </select>
                            ) : isEditing('categorie_nieuw') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde} placeholder="Nieuwe categorie…"
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => { if (editingRegelCell!.waarde.trim()) saveRegelVeld(r.id, 'categorie', editingRegelCell!.waarde.trim(), r); else setEditingRegelCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (
                              <span className="badge" style={{ background: kleurBg(catKleur), border: `1px solid ${catKleur}`, color: catKleur }}>{r.categorie}</span>
                            )}
                          </td>
                          {/* Subcategorie — badge → dropdown/input bij klik */}
                          <td style={{ cursor: 'pointer' }} onClick={() => !isEditing('subcategorie') && !isEditing('subcategorie_nieuw') && setEditingRegelCell({ id: r.id, veld: 'subcategorie', waarde: r.subcategorie ?? '' })}>
                            {isEditing('subcategorie') ? (
                              <select autoFocus style={selectStijl} value={editingRegelCell!.waarde}
                                onChange={e => {
                                  if (e.target.value === '__nieuw__') { setEditingRegelCell({ id: r.id, veld: 'subcategorie_nieuw', waarde: '' }); return; }
                                  saveRegelVeld(r.id, 'subcategorie', e.target.value, r);
                                }}
                                onBlur={() => setEditingRegelCell(null)}>
                                <option value="">—</option>
                                {(subcatsPerCat[r.categorie] ?? []).sort((a, b) => a.localeCompare(b, 'nl')).map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                                ))}
                                <option value="__nieuw__">+ Nieuw…</option>
                              </select>
                            ) : isEditing('subcategorie_nieuw') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde} placeholder="Nieuwe subcategorie…"
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => { if (editingRegelCell!.waarde.trim()) saveRegelVeld(r.id, 'subcategorie', editingRegelCell!.waarde.trim(), r); else setEditingRegelCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (
                              r.subcategorie
                                ? <span className="badge-outline" style={{ borderColor: catKleur, color: catKleur }}>{r.subcategorie}</span>
                                : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          {/* IBAN — editable */}
                          <td style={{ fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => !isEditing('iban') && setEditingRegelCell({ id: r.id, veld: 'iban', waarde: r.iban ?? '' })}>
                            {isEditing('iban') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde}
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => saveRegelVeld(r.id, 'iban', editingRegelCell!.waarde, r)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (r.iban || <em style={{ color: 'var(--text-dim)' }}>—</em>)}
                          </td>
                          {/* Type — editable select */}
                          <td style={{ fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => !isEditing('type') && setEditingRegelCell({ id: r.id, veld: 'type', waarde: r.type })}>
                            {isEditing('type') ? (
                              <select autoFocus style={selectStijl} value={editingRegelCell!.waarde}
                                onChange={e => saveRegelVeld(r.id, 'type', e.target.value, r)}
                                onBlur={() => setEditingRegelCell(null)}>
                                <option value="alle">Alle</option>
                                <option value="normaal-af">Normaal af</option>
                                <option value="normaal-bij">Normaal bij</option>
                                <option value="omboeking-af">Omboeking af</option>
                                <option value="omboeking-bij">Omboeking bij</option>
                              </select>
                            ) : (
                              <TypeLabel type={r.type} variant="badge" />
                            )}
                          </td>
                          {/* Naam origineel — editable */}
                          <td style={{ color: 'var(--text-h)', fontWeight: 500, fontSize: 12, width: 160, minWidth: 160, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={r.naam_origineel ?? undefined} onClick={() => !isEditing('naam_origineel') && setEditingRegelCell({ id: r.id, veld: 'naam_origineel', waarde: r.naam_origineel ?? '' })}>
                            {isEditing('naam_origineel') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde}
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => saveRegelVeld(r.id, 'naam_origineel', editingRegelCell!.waarde, r)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (r.naam_origineel || <em style={{ color: 'var(--text-dim)' }}>—</em>)}
                          </td>
                          {/* Naam zoekwoord — editable */}
                          <td style={{ fontSize: 11, fontFamily: 'monospace', width: 160, minWidth: 160, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={r.naam_zoekwoord ?? undefined} onClick={() => !isEditing('naam_zoekwoord') && setEditingRegelCell({ id: r.id, veld: 'naam_zoekwoord', waarde: r.naam_zoekwoord ?? '' })}>
                            {isEditing('naam_zoekwoord') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde}
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => saveRegelVeld(r.id, 'naam_zoekwoord', editingRegelCell!.waarde, r)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (r.naam_zoekwoord || <em style={{ color: 'var(--text-dim)' }}>—</em>)}
                          </td>
                          {/* Omschrijving zoekwoord — editable */}
                          <td style={{ fontSize: 11, fontFamily: 'monospace', width: 160, minWidth: 160, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={r.omschrijving_zoekwoord ?? undefined} onClick={() => !isEditing('omschrijving_zoekwoord') && setEditingRegelCell({ id: r.id, veld: 'omschrijving_zoekwoord', waarde: r.omschrijving_zoekwoord ?? '' })}>
                            {isEditing('omschrijving_zoekwoord') ? (
                              <input autoFocus style={inputStijl} value={editingRegelCell!.waarde}
                                onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                onBlur={() => saveRegelVeld(r.id, 'omschrijving_zoekwoord', editingRegelCell!.waarde, r)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                              />
                            ) : (r.omschrijving_zoekwoord || <em style={{ color: 'var(--text-dim)' }}>—</em>)}
                          </td>
                          {/* Laatst gematched */}
                          <td style={{ fontSize: 11, color: r.laatste_gebruik ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            {r.laatste_gebruik ? new Date(r.laatste_gebruik).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : <em>nooit</em>}
                          </td>
                          {/* Acties */}
                          <td>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button onClick={() => toggleExpand(r.id)} title={expandedRegelIds.has(r.id) ? 'Verberg details' : 'Toon details'}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-h)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                <span style={{ display: 'flex', transform: expandedRegelIds.has(r.id) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                </span>
                                Details
                              </button>
                              <button onClick={() => handleDelete(r.id)} title="Verwijder"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedRegelIds.has(r.id) && (
                          <tr>
                            <td colSpan={REGELS_KOLOMMEN.length + 1} style={{ padding: '12px 20px', background: 'var(--bg-base)', borderTop: '1px solid var(--border)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                                {/* Bedrag van */}
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Bedrag van</div>
                                  {isEditing('bedrag_min') ? (
                                    <input autoFocus type="number" step="0.01" style={inputStijl} value={editingRegelCell!.waarde}
                                      onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                      onBlur={() => saveRegelVeld(r.id, 'bedrag_min', editingRegelCell!.waarde, r)}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                                    />
                                  ) : (
                                    <div onClick={() => setEditingRegelCell({ id: r.id, veld: 'bedrag_min', waarde: r.bedrag_min !== null ? String(r.bedrag_min) : '' })}
                                      style={{ fontSize: 12, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, border: '1px dashed transparent', minHeight: 22, fontVariantNumeric: 'tabular-nums' }}
                                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                                      {r.bedrag_min !== null ? formatBedrag(r.bedrag_min) : <em style={{ color: 'var(--text-dim)' }}>—</em>}
                                    </div>
                                  )}
                                </div>
                                {/* Bedrag tot */}
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Bedrag tot</div>
                                  {isEditing('bedrag_max') ? (
                                    <input autoFocus type="number" step="0.01" style={inputStijl} value={editingRegelCell!.waarde}
                                      onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                      onBlur={() => saveRegelVeld(r.id, 'bedrag_max', editingRegelCell!.waarde, r)}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                                    />
                                  ) : (
                                    <div onClick={() => setEditingRegelCell({ id: r.id, veld: 'bedrag_max', waarde: r.bedrag_max !== null ? String(r.bedrag_max) : '' })}
                                      style={{ fontSize: 12, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, border: '1px dashed transparent', minHeight: 22, fontVariantNumeric: 'tabular-nums' }}
                                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                                      {r.bedrag_max !== null ? formatBedrag(r.bedrag_max) : <em style={{ color: 'var(--text-dim)' }}>—</em>}
                                    </div>
                                  )}
                                </div>
                                {/* Toelichting */}
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Toelichting</div>
                                  {isEditing('toelichting') ? (
                                    <input autoFocus style={inputStijl} value={editingRegelCell!.waarde}
                                      onChange={e => setEditingRegelCell({ ...editingRegelCell!, waarde: e.target.value })}
                                      onBlur={() => saveRegelVeld(r.id, 'toelichting', editingRegelCell!.waarde, r)}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingRegelCell(null); }}
                                    />
                                  ) : (
                                    <div onClick={() => setEditingRegelCell({ id: r.id, veld: 'toelichting', waarde: r.toelichting ?? '' })}
                                      style={{ fontSize: 12, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, border: '1px dashed transparent', minHeight: 22 }}
                                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                                      {r.toelichting || <em style={{ color: 'var(--text-dim)' }}>—</em>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Tab 2: Aangepast */}
      {tab === 'aangepast' && (
        <>
          {renderCatFilterKnoppen(transacties, aangepastUniekeCats, aangepastCatTellers, aangepastCatFilter, setAangepastCatFilter)}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Zoek…"
                value={aangepastZoek}
                onChange={e => setAangepastZoek(e.target.value)}
                style={{ width: '100%', height: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 32px 6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none', boxSizing: 'border-box' }}
              />
              {aangepastZoek && (
                <button onClick={() => setAangepastZoek('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setAangepastArchiveerMenuOpen(o => !o)} title="Archiveer-instellingen"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', height: '100%' }}>
                <Settings size={14} />
              </button>
              {aangepastArchiveerMenuOpen && (
                <>
                  <div onClick={() => setAangepastArchiveerMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 1000, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minWidth: 300, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Aangepaste categorisaties opruimen</p>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Automatisch archiveren ouder dan</label>
                    <select value={aangepastAutoArchiveerMaanden} onChange={e => saveAangepastAutoArchiveer(Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }}>
                      <option value={0}>Nooit opruimen</option>
                      <option value={6}>6 maanden</option>
                      <option value={12}>12 maanden</option>
                      <option value={18}>18 maanden</option>
                      <option value={24}>24 maanden</option>
                      <option value={36}>36 maanden</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {gesorteerdeTransacties.length === 0 ? (
            <p className="empty">Geen handmatig gecategoriseerde transacties gevonden.</p>
          ) : (
            <>
              {hasOverflow2 && (
                <div
                  ref={topScrollRef2}
                  onScroll={() => syncScroll2('top')}
                  style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, scrollbarColor: 'var(--border) var(--bg-base)', scrollbarWidth: 'thin' }}
                >
                  <div style={{ minWidth: containerWidth2 + 10, height: 1 }} />
                </div>
              )}
              <div ref={tableWrapperRef2} className="table-wrapper" onScroll={() => syncScroll2('table')}>
                <table style={{ width: '100%' }}>
                  <thead>
                    {renderSortHeader(AANGEPAST_KOLOMMEN, aangepastSortCol, aangepastSortDir, toggleAangepastSort, true)}
                  </thead>
                  <tbody>
                    {actieveAangepast.map(t => {
                      const catKleur = budgettenPotjes.find(bp => bp.naam === t.categorie)?.kleur ?? 'var(--accent)';
                      return (
                        <tr key={t.id} onClick={() => openCategoriePopup(t)} style={{ cursor: 'pointer' }}>
                          <td style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDatum(t.datum)}</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t.iban_bban ?? '—'}</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t.tegenrekening_iban_bban ?? '—'}</td>
                          <td style={{ color: 'var(--text-h)', fontWeight: 500, fontSize: 12, width: 160, minWidth: 160, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: 'var(--text-dim)', marginRight: 4, fontSize: 11 }}>🔒</span>
                            {t.naam_tegenpartij ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: (t.bedrag ?? 0) < 0 ? 'var(--red)' : 'var(--green)' }}>{formatBedrag(t.bedrag)}</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}><TypeLabel type={t.type} /></td>
                          <td>
                            {t.categorie
                              ? <span className="badge" style={{ background: kleurBg(catKleur), border: `1px solid ${catKleur}`, color: catKleur }}>{t.categorie}</span>
                              : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                          </td>
                          <td>
                            {t.subcategorie
                              ? <span className="badge-outline" style={{ borderColor: catKleur, color: catKleur }}>{t.subcategorie}</span>
                              : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--accent)' }}>{t.toelichting || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 150, maxWidth: 350, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden' }}>{t.omschrijving_1 ?? '—'}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button onClick={() => toggleArchiveerAangepast(t.id, true)} title="Archiveer deze aangepaste categorisatie"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7"/><path d="M10 12h4"/></svg>
                              </button>
                              <button onClick={() => verwijderAangepast(t.id)} title="Verwijder aangepaste categorisatie (terug naar auto-match)"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {gearchiveerdeAangepast.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <p className="section-title" style={{ margin: 0, cursor: 'pointer', userSelect: 'none' }} onClick={() => setGearchiveerdeAangepastOpen(o => !o)}>
                      Gearchiveerd ({gearchiveerdeAangepast.length})
                      <span style={{ fontSize: 9, marginLeft: 6, transition: 'transform 0.15s', display: 'inline-block', transform: gearchiveerdeAangepastOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    </p>
                    <InfoTooltip volledigeBreedte tekst="Gearchiveerde handmatige categorisaties zijn niet meer actief maar blijven bewaard. Terugzetten (dearchiveer) heractiveer ze; verwijderen zet de transactie terug naar automatische categorisatie." />
                  </div>
                  {gearchiveerdeAangepastOpen && (
                    <div className="table-wrapper">
                      <table style={{ width: '100%' }}>
                        <tbody>
                          {gearchiveerdeAangepast.map(t => {
                            const catKleur = budgettenPotjes.find(bp => bp.naam === t.categorie)?.kleur ?? 'var(--accent)';
                            return (
                              <tr key={t.id} onClick={() => openCategoriePopup(t)} style={{ cursor: 'pointer', opacity: 0.6 }}>
                                <td style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDatum(t.datum)}</td>
                                <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t.iban_bban ?? '—'}</td>
                                <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t.tegenrekening_iban_bban ?? '—'}</td>
                                <td style={{ color: 'var(--text-h)', fontWeight: 500, fontSize: 12, width: 160, minWidth: 160, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ color: 'var(--text-dim)', marginRight: 4, fontSize: 11 }}>🔒</span>
                                  {t.naam_tegenpartij ?? '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: (t.bedrag ?? 0) < 0 ? 'var(--red)' : 'var(--green)' }}>{formatBedrag(t.bedrag)}</td>
                                <td style={{ color: 'var(--text-dim)', fontSize: 12 }}><TypeLabel type={t.type} /></td>
                                <td>
                                  {t.categorie
                                    ? <span className="badge" style={{ background: kleurBg(catKleur), border: `1px solid ${catKleur}`, color: catKleur }}>{t.categorie}</span>
                                    : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                                </td>
                                <td>
                                  {t.subcategorie
                                    ? <span className="badge-outline" style={{ borderColor: catKleur, color: catKleur }}>{t.subcategorie}</span>
                                    : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--accent)' }}>{t.toelichting || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 150, maxWidth: 350, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden' }}>{t.omschrijving_1 ?? '—'}</td>
                                <td onClick={e => e.stopPropagation()}>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button onClick={() => toggleArchiveerAangepast(t.id, false)} title="Dearchiveer"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7"/><path d="M10 12h4"/></svg>
                                    </button>
                                    <button onClick={() => verwijderAangepast(t.id)} title="Verwijder aangepaste categorisatie (terug naar auto-match)"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex', alignItems: 'center' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                    </button>
                                  </div>
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
            </>
          )}
        </>
      )}

      {/* CategoriePopup */}
      {patronModal && (
        <CategoriePopup
          patronModal={patronModal}
          setPatronModal={setPatronModal}
          onBevestig={handlePatronModalBevestig}
          onSluiten={() => setPatronModal(null)}
          onAnalyseer={async () => {
            const naam = patronModal.transactie.naam_tegenpartij;
            if (!naam) return {};
            const res = await fetch(`/api/transacties?naam_tegenpartij=${encodeURIComponent(naam)}`);
            const trns: TransactieMetCategorie[] = res.ok ? await res.json() : [];
            const tellers: Record<string, number> = {};
            for (const t of trns) {
              const omschr = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' ');
              const woorden = new Set(
                omschr.split(/[\s.,/()\[\]{}'"!?:;]+/)
                  .filter(w => w.length >= 1)
                  .map(w => w.toLowerCase().replace(/[^a-z0-9&-]/g, ''))
                  .filter(w => w.length > 0)
              );
              for (const w of woorden) tellers[w] = (tellers[w] ?? 0) + 1;
            }
            return tellers;
          }}
          budgettenPotjes={budgettenPotjes}
          rekeningen={rekeningen}
          periodes={periodes}
          onDatumWijzig={handleDatumWijzig}
          onVoegRekeningToe={handleVoegRekeningToe}
          uniekeCategorieenDropdown={uniekeCatDropdown}
          gebruikersProfiel={gebruikersProfiel}
        />
      )}

    </div>
  );
}
