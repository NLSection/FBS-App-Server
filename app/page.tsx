// FILE: page.tsx
// AANGEMAAKT: 25-03-2026 14:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 17:45
//
// WIJZIGINGEN (03-04-2026 17:45):
// - CAT subtabel: kolommen gelijkgetrokken met BLS subtabel (36px actiekolom + 28px padding)
// - Wrapper maxWidth ook bij openCatSubRows (CAT subtabel uitklap)
// - BLS categorienaam fontSize 14 (gelijk aan CAT)
// - BLS+CAT wrapper dynamisch: fit-content als ingeklapt, maxWidth 1150 als uitgeklapt
// - Omschrijving td: title attribuut voor volledige tekst op hover
// - BLS+CAT wrapper: overflowX auto; beide table-wrappers minWidth 760px; BLS table width 100%
// - Subtabel kolommen vaste breedtes; subtabel minWidth 900; BLS+CAT wrappers minWidth 966
// - Revert breedte-overrides; subtabel tableLayout fixed met auto Omschrijving kolom
// WIJZIGINGEN (03-04-2026 03:00):
// - CAT-tabel: Overzicht per Categorie sectie onder BLS-tabel
// WIJZIGINGEN (03-04-2026 01:00):
// - Rekening-badges: hex-kleur via hash + kleurBg() achtergrond, zelfde stijl als categorie-badges
// - Volgorde omgedraaid: hoort-op links, gedaan-op rechts; indicator richting aangepast
// - Chevron-tekens: enkele chevrons (‹›) i.p.v. guillemets; ||| met zelfde spacing
// WIJZIGINGEN (03-04-2026 00:30):
// - Rekening-badges groter (13px, padding 4px 12px) en minder fel (hsl h,35%,45%)
// - Richtingsindicator groter (18px), ruimer (gap 2px, letter-spacing 1px) en trager (2.5s cycle)
// WIJZIGINGEN (03-04-2026 00:00):
// - Hover fix: hoofdrij als directe <tr> i.p.v. geneste tabel; subtabel in aparte <tr>.bls-expand
// WIJZIGINGEN (02-04-2026 23:30):
// - Subtabel colgroup voor uitlijning; Rekening-kolom met geanimeerde richtingsindicator
// - Hash-gebaseerde kleuren per rekeningnaam; badge-label uitgebreid bij meerdere voorkomens
// WIJZIGINGEN (02-04-2026 23:00):
// - Badge-stijl overgenomen van transactiepagina (kleurBg, potje-kleur, badge/badge-outline classes)
// - Hover: alleen actieve rij kleurt, niet de outer wrapper-rij (bls-outer class)
// - Bedragkleuren: rood <0, groen >0, blauw =0 — consistent in hoofd- en subtabel
// WIJZIGINGEN (02-04-2026 22:00):
// - Bedragen hoofdrij uitlijnen onder kolomkoppen; Rekening kolom verwijderd; Subcategorie kolom toegevoegd
// - Hele subtabel-rij klikbaar voor CategoriePopup; omboekingen zichtbaar in subtabel
// WIJZIGINGEN (02-04-2026 21:00):
// - Categorie-badge per subtabel-transactie: opent CategoriePopup, herlaadt BLS na opslaan
// WIJZIGINGEN (02-04-2026 20:00):
// - BLS-tabel rijen klikbaar: klapt uit met subtabel van onderliggende transacties
// WIJZIGINGEN (31-03-2026 21:00):
// - Volledige herbouw: periodenavigatie, BLS-tabel, categorieoverzicht
// WIJZIGINGEN (31-03-2026 22:00):
// - BlsRegel interface aangepast aan nieuw endpoint formaat (bedrag, gedaanOpRekening, hoortOpRekening)
// - BLS tabel: categorie kolom toont [categorie] · [gedaanOpRekening] → [hoortOpRekening]
// WIJZIGINGEN (31-03-2026 23:00):
// - Totaalrij verwijderd uit BLS-tabel
// - Cumulatief toggle vervangen door Alle knop; layout gelijkgetrokken met TransactiesTabel
// - Alle modus: BLS laadt over heel geselecteerd jaar ipv één maand
// - Categorieoverzicht sectie verwijderd (niet meer beschikbaar in nieuw formaat)
// WIJZIGINGEN (01-04-2026 00:30):
// - BLS: totaalrij verwijderd
// - BLS: badges compacter (font 10px, padding 0/4px), pijl → ipv ──→, rij minder hoog
// - BLS: groen ✓ naast categorienaam bij saldo = 0
// WIJZIGINGEN (31-03-2026 23:59):
// - BLS tabel: twee-laags rijen (categorienaam + badge-pijlvisualisatie)
// - Saldo kleur: groen >0, rood <0, grijs =0
// - Linkerborder per rij: groen bij saldo=0, rood bij saldo≠0
// - Totaalrij terug met dezelfde saldo-kleurlogica

'use client';

import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import type { Periode } from '@/lib/maandperiodes';
import { kiesStartPeriode } from '@/lib/kiesStartPeriode';
import { bepaalDashboardPeriode } from '@/features/dashboard/utils/periodeRange';
import CategoriePopup from '@/features/shared/components/CategoriePopup';
import type { PatronModalData } from '@/features/shared/components/CategoriePopup';
import type { TransactieMetCategorie } from '@/lib/transacties';
import { kiesAutomatischeKleur } from '@/lib/kleuren';
import MaandFilter from '@/components/MaandFilter';
import { maakNaamChips, analyseerOmschrijvingen } from '@/features/shared/utils/naamChips';
import { Calendar } from 'lucide-react';

const MAAND_NAMEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];

interface BlsTransactie {
  id: number;
  datum: string | null;
  originele_datum: string | null;
  naam_tegenpartij: string | null;
  omschrijving: string | null;
  bedrag: number | null;
  rekening_naam: string | null;
  categorie_id: number | null;
  categorie: string | null;
  subcategorie: string | null;
  toelichting: string | null;
  type: string;
  tegenrekening_iban_bban: string | null;
  omschrijving_1: string | null;
  omschrijving_2: string | null;
  omschrijving_3: string | null;
  handmatig_gecategoriseerd: number;
}

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; kleur: string | null; }
interface RekeningGroep { id: number; naam: string; volgorde: number; rekening_ids: number[]; }

interface BlsRegel {
  categorie: string;
  gedaanOpRekening: string;
  hoortOpRekening: string;
  bedrag: number;
  gecorrigeerd: number;
  saldo: number;
  transacties: BlsTransactie[];
}

interface CatSubrij { subcategorie: string; bedrag: number; }
interface CatRegel { categorie: string; totaal: number; subrijen: CatSubrij[]; }
interface CatSubTrx {
  id: number;
  datum: string | null;
  originele_datum: string | null;
  naam_tegenpartij: string | null;
  omschrijving: string | null;
  bedrag: number | null;
  rekening_naam: string | null;
  categorie_id: number | null;
  categorie: string | null;
  subcategorie: string | null;
  toelichting: string | null;
  type: string;
  tegenrekening_iban_bban: string | null;
  omschrijving_1: string | null;
  omschrijving_2: string | null;
  omschrijving_3: string | null;
  handmatig_gecategoriseerd: number;
}
type MenuState = { key: string; top: number; left: number; items: { label: string; url: string }[] };

function formatBedrag(bedrag: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

function kleurBg(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return 'var(--accent-dim)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.15)`;
}

function bedragKleur(bedrag: number): string {
  return bedrag < 0 ? 'var(--red)' : bedrag > 0 ? 'var(--green)' : 'var(--accent)';
}

function hashKleur(naam: string): string {
  let hash = 0;
  for (let i = 0; i < naam.length; i++) {
    hash = naam.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((Math.abs(hash) % 360) + 360) % 360;
  const s = 0.45, l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Volgorde: [gedaan-op] indicator [hoort-op]
// Saldo < 0: geld moet van gedaan-op (links) naar hoort-op (rechts) → ⟩⟩⟩ rood
// Saldo > 0: geld moet van hoort-op (rechts) naar gedaan-op (links) → ⟨⟨⟨ groen
// Saldo = 0: in balans → ||| blauw
function RichtingsIndicator({ saldo }: { saldo: number }) {
  if (saldo < 0) {
    return (
      <span className="bls-flow flow-left" style={{ color: 'var(--red)' }}>
        <span>⟨</span><span>⟨</span><span>⟨</span>
      </span>
    );
  }
  if (saldo > 0) {
    return (
      <span className="bls-flow flow-right" style={{ color: 'var(--green)' }}>
        <span>⟩</span><span>⟩</span><span>⟩</span>
      </span>
    );
  }
  return (
    <span className="bls-flow flow-zero" style={{ color: 'var(--accent)' }}>
      <span className="bar" /><span className="bar" /><span className="bar" />
    </span>
  );
}


function HamburgerBtn({ menuKey, items, onOpen }: { menuKey: string; items: { label: string; url: string }[]; onOpen: (e: React.MouseEvent, key: string, items: { label: string; url: string }[]) => void }) {
  return (
    <button
      onClick={e => onOpen(e, menuKey, items)}
      title="Opties"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1, padding: 0, borderRadius: 4, display: 'flex', alignItems: 'center' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" /></svg>
    </button>
  );
}

export default function DashboardPage() {
  const [heeftImports, setHeeftImports]           = useState<boolean | null>(null);
  const [periodes, setPeriodes]                   = useState<Periode[]>([]);
  const [geselecteerdePeriode, setGeselecteerdePeriode] = useState<Periode | null>(null);
  const [geselecteerdJaar, setGeselecteerdJaar]   = useState<number>(new Date().getFullYear());
  const [blsData, setBlsData]                     = useState<BlsRegel[]>([]);
  const [laadtPeriodes, setLaadtPeriodes]         = useState(true);
  const [laadtBls, setLaadtBls]                   = useState(false);
  const [openRijen, setOpenRijen]                 = useState<Set<string>>(new Set());
  const [catData, setCatData]                     = useState<CatRegel[]>([]);
  const [laadtCat, setLaadtCat]                   = useState(false);
  const [openCatRijen, setOpenCatRijen]           = useState<Set<string>>(new Set());
  const [fout, setFout]                           = useState('');
  const [patronModal, setPatronModal]             = useState<PatronModalData | null>(null);
  const dashInstRef = useRef({ blsTonen: true, catTonen: true, blsTrxUitgeklapt: false, catUitklappen: true, catTrxUitgeklapt: false });
  const [dashInst, setDashInst]                   = useState(dashInstRef.current);
  const [budgettenPotjes, setBudgettenPotjes]     = useState<BudgetPotjeNaam[]>([]);
  const [rekeningen, setRekeningen]               = useState<Rekening[]>([]);
  const [uniekeCategorieenDropdown, setUniekeCategorieenDropdown] = useState<string[]>([]);
  const [gebruikersProfiel, setGebruikersProfiel] = useState<'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null>(null);
  const [menuState, setMenuState]                 = useState<MenuState | null>(null);
  const [kopieerdeSleutel, setKopieerdeSleutel]   = useState<string | null>(null);
  const [openCatSubRows, setOpenCatSubRows]       = useState<Set<string>>(new Set());
  const [catSubTrx, setCatSubTrx]                 = useState<Map<string, CatSubTrx[]>>(new Map());
  const [catSubLaden, setCatSubLaden]             = useState<Set<string>>(new Set());
  const [, setRekeningGroepen]     = useState<RekeningGroep[]>([]);
  const [, setActieveGroepId]       = useState<number | null>(null);
  const [dashboardTabs, setDashboardTabs]         = useState<{ id: number; type: 'groep' | 'rekening'; entiteit_id: number; naam: string; bls_tonen: boolean; cat_tonen: boolean; bls_trx_uitgeklapt: boolean; cat_uitklappen: boolean; cat_trx_uitgeklapt: boolean }[]>([]);
  const [actieveTabId, setActieveTabId]           = useState<number | null>(null);
  const [verbergCountdown, setVerbergCountdown]   = useState<{ sectie: 'bls' | 'cat'; resterende: number } | null>(null);

  useEffect(() => {
    fetch('/api/app-status').then(r => r.ok ? r.json() : null).then((s: { heeftImports: boolean } | null) => {
      setHeeftImports(s ? s.heeftImports : false);
    }).catch(() => setHeeftImports(false));
  }, []);

  // Periodes + dashboard-instellingen laden
  useEffect(() => {
    Promise.all([
      fetch('/api/periodes').then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
      fetch('/api/instellingen').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/lookup-data').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/dashboard-tabs').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([periodesData, instData, lookup, tabsData]: [Periode[], Record<string, unknown> | null, { rekeningen?: typeof rekeningen | null; budgettenPotjes?: typeof budgettenPotjes | null; rekeningGroepen?: RekeningGroep[] | null; uniekeCategorieen?: string[] | null } | null, { id: number; type: 'groep' | 'rekening'; entiteit_id: number; naam: string; bls_tonen: boolean; cat_tonen: boolean; bls_trx_uitgeklapt: boolean; cat_uitklappen: boolean; cat_trx_uitgeklapt: boolean }[]]) => {
      const groepenData = lookup?.rekeningGroepen ?? [];
      setRekeningGroepen(groepenData);
      setBudgettenPotjes(lookup?.budgettenPotjes ?? []);
      setRekeningen(lookup?.rekeningen ?? []);
      setUniekeCategorieenDropdown(lookup?.uniekeCategorieen ?? []);
      if (groepenData.length > 0) setActieveGroepId(groepenData[0].id);
      setDashboardTabs(tabsData);
      if (tabsData.length > 0) {
        // Actieve tab uit instellingen lezen (gedeeld met Vaste Posten-pagina);
        // valt terug op eerste tab als de opgeslagen tab niet meer bestaat.
        const opgeslagenId = (instData as { actieveDashboardTabId?: number | null } | null)?.actieveDashboardTabId ?? null;
        const gevonden = opgeslagenId != null ? tabsData.find(t => t.id === opgeslagenId) : null;
        setActieveTabId(gevonden ? gevonden.id : tabsData[0].id);
      }
      if (instData) {
        const inst = {
          blsTonen:         instData.dashboardBlsTonen      !== false,
          catTonen:         instData.dashboardCatTonen      !== false,
          blsTrxUitgeklapt: Boolean(instData.blsTrxUitgeklapt),
          catUitklappen:    Boolean(instData.catUitklappen),
          catTrxUitgeklapt: Boolean(instData.catTrxUitgeklapt),
        };
        dashInstRef.current = inst;
        setDashInst(inst);
        const p = instData.gebruikersProfiel;
        setGebruikersProfiel((p === 'potjesbeheer' || p === 'uitgavenbeheer' || p === 'handmatig') ? p : null);
      }
      setPeriodes(periodesData);
      const actueel = kiesStartPeriode(periodesData);
      if (actueel) {
        setGeselecteerdePeriode(actueel);
        setGeselecteerdJaar(actueel.jaar);
      }
    })
      .catch(() => setFout('Kon periodes niet ophalen.'))
      .finally(() => setLaadtPeriodes(false));
  }, []);

  // BLS data laden
  const laadBls = useCallback((periode: Periode | null, jaar: number, allesPeriodes: Periode[], groepId?: number | null, tabInfo?: { type: 'groep' | 'rekening'; entiteit_id: number; bls_trx_uitgeklapt?: boolean; cat_uitklappen?: boolean; cat_trx_uitgeklapt?: boolean } | null) => {
    setLaadtBls(true);
    setFout('');
    setOpenCatSubRows(new Set());
    setCatSubTrx(new Map());
    setCatSubLaden(new Set());
    const blsTrxUit  = tabInfo?.bls_trx_uitgeklapt ?? dashInstRef.current.blsTrxUitgeklapt;
    const catUitklap = tabInfo?.cat_uitklappen      ?? dashInstRef.current.catUitklappen;
    const catTrxUit  = tabInfo?.cat_trx_uitgeklapt  ?? dashInstRef.current.catTrxUitgeklapt;

    const bereik = bepaalDashboardPeriode(periode, jaar, allesPeriodes);
    if (!bereik) { setLaadtBls(false); return; }
    const { datumVan, datumTot } = bereik;

    let filterQs = '';
    if (tabInfo) {
      filterQs = tabInfo.type === 'groep' ? `&groep_id=${tabInfo.entiteit_id}` : `&rekening_id=${tabInfo.entiteit_id}`;
    } else if (groepId) {
      filterQs = `&groep_id=${groepId}`;
    }
    const qs = `datum_van=${datumVan}&datum_tot=${datumTot}${filterQs}`;

    setLaadtCat(true);
    fetch(`/api/dashboard/overzicht?${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((overzicht: { bls: BlsRegel[]; cat: CatRegel[] }) => {
        const blsRegels = overzicht.bls;
        setBlsData(blsRegels);
        setOpenRijen(blsTrxUit ? new Set(blsRegels.map(r => `${r.categorie}::${r.gedaanOpRekening}`)) : new Set());

        const catRegels = overzicht.cat;
        setCatData(catRegels);
        setOpenCatRijen(catUitklap ? new Set(catRegels.map(c => c.categorie)) : new Set());
        // Subcategorieën standaard uitklappen + transacties laden
        if (catUitklap && catTrxUit) {
          const subKeys = new Set<string>();
          for (const cat of catRegels) {
            for (const sub of cat.subrijen) {
              if (sub.subcategorie.length > 0) subKeys.add(`${cat.categorie}::${sub.subcategorie}`);
            }
          }
          setOpenCatSubRows(subKeys);
          // Transacties laden met correcte periode
          const ladenSet = new Set<string>();
          setCatSubLaden(ladenSet);
          for (const key of subKeys) {
            const [catNaam, subNaam] = key.split('::');
            ladenSet.add(key);
            setCatSubLaden(new Set(ladenSet));
            fetch(`/api/dashboard/cat/transacties?categorie=${encodeURIComponent(catNaam)}&subcategorie=${encodeURIComponent(subNaam)}${datumVan ? `&van=${datumVan}&tot=${datumTot}` : ''}`)
              .then(r => r.ok ? r.json() : [])
              .then((trxData: CatSubTrx[]) => {
                setCatSubTrx(prev => { const next = new Map(prev); next.set(key, trxData); return next; });
              })
              .finally(() => {
                setCatSubLaden(prev => { const next = new Set(prev); next.delete(key); return next; });
              });
          }
        }
      })
      .catch(() => setFout('Kon dashboard-data niet ophalen.'))
      .finally(() => { setLaadtBls(false); setLaadtCat(false); });
  }, []);

  const actieveTab = dashboardTabs.find(t => t.id === actieveTabId) ?? null;
  useEffect(() => {
    const tab = dashboardTabs.find(t => t.id === actieveTabId) ?? null;
    if (tab) {
      const tabInst = { blsTrxUitgeklapt: tab.bls_trx_uitgeklapt, catUitklappen: tab.cat_uitklappen, catTrxUitgeklapt: tab.cat_trx_uitgeklapt };
      dashInstRef.current = { ...dashInstRef.current, ...tabInst };
      setDashInst(prev => ({ ...prev, ...tabInst }));
    }
    laadBls(geselecteerdePeriode, geselecteerdJaar, periodes, null, tab);
  }, [geselecteerdePeriode, geselecteerdJaar, periodes, laadBls, actieveTabId, dashboardTabs]);

  function handleJaar(jaar: number) {
    setGeselecteerdJaar(jaar);
    // Ander jaar dan het actuele → standaard "ALLE" maanden geselecteerd.
    // Actuele jaar → probeer zelfde maand te behouden, anders laatste niet-toekomstige periode.
    if (jaar !== new Date().getFullYear()) {
      setGeselecteerdePeriode(null);
      return;
    }
    const periodesVoorJaar = periodes.filter(p => p.jaar === jaar);
    const huidigeMaand = geselecteerdePeriode?.maand;
    const gevonden = huidigeMaand ? periodesVoorJaar.find(p => p.maand === huidigeMaand) : null;
    const nieuw = gevonden
      ?? periodesVoorJaar.filter(p => p.status !== 'toekomstig').slice(-1)[0]
      ?? periodesVoorJaar[0]
      ?? null;
    setGeselecteerdePeriode(nieuw);
  }

  const tdNum: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  function borderKleur(saldo: number) {
    return saldo === 0 ? 'var(--green)' : 'var(--red)';
  }

  function herlaadBls() {
    const tab = dashboardTabs.find(t => t.id === actieveTabId) ?? null;
    laadBls(geselecteerdePeriode, geselecteerdJaar, periodes, null, tab);
  }

  // Menu helpers
  function maandStr(): string {
    if (!geselecteerdePeriode) return '';
    return `${geselecteerdePeriode.jaar}-${String(geselecteerdePeriode.maand).padStart(2, '0')}`;
  }
  function openMenu(e: React.MouseEvent, key: string, items: { label: string; url: string }[]) {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const minW = 240;
    const left = Math.max(8, Math.min(rect.right - minW, window.innerWidth - minW - 8));
    const top  = Math.min(rect.bottom + 4, window.innerHeight - items.length * 38 - 20);
    setMenuState({ key, top, left, items });
  }
  function openContextMenu(e: React.MouseEvent, key: string, items: { label: string; url: string }[]) {
    e.preventDefault();
    e.stopPropagation();
    const minW = 240;
    const left = Math.max(8, Math.min(e.clientX, window.innerWidth - minW - 8));
    const top  = Math.max(8, Math.min(e.clientY, window.innerHeight - items.length * 38 - 20));
    setMenuState({ key, top, left, items });
  }

  async function updateDashInst(update: Partial<typeof dashInst>, _slaOpRemote = true) {
    const nieuw = { ...dashInst, ...update };
    dashInstRef.current = nieuw;
    setDashInst(nieuw);

    // Direct visueel toepassen
    if (update.blsTrxUitgeklapt !== undefined) {
      setOpenRijen(update.blsTrxUitgeklapt ? new Set(blsData.map(r => `${r.categorie}::${r.gedaanOpRekening}`)) : new Set());
    }
    if (update.catUitklappen !== undefined) {
      setOpenCatRijen(update.catUitklappen ? new Set(catData.map(c => c.categorie)) : new Set());
      if (update.catUitklappen) {
        if (nieuw.catTrxUitgeklapt) {
          const subKeys = new Set<string>();
          for (const cat of catData) {
            for (const sub of cat.subrijen) {
              if (sub.subcategorie.length > 0 && sub.bedrag !== 0) subKeys.add(`${cat.categorie}::${sub.subcategorie}`);
            }
          }
          setOpenCatSubRows(subKeys);
          for (const key of subKeys) {
            if (!catSubTrx.has(key)) {
              const [catNaam, subNaam] = key.split('::');
              laadCatSubTrx(catNaam, subNaam);
            }
          }
        } else {
          setOpenCatSubRows(new Set());
        }
      } else {
        setOpenCatSubRows(new Set());
      }
    }
    if (update.catTrxUitgeklapt !== undefined) {
      if (update.catTrxUitgeklapt && nieuw.catUitklappen) {
        const subKeys = new Set<string>();
        for (const cat of catData) {
          for (const sub of cat.subrijen) {
            if (sub.subcategorie.length > 0 && sub.bedrag !== 0) subKeys.add(`${cat.categorie}::${sub.subcategorie}`);
          }
        }
        setOpenCatSubRows(subKeys);
        for (const key of subKeys) {
          if (!catSubTrx.has(key)) {
            const [catNaam, subNaam] = key.split('::');
            laadCatSubTrx(catNaam, subNaam);
          }
        }
      } else {
        setOpenCatSubRows(new Set());
      }
    }

    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardBlsTonen: update.blsTonen,
        dashboardCatTonen: update.catTonen,
        blsTrxUitgeklapt: update.blsTrxUitgeklapt,
        catUitklappen: update.catUitklappen,
        catTrxUitgeklapt: update.catTrxUitgeklapt,
      }),
    });
  }
  function blsHoofdItems(cat: string): { label: string; url: string }[] {
    const mp = maandStr();
    return [{ label: `Bekijk transacties van ${cat}`, url: `/transacties?categorie=${encodeURIComponent(cat)}${mp ? `&maand=${mp}` : ''}` }];
  }
  function blsSubItems(trx: BlsTransactie): { label: string; url: string }[] {
    const cat = trx.categorie ?? '';
    const mp  = maandStr();
    return [
      { label: 'Bekijk in gefilterde weergave', url: `/transacties?categorie=${encodeURIComponent(cat)}${mp ? `&maand=${mp}` : ''}&transactie=${trx.id}` },
      { label: 'Bekijk in maandweergave',        url: `/transacties?${mp ? `maand=${mp}&` : ''}transactie=${trx.id}` },
    ];
  }
  function catHoofdItems(cat: string): { label: string; url: string }[] {
    const mp = maandStr();
    return [{ label: `Bekijk transacties van ${cat}`, url: `/transacties?categorie=${encodeURIComponent(cat)}${mp ? `&maand=${mp}` : ''}` }];
  }
  function catSubMenuItems(catNaam: string, subNaam: string): { label: string; url: string }[] {
    const mp = maandStr();
    return [{ label: `Bekijk transacties van ${subNaam}`, url: `/transacties?categorie=${encodeURIComponent(catNaam)}&subcategorie=${encodeURIComponent(subNaam)}${mp ? `&maand=${mp}` : ''}` }];
  }

  async function laadCatSubTrx(catNaam: string, subNaam: string) {
    const key = `${catNaam}::${subNaam}`;
    if (catSubLaden.has(key) || catSubTrx.has(key)) return;
    setCatSubLaden(prev => { const next = new Set(prev); next.add(key); return next; });
    const bereik = bepaalDashboardPeriode(geselecteerdePeriode, geselecteerdJaar, periodes);
    if (!bereik) {
      setCatSubLaden(prev => { const next = new Set(prev); next.delete(key); return next; });
      return;
    }
    const { datumVan: start, datumTot: eind } = bereik;
    const actTab = dashboardTabs.find(t => t.id === actieveTabId) ?? null;
    const tabFilterQs = actTab ? (actTab.type === 'groep' ? `&groep_id=${actTab.entiteit_id}` : `&rekening_id=${actTab.entiteit_id}`) : '';
    const qs = `categorie=${encodeURIComponent(catNaam)}&subcategorie=${encodeURIComponent(subNaam)}&van=${start}&tot=${eind}${tabFilterQs}`;
    try {
      const data = await fetch(`/api/dashboard/cat/transacties?${qs}`).then(r => r.ok ? r.json() : []) as CatSubTrx[];
      setCatSubTrx(prev => { const next = new Map(prev); next.set(key, data); return next; });
    } finally {
      setCatSubLaden(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  // Sluit menu bij klik buiten of Escape
  useEffect(() => {
    if (!menuState) return;
    function handleClick() { setMenuState(null); }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuState(null); }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('click', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [menuState]);

  // Sync lokale dashInst wanneer DashboardInstellingen iets opgeslagen heeft
  // (popover/modal/instellingenpagina) — voorkomt dat een handmatige refresh nodig is
  const updateDashInstRef = useRef(updateDashInst);
  updateDashInstRef.current = updateDashInst;
  useEffect(() => {
    function onApplied(e: Event) {
      const d = (e as CustomEvent<Record<string, unknown>>).detail ?? {};
      const mapped: Partial<typeof dashInst> = {};
      if ('dashboardBlsTonen' in d) mapped.blsTonen = Boolean(d.dashboardBlsTonen);
      if ('dashboardCatTonen' in d) mapped.catTonen = Boolean(d.dashboardCatTonen);
      if ('blsTrxUitgeklapt' in d) mapped.blsTrxUitgeklapt = Boolean(d.blsTrxUitgeklapt);
      if ('catUitklappen'    in d) mapped.catUitklappen    = Boolean(d.catUitklappen);
      if ('catTrxUitgeklapt' in d) mapped.catTrxUitgeklapt = Boolean(d.catTrxUitgeklapt);
      if (Object.keys(mapped).length > 0) updateDashInstRef.current(mapped, false);
      // Bijwerken per-tab state zodat volgende tab-wissel de juiste waarden laadt
      const tabId = typeof d.tabId === 'number' ? d.tabId : null;
      if (tabId != null) {
        const tabUpdate: Record<string, boolean> = {};
        if ('blsTrxUitgeklapt' in d) tabUpdate.bls_trx_uitgeklapt = Boolean(d.blsTrxUitgeklapt);
        if ('catUitklappen'    in d) tabUpdate.cat_uitklappen      = Boolean(d.catUitklappen);
        if ('catTrxUitgeklapt' in d) tabUpdate.cat_trx_uitgeklapt  = Boolean(d.catTrxUitgeklapt);
        if (Object.keys(tabUpdate).length > 0)
          setDashboardTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...tabUpdate } : t));
      }
    }
    window.addEventListener('dash-inst-applied', onApplied);
    return () => window.removeEventListener('dash-inst-applied', onApplied);
  }, []);

  // Verberg-sectie countdown
  useEffect(() => {
    function onVerberg(e: Event) {
      const { sectie } = (e as CustomEvent<{ sectie: 'bls' | 'cat' }>).detail;
      setVerbergCountdown({ sectie, resterende: 5 });
    }
    window.addEventListener('dash-verberg-sectie', onVerberg);
    return () => window.removeEventListener('dash-verberg-sectie', onVerberg);
  }, []);

  useEffect(() => {
    if (!verbergCountdown) return;
    if (verbergCountdown.resterende <= 0) {
      const { sectie } = verbergCountdown;
      setVerbergCountdown(null);
      if (actieveTabId != null) {
        const veld = sectie === 'bls' ? 'bls_tonen' : 'cat_tonen';
        fetch(`/api/dashboard-tabs/${actieveTabId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [veld]: false }),
        });
        setDashboardTabs(prev => prev.map(t => t.id === actieveTabId ? { ...t, [veld]: false } : t));
      }
      return;
    }
    const t = setTimeout(() => setVerbergCountdown(prev => prev ? { ...prev, resterende: prev.resterende - 1 } : null), 1000);
    return () => clearTimeout(t);
  }, [verbergCountdown, actieveTabId]);


  async function openCategoriePopupBls(trx: BlsTransactie, e: React.MouseEvent) {
    e.stopPropagation();
    const naamChips = maakNaamChips(trx.naam_tegenpartij ?? null);
    const chips = analyseerOmschrijvingen(trx);

    if (trx.categorie_id != null || trx.categorie) {
      const regelsRes = await fetch('/api/categorieen');
      const regels: { id: number; naam_zoekwoord: string | null; omschrijving_zoekwoord: string | null; categorie: string; subcategorie: string | null }[] = regelsRes.ok ? await regelsRes.json() : [];
      const regel = trx.categorie_id != null ? regels.find(r => r.id === trx.categorie_id) ?? null : null;

      const categorie = trx.categorie ?? '';
      const subcategorie = trx.subcategorie ?? '';

      const naamZoekwoorden = regel?.naam_zoekwoord ? regel.naam_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenNaamChips = naamChips.filter(c => naamZoekwoorden.includes(c.waarde)).map(c => c.waarde);

      const omschrZoekwoorden = regel?.omschrijving_zoekwoord ? regel.omschrijving_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenWoorden = chips.filter(c => omschrZoekwoorden.includes(c.waarde)).map(c => c.waarde);

      const subcatRes = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(categorie)}&volledig=1`);
      const subs: { naam: string; inActieveRegel: boolean }[] = subcatRes.ok ? await subcatRes.json() : [];
      const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
      const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);

      // BLS/CAT-trx levert datum=effectief + originele_datum=import. Popup verwacht
      // datum=import + datum_aanpassing=override → omzetten zodat de popup de
      // datum-wijziging herkent en herstel-knop toont.
      const trxMC = {
        ...trx,
        datum: trx.originele_datum ?? trx.datum,
        datum_aanpassing: trx.originele_datum ? trx.datum : null,
      } as unknown as TransactieMetCategorie;
      setPatronModal({ transactie: trxMC, toelichting: trx.toelichting ?? '', nieuweCat: categorie, catNieuw: false, nieuweCatRekeningId: '', subcategorie, subcatOpties, subcatGearchiveerd, subcatNieuw: false, naamChips, gekozenNaamChips, chips, gekozenWoorden, scope: trx.categorie_id != null ? 'alle' : 'enkel', bedragMin: trxMC.regel_bedrag_min ?? null, bedragMax: trxMC.regel_bedrag_max ?? null });
    } else {
      const trxMC = {
        ...trx,
        datum: trx.originele_datum ?? trx.datum,
        datum_aanpassing: trx.originele_datum ? trx.datum : null,
      } as unknown as TransactieMetCategorie;
      setPatronModal({ transactie: trxMC, toelichting: trx.toelichting ?? '', nieuweCat: '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [], subcatNieuw: false, naamChips, gekozenNaamChips: [], chips, gekozenWoorden: [], scope: 'alle', bedragMin: trxMC.regel_bedrag_min ?? null, bedragMax: trxMC.regel_bedrag_max ?? null });
    }
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

    if (nieuweCat === '__geen__') {
      if (scope === 'alle') {
        if (t.categorie_id != null) await fetch(`/api/categorieen/${t.categorie_id}`, { method: 'DELETE' });
        await fetch('/api/categoriseer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      } else {
        await fetch(`/api/transacties/${t.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categorie_id: null, status: 'nieuw', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }),
        });
      }
      herlaadBls(); return;
    }
    if (!nieuweCat) { herlaadBls(); return; }

    if (scope === 'enkel') {
      if (catNieuw) {
        await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
      }
      await fetch(`/api/transacties/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, status: 'verwerkt', handmatig_gecategoriseerd: 1, toelichting: toelichting || null }),
      });
      herlaadBls(); return;
    }

    // scope 'alle'
    if (catNieuw) {
      await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
    }

    const body: Record<string, unknown> = {
      categorie: nieuweCat.trim(),
      subcategorie: subcatWaarde || null,
      type: t.type,
      naam_origineel: gekozenNaamLabel,
      naam_zoekwoord_raw: gekozenNaamChip || t.naam_tegenpartij,
      toelichting: toelichting || null,
      bedrag_min: bedragMin,
      bedrag_max: bedragMax,
    };
    if (t.tegenrekening_iban_bban) body.iban = t.tegenrekening_iban_bban;
    if (gekozenWoord) body.omschrijving_raw = gekozenWoord;

    let finalRegelId: number | null = null;
    if (t.categorie_id != null && !catNieuw) {
      await fetch(`/api/categorieen/${t.categorie_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      finalRegelId = t.categorie_id;
    } else {
      const res = await fetch('/api/categorieen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const { id } = await res.json(); finalRegelId = id as number; }
    }

    const extra = finalRegelId != null ? { toelichting: toelichting || null, categorie_id: finalRegelId } : {};
    await fetch('/api/categoriseer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra) });
    herlaadBls();
  }

  if (heeftImports === false) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8 }}>Nog geen transacties geïmporteerd</p>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>Importeer een CSV-bestand om het dashboard te vullen.</p>
      <a href="/import" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Ga naar Importeer CSV →</a>
    </div>
  );

  return (
    <>
      <div data-onboarding="page-header-dashboard" className="page-header">
        <h1>Dashboard</h1>
        <p>
          {geselecteerdePeriode
            ? `${MAAND_NAMEN[geselecteerdePeriode.maand - 1].toLowerCase()} ${geselecteerdePeriode.jaar}`
            : `${geselecteerdJaar} — alle maanden`}
        </p>
      </div>

      {fout && <div className="error-melding">{fout}</div>}

      {/* Periodenavigatie */}
      {!laadtPeriodes && (
        <div data-onboarding="dashboard-maandfilter" style={{ marginBottom: 20 }}>
          <MaandFilter
            periodes={periodes}
            geselecteerdJaar={geselecteerdJaar}
            geselecteerdePeriode={geselecteerdePeriode}
            onJaarChange={handleJaar}
            onPeriodeChange={setGeselecteerdePeriode}
          />
        </div>
      )}

      {/* Tabbalk — dashboard_tabs */}
      {dashboardTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
          {dashboardTabs.map(t => (
            <button key={t.id} onClick={() => {
              setActieveTabId(t.id);
              fetch('/api/instellingen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actieveDashboardTabId: t.id }) }).catch(() => {});
              try { window.dispatchEvent(new CustomEvent('dashboard-tab-changed', { detail: { id: t.id } })); } catch { /* */ }
            }}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: actieveTabId === t.id ? 600 : 400,
                background: 'none', border: 'none', cursor: 'pointer',
                color: actieveTabId === t.id ? 'var(--accent)' : 'var(--text-dim)',
                borderBottom: actieveTabId === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2, transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.naam}
            </button>
          ))}
        </div>
      )}

      {/* BLS + CAT wrapper — compact als ingeklapt, breed als uitgeklapt */}
      {(() => {
        const blsZichtbaar = dashboardTabs.length > 0 && (actieveTab ? actieveTab.bls_tonen : dashInst.blsTonen);
        const catZichtbaar = dashboardTabs.length > 0 && (actieveTab ? actieveTab.cat_tonen : dashInst.catTonen);
        return (blsZichtbaar || catZichtbaar) && <div style={{ maxWidth: 'fit-content', margin: '0 auto' }}>

      {/* BLS Sectie */}
      {blsZichtbaar && <div data-onboarding="dashboard-bls"><p className="section-title">Balans Budgetten en Potjes</p>
      {verbergCountdown?.sectie === 'bls' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', marginBottom: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>⏱ {verbergCountdown.resterende}s</span>
          <span style={{ color: 'var(--text)' }}>Balans Budgetten en Potjes wordt verborgen. Zichtbaar maken via Dashboard instellingen → tabblad.</span>
          <button onClick={() => setVerbergCountdown(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}>Annuleer</button>
        </div>
      )}
      {laadtBls ? (
        <div className="loading">BLS-data wordt geladen…</div>
      ) : blsData.length === 0 && !fout ? (
        <div className="empty">Geen data voor deze periode.</div>
      ) : (
        <div className="table-wrapper" style={{ marginBottom: 36 }}>
          <table>
            <colgroup>
              <col style={{ width: 'auto' }} />
              <col />
              <col style={{ width: 12 }} />
              <col />
              <col style={{ width: 12 }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 20 }} />
              <col style={{ width: 12 }} />
              <col style={{ width: 20 }} />
              <col style={{ width: 12 }} />
              <col style={{ width: 15 }} />
            </colgroup>
            <thead>
              <tr onContextMenu={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'dashboard-bls', x: e.clientX, y: e.clientY, tabId: actieveTabId } })); }}>
                <th>Categorie</th>
                <th colSpan={5}>Correctie richting</th>
                <th style={{ textAlign: 'right' }}>Bedrag</th>
                <th style={{ textAlign: 'right' }}>Gecorrigeerd</th>
                <th style={{ textAlign: 'right', padding: 0, whiteSpace: 'nowrap', minWidth: 80, maxWidth: 80 }}>Saldo</th>
                <th style={{ padding: 0, minWidth: 20, maxWidth: 20 }} />
                <th data-onboarding="dashboard-kopieer" style={{ padding: 0 }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}><rect x="1" y="1" width="9.5" height="9.5" rx="3" /><rect x="5.5" y="5.5" width="9.5" height="9.5" rx="3" fill="var(--bg-card)" /></svg></th>
                <th style={{ padding: 0, minWidth: 20, maxWidth: 20 }} />
                <th style={{ padding: 0, minWidth: 20, maxWidth: 20, verticalAlign: 'middle', textAlign: 'center' }}>
                  <button onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'dashboard-bls', x: e.clientX, y: e.clientY, tabId: actieveTabId } })); }} title="Tabelinstellingen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M6.5 1h3l.5 2.1a5.5 5.5 0 0 1 1.8 1l2-.7 1.5 2.6-1.5 1.4a5.5 5.5 0 0 1 0 2.1l1.5 1.4-1.5 2.6-2-.7a5.5 5.5 0 0 1-1.8 1L9.5 15h-3l-.5-2.1a5.5 5.5 0 0 1-1.8-1l-2 .7L.7 10l1.5-1.4a5.5 5.5 0 0 1 0-2.1L.7 5.1l1.5-2.6 2 .7a5.5 5.5 0 0 1 1.8-1z" /><circle cx="8" cy="8" r="2.5" /></svg>
                  </button>
                </th>
                <th style={{ padding: 0, minWidth: 15, maxWidth: 15 }} />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const hoortTellingen = new Map<string, number>();
                for (const r of blsData) {
                  hoortTellingen.set(r.hoortOpRekening, (hoortTellingen.get(r.hoortOpRekening) ?? 0) + 1);
                }
                // Effectieve kleuren per rekening (rekening houdend met categorie- en andere rekeningkleuren)
                const rekKleurMap = (() => {
                  const catKleuren = budgettenPotjes.map(bp => bp.kleur).filter((k): k is string => !!k);
                  const map = new Map<string, string>();
                  const gebruikt = [...catKleuren];
                  for (const r of rekeningen) {
                    if (r.kleur) { map.set(r.naam, r.kleur); gebruikt.push(r.kleur); }
                    else { const auto = kiesAutomatischeKleur(gebruikt); map.set(r.naam, auto); gebruikt.push(auto); }
                  }
                  return map;
                })();

                const rekBadge = (naam: string, label?: string, kleurOverride?: string): React.ReactNode => {
                  const kleur = kleurOverride ?? rekKleurMap.get(naam) ?? hashKleur(naam);
                  return (
                    <span style={{ display: 'inline-block', fontSize: 11, borderRadius: 3, padding: '0px 6px', fontWeight: 600, border: `1px solid ${kleur}`, color: kleur, whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {label ?? naam}
                    </span>
                  );
                };

                return blsData.map(rij => {
                  const sleutel = `${rij.categorie}::${rij.gedaanOpRekening}`;
                  const isOpen = openRijen.has(sleutel);
                  const toggleRij = () => setOpenRijen(prev => {
                    const next = new Set(prev);
                    if (next.has(sleutel)) next.delete(sleutel); else next.add(sleutel);
                    return next;
                  });
                  const hoortLabel = `${rij.hoortOpRekening}: ${rij.categorie}`;
                  return (
                    <Fragment key={sleutel}>
                      {/* Hoofdrij — directe <tr> in outer tbody, geen geneste tabel */}
                      <tr onClick={toggleRij} onContextMenu={e => openContextMenu(e, `ctx-bls-${sleutel}`, blsHoofdItems(rij.categorie))} style={{ cursor: 'pointer' }}>
                        <td style={{ borderLeft: `2px solid ${borderKleur(rij.saldo)}`, paddingLeft: 10, paddingRight: 12, paddingTop: 8, paddingBottom: 8, whiteSpace: 'nowrap', width: '1%' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-h)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            {rij.categorie}
                          </div>
                        </td>
                        <td style={{ padding: '8px 0 8px 8px', whiteSpace: 'nowrap' }}>{rekBadge(rij.gedaanOpRekening)}</td>
                        <td style={{ padding: 0, minWidth: 12, maxWidth: 12 }} />
                        <td style={{ padding: '8px 0', whiteSpace: 'nowrap', textAlign: 'center' }}><RichtingsIndicator saldo={rij.saldo} /></td>
                        <td style={{ padding: 0, minWidth: 12, maxWidth: 12 }} />
                        <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>{rekBadge(rij.hoortOpRekening, hoortLabel, budgettenPotjes.find(bp => bp.naam === rij.categorie)?.kleur ?? undefined)}{rij.saldo === 0 && <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 700, marginLeft: 6 }}>✓</span>}</td>
                        <td style={{ ...tdNum, color: bedragKleur(rij.bedrag), fontWeight: 700, fontSize: 13 }}>{formatBedrag(rij.bedrag)}</td>
                        <td style={{ ...tdNum, color: rij.gecorrigeerd !== 0 ? bedragKleur(rij.gecorrigeerd) : undefined, fontWeight: 700, fontSize: 13 }}>{rij.gecorrigeerd !== 0 ? formatBedrag(rij.gecorrigeerd) : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: 0, whiteSpace: 'nowrap', minWidth: 80, maxWidth: 80, color: bedragKleur(rij.saldo), fontWeight: 700, fontSize: 13 }}><span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 6, background: kopieerdeSleutel === sleutel ? 'rgba(34,197,94,0.22)' : 'transparent', transition: 'background 0.4s ease' }}>{formatBedrag(rij.saldo)}</span></td>
                        <td style={{ padding: 0, minWidth: 20, maxWidth: 20 }} />
                        <td style={{ padding: 0, verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}><button title={kopieerdeSleutel === sleutel ? 'Gekopieerd!' : 'Kopieer saldo bedrag'} onClick={() => { navigator.clipboard.writeText(Math.abs(rij.saldo).toFixed(2).replace('.', ',')); setKopieerdeSleutel(sleutel); setTimeout(() => setKopieerdeSleutel(prev => prev === sleutel ? null : prev), 1500); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: kopieerdeSleutel === sleutel ? 'var(--green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', padding: 0, lineHeight: 1, opacity: kopieerdeSleutel === sleutel ? 1 : 0.6, transition: 'color 0.2s ease, opacity 0.2s ease' }} onMouseEnter={e => { if (kopieerdeSleutel !== sleutel) e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { if (kopieerdeSleutel !== sleutel) e.currentTarget.style.opacity = '0.6'; }}>{kopieerdeSleutel === sleutel ? (<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5,8.5 6.5,12.5 13.5,3.5" /></svg>) : (<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="9.5" height="9.5" rx="3" /><rect x="5.5" y="5.5" width="9.5" height="9.5" rx="3" fill="var(--bg-card)" /></svg>)}</button></td>
                        <td style={{ padding: 0, minWidth: 20, maxWidth: 20 }} />
                        <td style={{ padding: 0, verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                          <HamburgerBtn menuKey={`hbls-${sleutel}`} items={blsHoofdItems(rij.categorie)} onOpen={openMenu} />
                        </td>
                        <td style={{ padding: 0, minWidth: 15, maxWidth: 15 }} />
                      </tr>
                      {/* Subtabel — aparte <tr> zodat hover niet interfereert met hoofdrij */}
                      {isOpen && rij.transacties && rij.transacties.length > 0 && (
                        <tr className="bls-expand">
                          <td colSpan={14} style={{ padding: '0 8px 8px 28px' }}>
                            <table style={{ fontSize: 11, borderCollapse: 'collapse', tableLayout: 'fixed', width: 850 }}>
                              <colgroup>
                                <col style={{ width: 80 }} />
                                <col style={{ width: 160 }} />
                                <col />
                                <col style={{ width: 65 }} />
                                <col style={{ width: 110 }} />
                                <col style={{ width: 110 }} />
                                <col style={{ width: 36 }} />
                              </colgroup>
                              <thead>
                                <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Datum</th>
                                  <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Naam</th>
                                  <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Omschrijving</th>
                                  <th style={{ textAlign: 'right', padding: '2px 10px', fontWeight: 500 }}>Bedrag</th>
                                  <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Categorie</th>
                                  <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Subcategorie</th>
                                  <th style={{ width: 36 }} />
                                </tr>
                              </thead>
                              <tbody>
                                {rij.transacties.map(trx => {
                                  const catKleur = budgettenPotjes.find(bp => bp.naam === trx.categorie)?.kleur ?? 'var(--accent)';
                                  return (
                                    <tr key={trx.id} onClick={(e) => openCategoriePopupBls(trx, e)} onContextMenu={e => openContextMenu(e, `ctx-bls-sub-${trx.id}`, blsSubItems(trx))} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
                                      <td
                                        style={{ padding: '2px 10px', whiteSpace: 'nowrap', color: trx.originele_datum ? 'var(--accent)' : undefined }}
                                        title={trx.originele_datum ? `Origineel geboekt op ${trx.originele_datum}` : undefined}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                          <span>{trx.datum ?? '—'}</span>
                                          {trx.originele_datum && <Calendar size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                                        </div>
                                      </td>
                                      <td style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trx.naam_tegenpartij ?? '—'}</td>
                                      <td title={trx.omschrijving ?? undefined} style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trx.omschrijving ?? '—'}</td>
                                      <td style={{ padding: '2px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: bedragKleur(trx.bedrag ?? 0) }}>{trx.bedrag != null ? formatBedrag(trx.bedrag) : '—'}</td>
                                      <td style={{ padding: '2px 10px' }}>
                                        {trx.categorie
                                          ? <span className="badge" style={{ background: kleurBg(catKleur), border: `1px solid ${catKleur}`, color: catKleur }}>{trx.categorie}</span>
                                          : <span className="badge-outline-red">Ongecategoriseerd</span>
                                        }
                                      </td>
                                      <td style={{ padding: '2px 10px' }}>
                                        {trx.subcategorie
                                          ? <span className="badge-outline" style={{ borderColor: catKleur, color: catKleur }}>{trx.subcategorie}</span>
                                          : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                                        }
                                      </td>
                                      <td style={{ width: 36, padding: 0, textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                        <HamburgerBtn menuKey={`h-bls-sub-${trx.id}`} items={blsSubItems(trx)} onOpen={openMenu} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}</div>}

      {/* CAT Sectie — Overzicht per Categorie */}
      {catZichtbaar && <div data-onboarding="dashboard-cat"><p className="section-title" style={{ marginTop: 8 }}>Overzicht per Categorie</p>
      {verbergCountdown?.sectie === 'cat' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', marginBottom: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>⏱ {verbergCountdown.resterende}s</span>
          <span style={{ color: 'var(--text)' }}>Overzicht per Categorie wordt verborgen. Zichtbaar maken via Dashboard instellingen → tabblad.</span>
          <button onClick={() => setVerbergCountdown(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}>Annuleer</button>
        </div>
      )}
      {laadtCat ? (
        <div className="loading">Categoriedata wordt geladen…</div>
      ) : catData.length === 0 && !fout ? (
        <div className="empty">Geen categoriedata voor deze periode.</div>
      ) : (
        <div className="table-wrapper" style={{ marginBottom: 36, minWidth: 850 }}>
          {(() => {
            const isAlle = geselecteerdePeriode === null;
            const aantalAfgesloten = isAlle ? periodes.filter(p => p.jaar === geselecteerdJaar && p.status === 'afgesloten').length : 0;
            return (<table>
            <colgroup>
              <col style={{ width: 'auto' }} />
              <col style={{ width: isAlle ? 150 : 120 }} />
              {isAlle && <col style={{ width: 180 }} />}
              <col style={{ width: 12 }} />
              <col style={{ width: 15 }} />
            </colgroup>
            <thead>
              <tr onContextMenu={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'dashboard-cat', x: e.clientX, y: e.clientY, tabId: actieveTabId } })); }}>
                <th>Categorie</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>{isAlle ? `Totaal over ${geselecteerdJaar}` : 'Bedrag'}</th>
                {isAlle && <th style={{ textAlign: 'right', padding: '8px 16px' }}>Gemiddeld per maand</th>}
                <th style={{ padding: 0, minWidth: 15, maxWidth: 15, verticalAlign: 'middle', textAlign: 'center' }}>
                  <button onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'dashboard-cat', x: e.clientX, y: e.clientY, tabId: actieveTabId } })); }} title="Tabelinstellingen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M6.5 1h3l.5 2.1a5.5 5.5 0 0 1 1.8 1l2-.7 1.5 2.6-1.5 1.4a5.5 5.5 0 0 1 0 2.1l1.5 1.4-1.5 2.6-2-.7a5.5 5.5 0 0 1-1.8 1L9.5 15h-3l-.5-2.1a5.5 5.5 0 0 1-1.8-1l-2 .7L.7 10l1.5-1.4a5.5 5.5 0 0 1 0-2.1L.7 5.1l1.5-2.6 2 .7a5.5 5.5 0 0 1 1.8-1z" /><circle cx="8" cy="8" r="2.5" /></svg>
                  </button>
                </th>
                <th style={{ padding: 0, minWidth: 15, maxWidth: 15 }} />
              </tr>
            </thead>
            <tbody>
              {(() => {
                return catData.map(cat => {
                  const isOpen = openCatRijen.has(cat.categorie);
                  const heeftSubs = cat.subrijen.length > 0;
                  const toggleCat = () => setOpenCatRijen(prev => {
                    const next = new Set(prev);
                    if (next.has(cat.categorie)) next.delete(cat.categorie); else next.add(cat.categorie);
                    return next;
                  });
                  return (
                    <Fragment key={cat.categorie}>
                      <tr onClick={heeftSubs ? toggleCat : undefined} onContextMenu={e => openContextMenu(e, `ctx-cat-${cat.categorie}`, catHoofdItems(cat.categorie))} style={{ cursor: heeftSubs ? 'pointer' : 'default', borderTop: '1px solid var(--border)' }}>
                        <td style={{ paddingTop: 8, paddingBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, color: 'var(--text-h)' }}>
                            {heeftSubs && <span style={{ fontSize: 10, color: 'var(--text-dim)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>}
                            {cat.categorie}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: bedragKleur(cat.totaal), fontSize: 13 }}>{formatBedrag(cat.totaal)}</td>
                        {isAlle && <td style={{ textAlign: 'right', padding: '8px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: aantalAfgesloten > 0 ? bedragKleur(cat.totaal / aantalAfgesloten) : 'var(--text-dim)', fontSize: 13 }}>{aantalAfgesloten > 0 ? formatBedrag(cat.totaal / aantalAfgesloten) : '—'}</td>}
                        <td style={{ padding: 0, verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                          <HamburgerBtn menuKey={`h-cat-${cat.categorie}`} items={catHoofdItems(cat.categorie)} onOpen={openMenu} />
                        </td>
                        <td style={{ padding: 0, minWidth: 15, maxWidth: 15 }} />
                      </tr>
                      {isOpen && cat.subrijen.filter(sub => sub.bedrag !== 0).map(sub => {
                        const subKey = `${cat.categorie}::${sub.subcategorie}`;
                        const isSubOpen   = openCatSubRows.has(subKey);
                        const subTrxs     = catSubTrx.get(subKey) ?? [];
                        const subIsLaden  = catSubLaden.has(subKey);
                        const canExpand   = sub.subcategorie.length > 0;
                        const toggleSub = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          const willOpen = !openCatSubRows.has(subKey);
                          setOpenCatSubRows(prev => {
                            const next = new Set(prev);
                            if (next.has(subKey)) next.delete(subKey); else next.add(subKey);
                            return next;
                          });
                          if (willOpen) laadCatSubTrx(cat.categorie, sub.subcategorie);
                        };
                        return (
                          <Fragment key={subKey}>
                            <tr
                              style={{ borderBottom: 'none', cursor: canExpand ? 'pointer' : 'default' }}
                              onClick={canExpand ? toggleSub : undefined}
                              onContextMenu={e => openContextMenu(e, `ctx-cat-sub-${subKey}`, catSubMenuItems(cat.categorie, sub.subcategorie))}
                              onMouseEnter={canExpand ? e => (e.currentTarget.style.background = 'var(--bg-hover)') : undefined}
                              onMouseLeave={canExpand ? e => (e.currentTarget.style.background = '') : undefined}
                            >
                              <td style={{ paddingLeft: 32, paddingTop: 3, paddingBottom: 3, fontSize: 13, color: 'var(--text-dim)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {canExpand && <span style={{ fontSize: 9, color: 'var(--text-dim)', transition: 'transform 0.15s', transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>}
                                  {sub.subcategorie}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', padding: '3px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)', fontSize: 13 }}>{formatBedrag(sub.bedrag)}</td>
                              {isAlle && <td style={{ textAlign: 'right', padding: '3px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)', fontSize: 13 }}>{aantalAfgesloten > 0 ? formatBedrag(sub.bedrag / aantalAfgesloten) : '—'}</td>}
                              <td style={{ padding: 0, verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                <HamburgerBtn menuKey={`h-cat-sub-${subKey}`} items={catSubMenuItems(cat.categorie, sub.subcategorie)} onOpen={openMenu} />
                              </td>
                              <td style={{ padding: 0, minWidth: 15, maxWidth: 15 }} />
                            </tr>
                            {isSubOpen && (
                              <tr className="bls-expand">
                                <td colSpan={isAlle ? 5 : 4} style={{ padding: '0 8px 8px 28px' }}>
                                  {subIsLaden ? (
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 0' }}>Laden…</div>
                                  ) : subTrxs.length === 0 ? (
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 0' }}>Geen transacties gevonden.</div>
                                  ) : (
                                    <table style={{ fontSize: 11, borderCollapse: 'collapse', tableLayout: 'fixed', width: 850 }}>
                                      <colgroup>
                                        <col style={{ width: 80 }} /><col style={{ width: 160 }} /><col />
                                        <col style={{ width: 65 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} />
                                        <col style={{ width: 36 }} />
                                      </colgroup>
                                      <thead>
                                        <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                                          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Datum</th>
                                          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Naam</th>
                                          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Omschrijving</th>
                                          <th style={{ textAlign: 'right', padding: '2px 10px', fontWeight: 500 }}>Bedrag</th>
                                          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Categorie</th>
                                          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Subcategorie</th>
                                          <th style={{ width: 36 }} />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {subTrxs.map(trx => {
                                          const ck = budgettenPotjes.find(bp => bp.naam === trx.categorie)?.kleur ?? 'var(--accent)';
                                          const trxAsBls = trx as unknown as BlsTransactie;
                                          return (
                                            <tr key={trx.id} onClick={(e) => openCategoriePopupBls(trxAsBls, e)} onContextMenu={e => openContextMenu(e, `ctx-cat-sub-trx-${trx.id}`, blsSubItems(trxAsBls))} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
                                              <td
                                                style={{ padding: '2px 10px', whiteSpace: 'nowrap', color: trx.originele_datum ? 'var(--accent)' : undefined }}
                                                title={trx.originele_datum ? `Origineel geboekt op ${trx.originele_datum}` : undefined}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                  <span>{trx.datum ?? '—'}</span>
                                                  {trx.originele_datum && <Calendar size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                                                </div>
                                              </td>
                                              <td style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trx.naam_tegenpartij ?? '—'}</td>
                                              <td title={trx.omschrijving ?? undefined} style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trx.omschrijving ?? '—'}</td>
                                              <td style={{ padding: '2px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: bedragKleur(trx.bedrag ?? 0) }}>{trx.bedrag != null ? formatBedrag(trx.bedrag) : '—'}</td>
                                              <td style={{ padding: '2px 10px' }}>{trx.categorie ? <span className="badge" style={{ background: kleurBg(ck), border: `1px solid ${ck}`, color: ck }}>{trx.categorie}</span> : <span className="badge-outline-red">Ongecategoriseerd</span>}</td>
                                              <td style={{ padding: '2px 10px' }}>{trx.subcategorie ? <span className="badge-outline" style={{ borderColor: ck, color: ck }}>{trx.subcategorie}</span> : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}</td>
                                              <td style={{ width: 36, padding: 0, textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                                <HamburgerBtn menuKey={`h-cat-sub-trx-${trx.id}`} items={blsSubItems(trxAsBls)} onOpen={openMenu} />
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>);
          })()}
        </div>
      )}</div>}

      </div>; })()} {/* einde BLS + CAT wrapper */}

      {/* Floating contextmenu / hamburger menu */}
      {menuState && (
        <>
          <style>{`
            @keyframes dash-menu-in {
              from { opacity: 0; transform: scale(0.95) translateY(-4px); }
              to   { opacity: 1; transform: scale(1)    translateY(0); }
            }
            .dash-menu { animation: dash-menu-in 140ms cubic-bezier(0.16,1,0.3,1) both; }
            .dash-menu-item:hover { background: var(--accent-dim) !important; }
          `}</style>
          <div
            className="dash-menu"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: menuState.top, left: menuState.left,
              zIndex: 9000,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
              minWidth: 240,
              padding: '5px',
            }}
          >
            {menuState.items.map((item, i) => (
              <a
                key={i}
                href={item.url}
                className="dash-menu-item"
                style={{
                  display: 'block', padding: '8px 12px',
                  fontSize: 13, color: 'var(--text-h)',
                  textDecoration: 'none', cursor: 'pointer',
                  borderRadius: 7, transition: 'background 80ms',
                }}
                onClick={() => setMenuState(null)}
              >
                {item.label}
              </a>
            ))}
          </div>
        </>
      )}

      {patronModal && (
        <CategoriePopup
          patronModal={patronModal}
          setPatronModal={setPatronModal}
          onBevestig={handlePatronModalBevestig}
          onSluiten={() => setPatronModal(null)}
          onReset={() => { setPatronModal(null); herlaadBls(); }}
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
          onDatumWijzig={async (datum) => {
            const tr = patronModal.transactie;
            await fetch(`/api/transacties/${tr.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ datum_aanpassing: datum }),
            });
            herlaadBls();
          }}
          onVoegRekeningToe={() => {}}
          uniekeCategorieenDropdown={uniekeCategorieenDropdown}
          gebruikersProfiel={gebruikersProfiel}
        />
      )}
    </>
  );
}
