// FILE: TransactiesTabel.tsx
// AANGEMAAKT: 25-03-2026 12:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 22:00
//
// WIJZIGINGEN (03-04-2026 22:00):
// - URL params: categorie, subcategorie, maand, transactie verwerkt bij laden
// - subcategorieFilter state toegevoegd
// - gemarkeerdeTransactie state: highlight + scroll naar rij
// WIJZIGINGEN (02-04-2026 00:15):
// - Scrollherstel via onBevestigStart callback: positie opslaan vóór popup-sluiting en API calls
// WIJZIGINGEN (01-04-2026 23:15):
// - maakNaamChips en analyseerOmschrijvingen: minimale woordlengte verwijderd (alle woorden als chip)
// WIJZIGINGEN (01-04-2026 22:00):
// - naam_zoekwoord_raw: fallback naar t.naam_tegenpartij als geen naam-chip geselecteerd
// WIJZIGINGEN (01-04-2026 15:30):
// - Scrollherstel via requestAnimationFrame zodat DOM gerenderd is voor window.scrollTo
// WIJZIGINGEN (01-04-2026 15:00):
// - isReloadRef toegevoegd: scrollherstel alleen bij reloadTrigger, niet bij filterwijziging
// WIJZIGINGEN (01-04-2026 14:30):
// - Scrollpositie-herstel na reloadTrigger: scrollPosRef opslaan voor fetch, window.scrollTo na setTransacties
// WIJZIGINGEN (01-04-2026 01:00):
// - Twee-laags sortering: primair op geselecteerde kolom, secundair datum↔volgnummer
// - Standaard: datum desc, bij gelijke datum secundair op volgnummer desc
// WIJZIGINGEN (31-03-2026 23:30):
// - Standaard sortering op datum descending (nieuwste bovenaan)
// WIJZIGINGEN (31-03-2026 14:30):
// - CategoriePopup: periodes, onDatumWijzig, onVoegRekeningToe props meegegeven
// - handleDatumWijzig: PATCH datum + originele_datum (indien eerste keer)
// - handleVoegRekeningToe: navigeer naar /instellingen met iban + naam query params
// - Datumkolom: Calendar icoon + var(--accent) kleur als originele_datum gevuld
// WIJZIGINGEN (31-03-2026 02:30):
// - onAnalyseer fix: alle omschrijvingsvelden (1+2+3) meenemen in woordfrequentie telling
// WIJZIGINGEN (31-03-2026 02:00):
// - onAnalyseer prop toegevoegd aan CategoriePopup: woordfrequentie analyse per tegenpartij
// WIJZIGINGEN (31-03-2026 01:45):
// - Volledige tabelrij klikbaar voor CategoriePopup (onClick op tr i.p.v. individuele cellen)
// WIJZIGINGEN (31-03-2026 00:00):
// - Categorisatie popup geëxtraheerd naar CategoriePopup component (features/shared/components/)
// - PatronModalData interface verplaatst naar CategoriePopup; import type toegevoegd
// - tooltipNaam/tooltipOmschr state verwijderd (leeft nu in CategoriePopup)
// WIJZIGINGEN (30-03-2026 23:45):
// - Slotje-filterknop kleur opgehaald uit budgettenPotjes ("Aangepast" systeemitem)
// WIJZIGINGEN (30-03-2026 23:30):
// - Slotje-filterknop: inline met andere knoppen, label "🔒 Aangepast (N)", accent kleur stijl
// WIJZIGINGEN (30-03-2026 23:00):
// - Slotje-filterknop toegevoegd in categoriefilterbalk: filtert op handmatig_gecategoriseerd === 1
// WIJZIGINGEN (30-03-2026 21:30):
// - Omschrijving <td> volledig klikbaar: opent openCategoriePopup (onClick op td i.p.v. alleen toelichting div)
// WIJZIGINGEN (30-03-2026 21:00):
// - maakCategorieregel: toelichting param toegevoegd, meegegeven in POST body
// - handlePatronModalBevestig scope='alle': toelichting meegeven aan maakCategorieregel en PUT categorieregel
// WIJZIGINGEN (30-03-2026 20:15):
// - Toelichting tekst in omschrijving kolom klikbaar: opent openCategoriePopup
// WIJZIGINGEN (30-03-2026 20:00):
// - triggerHermatch: toelichting altijd meesturen als categorieId bekend is (ook bij leeg → wist toelichting)
// WIJZIGINGEN (30-03-2026 19:30):
// - Popup: toelichting verplaatst naar onder chips, boven scope-keuze
// - Popup: scope-sectie heeft nu koptekst "Toepassen op"
// WIJZIGINGEN (30-03-2026 19:00):
// - PatronModalData: toelichting veld toegevoegd
// - openCategoriePopup: toelichting pre-invullen vanuit transactie
// - handlePatronModalBevestig: toelichting meesturen bij scope='enkel' (PATCH) en scope='alle' (categoriseer bulk-update)
// - triggerHermatch: accepteert toelichting + categorieId; stuurt door naar /api/categoriseer
// - Popup: toelichting tekstveld boven bestaande inhoud
// - Omschrijving cel: toelichting tonen boven omschrijving_1 in var(--accent) kleur
// - Zoekfilter: zoekterm ook matchen op toelichting veld
// WIJZIGINGEN (30-03-2026 18:00):
// - Subcategorie <td> onClick: openCategoriePopup i.p.v. startEdit (zelfde gedrag als categorie cel)
// - openCategoriePopup: async; pre-invullen popup bij gecategoriseerde transacties (categorie, subcategorie, naam/omschrijving chips)
// WIJZIGINGEN (30-03-2026):
// - Tab-logica gebaseerd op rekening.beheerd vlag i.p.v. gekoppelde budgetten_potjes
// WIJZIGINGEN (29-03-2026 23:00):
// - Rekening-tabs boven transactiepagina: "Beheerde Rekeningen" (met gekoppelde categorie) + losse rekening-tabs
// - Transacties gefilterd op eigen_iban per actieve tab
// - BudgetPotjeNaam interface uitgebreid met rekening_id
// - Tabs alleen zichtbaar voor rekeningen met geïmporteerde transacties
// - Tabbar verborgen als er maar één tab is
//
// WIJZIGINGEN (29-03-2026 09:00):
// - containerWidth ResizeObserver: scrollWidth ipv contentRect.width; dep [klaar, laden] zodat observer start na data-load
// - tabelMinWidth gebaseerd op scrollWidth: top-scrollbalk thumb klopt nu exact met tabel scrollrange
// - tableRequiredWidth alleen updaten bij overflow (el.scrollWidth > el.clientWidth): voorkomt circulaire drempel
//
// WIJZIGINGEN (29-03-2026 08:30):
// - Actie <th>/<td> sticky: className="sticky-acties" (position sticky, right 0, bg var(--bg-card), z-index 1/2)
// - Buffer <td> verwijderd; aantalKolommen +1 i.p.v. +2
//
// WIJZIGINGEN (29-03-2026 07:30):
// - Externe actieskolom teruggedraaid; hamburgermenu terug als normale <th>/<td>
// - Lege buffer <td> (60px) na actieskolom zodat hamburgermenu volledig scrollbaar is
//
// WIJZIGINGEN (29-03-2026 07:00):
// - Tabelrij '<<< Naar maand' knop verwijderd; hamburger '<<< Naar [maand]' dynamisch gemaakt
// - Categorie dropdown merged met unieke categorieën uit transacties (/api/categorieen/uniek)
//
// WIJZIGINGEN (29-03-2026 01:00):
// - handlePatronModalBevestig: naam_tegenpartij als fallback voor naam_origineel wanneer null
// - maakNaamChips / analyseerOmschrijvingen: koppelteken verwijderd als splitsingsteken
// - categorie filterknoppen: teller toegevoegd per categorie, ongecategoriseerd en totaal
// - categorieFilter reset-useEffect verwijderd; filters werken nu onafhankelijk van elkaar
// - handleJaarSelectie: maand reset verwijderd bij jaar wissel
// - patronModal: geen standaard naam chip selectie bij openen
// - patronModal: labels hernoemd naar "Match op naam/omschrijving (optioneel)"
// - patronModal: ⓘ tooltip toegevoegd bij beide chip-secties
// - patronModal: omschrijving tooltip display:none → visibility/opacity fix; stijl + positie gelijkgetrokken
// - patronModal: tooltips herschreven naar React state (onMouseEnter/Leave); CSS-regel verwijderd
// - scope 'enkel': geen maakCategorieregel/PUT meer; alleen PATCH transactie met categorie+subcategorie
// - vindMatchendeRegelId: strict match op iban + naam_zoekwoord + omschrijving_zoekwoord
// - chip keys: index suffix toegevoegd om duplicaat-key warnings te voorkomen
// - patronModal: tooltip stijl verbeterd; positie onder ⓘ, donkere achtergrond, box-shadow
// - maakNaamChips / analyseerOmschrijvingen: chip waarde regex /[^a-z0-9&]/g → /[^a-z0-9&-]/g
// - maakCategorieregel: console.error met status + body alleen bij fout (was altijd)
//
// WIJZIGINGEN (28-03-2026 00:00):
// - Omboekingen klikbaar voor categorisatie (zelfde flow als ongecategoriseerde transacties)
// - Altijd volledige popup flow (patronModal) — categorieModal en GEVAL 2 verwijderd
// - openCategoriePopup: gecategoriseerde transacties gaan direct naar patronModal (geen tussenliggende select)
// - patronModal: categorie dropdown toegevoegd boven subcategorie (aanpasbaar, herlaadt subcatOpties)
// - patronModal: categorie start leeg (placeholder), "— Geen categorie —" wist categorie, "Nieuwe categorie..." tekstveld
// - patronModal: subcategorie placeholder + "— Geen subcategorie —" als expliciete keuze
// - handlePatronModalBevestig: '__geen__' categorie → categorie_id null + status nieuw
// - handlePatronModalBevestig: '__geen__' + alle → DELETE matchende categorieregel + hermatch
// - handlePatronModalBevestig: catNieuw → POST budgetten-potjes, upsert categorieregel (PUT/POST)
// - patronModal: rekening dropdown bij nieuwe of gewijzigde categorie

'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Calendar, Filter, Settings, CheckSquare } from 'lucide-react';
import Modal from '@/components/Modal';
import AlgemeneInstellingen from '@/features/instellingen/components/AlgemeneInstellingen';
import { useSidebar } from '@/lib/sidebar-context';
import type { TransactieType } from '@/lib/schema';
import type { TransactieMetCategorie } from '@/lib/transacties';
import type { Periode } from '@/lib/maandperiodes';
import { kiesStartPeriode } from '@/lib/kiesStartPeriode';
import { TypeLabel } from '@/features/shared/components/TypeLabel';
import CategoriePopup from '@/features/shared/components/CategoriePopup';
import BulkCategoriePopup from '@/features/transacties/components/BulkCategoriePopup';
import type { PatronModalData } from '@/features/shared/components/CategoriePopup';
import { maakNaamChips, analyseerOmschrijvingen } from '@/features/shared/utils/naamChips';
import { buildCategoriePopupData, bevestigCategorisatie } from '@/features/transacties/utils/categorisatieHelpers';
import { formatBedrag, formatDatum } from '@/features/shared/utils/format';
import { metActie } from '@/lib/actie';
import MaandFilter from '@/components/MaandFilter';

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; type?: string; kleur?: string | null; kleur_auto?: number; }
interface RekeningGroep { id: number; naam: string; volgorde: number; rekening_ids: number[]; }


const TYPE_LABELS: Record<string, string> = {
  'normaal-af':    'Normaal - AF',
  'normaal-bij':   'Normaal - BIJ',
  'omboeking-af':  'Omboeking - AF',
  'omboeking-bij': 'Omboeking - BIJ',
};

const ALLE_KOLOMMEN = [
  { id: 'datum',                   label: 'Datum',                standaard: true  },
  { id: 'iban_bban',               label: 'IBAN eigen rekening',  standaard: true  },
  { id: 'tegenrekening_iban_bban', label: 'IBAN tegenrekening',   standaard: true  },
  { id: 'naam_tegenpartij',        label: 'Naam tegenpartij',     standaard: true  },
  { id: 'bedrag',                  label: 'Bedrag',               standaard: true  },
  { id: 'type',                    label: 'Type',                 standaard: true  },
  { id: 'categorie',               label: 'Categorie',            standaard: true  },
  { id: 'subcategorie',            label: 'Subcategorie',         standaard: true  },
  { id: 'omschrijving_1',          label: 'Omschrijving',         standaard: true  },
  { id: 'rentedatum',              label: 'Rentedatum',           standaard: false },
  { id: 'saldo_na_trn',            label: 'Saldo na transactie',  standaard: false },
  { id: 'datum_aanpassing',        label: 'Aangepaste datum',     standaard: false },
  { id: 'transactiereferentie',    label: 'Transactiereferentie', standaard: false },
  { id: 'omschrijving_2',          label: 'Omschrijving-2',       standaard: false },
  { id: 'omschrijving_3',          label: 'Omschrijving-3',       standaard: false },
];

const DEFAULT_KOLOMMEN = new Set(ALLE_KOLOMMEN.filter(k => k.standaard).map(k => k.id));


function kleurBg(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return 'var(--accent-dim)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.15)`;
}

const filterKnopStijl = (actief: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  border: '1px solid var(--border)',
  background: actief ? 'var(--accent)' : 'var(--bg-card)',
  color: actief ? '#fff' : 'var(--text)',
  fontWeight: actief ? 600 : 400,
});


export default function TransactiesTabel() {
  const [klaar, setKlaar]                               = useState(false);
  const [geavanceerdeFilters, setGeavanceerdeFilters]   = useState<{ typen: TransactieType[]; datumVan: string; datumTot: string; bedragMin: string; bedragMax: string; aangepast: boolean }>({ typen: [], datumVan: '', datumTot: '', bedragMin: '', bedragMax: '', aangepast: false });
  const [filterModalOpen, setFilterModalOpen]           = useState(false);
  // Bulk-selectie (Aangepast-categorisatie). Default uit; toggle-knop tussen
  // trechter en tandwiel zet hem aan. Klik = enkel, Ctrl+klik = toggle,
  // Shift+klik = range vanaf laatst-aangeklikte (zoals Windows Verkenner).
  const [selectieModus, setSelectieModus]                = useState(false);
  const [geselecteerdeIds, setGeselecteerdeIds]          = useState<Set<number>>(new Set());
  const [laatstGeklikteId, setLaatstGeklikteId]          = useState<number | null>(null);
  const [bulkPopupOpen, setBulkPopupOpen]                = useState(false);
  const bulkToolbarRef                                   = useRef<HTMLDivElement | null>(null);
  const [bulkToolbarZichtbaar, setBulkToolbarZichtbaar]  = useState(true);
  const [categorieFilter, setCategorieFilter]           = useState<string | 'alle'>('alle');
  const [sortCol, setSortCol]                           = useState<string>('datum');
  const [sortDir, setSortDir]                           = useState<'asc' | 'desc'>('desc');
  const [periodes, setPeriodes]                         = useState<Periode[]>([]);
  const [geselecteerdePeriode, setGeselecteerdePeriode] = useState<Periode | null>(null);
  const [geselecteerdJaar, setGeselecteerdJaar]         = useState<number>(new Date().getFullYear());
  const [alleJaren, setAlleJaren]                       = useState(false);
  const [transacties, setTransacties]                   = useState<TransactieMetCategorie[]>([]);
  const [laden, setLaden]                               = useState(false);
  const [fout, setFout]                                 = useState<string | null>(null);
  const [budgettenPotjes, setBudgettenPotjes]           = useState<BudgetPotjeNaam[]>([]);
  const [rekeningen, setRekeningen]                     = useState<Rekening[]>([]);
  const [, setSubcatOpties]                             = useState<string[]>([]);
  const [alleSubcatMap, setAlleSubcatMap]               = useState<Record<string, { naam: string; inActieveRegel: boolean }[]>>({});
  const [reloadTrigger, setReloadTrigger]               = useState(0);
  const [lookupReload, setLookupReload]                 = useState(0);

  // Globaal data-changed event (bv. na undo via UndoSnackbar) — herfetch
  // zonder pagina-reload zodat filters en scroll behouden blijven.
  useEffect(() => {
    const handler = () => setReloadTrigger(n => n + 1);
    window.addEventListener('fbs:data-changed', handler);
    return () => window.removeEventListener('fbs:data-changed', handler);
  }, []);

  const [zichtbareKolommen, setZichtbareKolommen]       = useState<Set<string>>(DEFAULT_KOLOMMEN);
  const [gebruikersProfiel, setGebruikersProfiel]       = useState<'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null>(null);
  const [kolomMenuOpen, setKolomMenuOpen]               = useState(false);
  const [zoekterm, setZoekterm]                         = useState('');
  const [actieveTab, setActieveTab]                     = useState<string>('');
  // Wanneer de gebruiker via /transacties?ongecategoriseerd=1 binnenkomt
  // (vanaf import-totalenblok) overschrijven we het tab-filter zodat alle
  // ongecategoriseerde transacties zichtbaar worden, ongeacht in welke
  // rekening/groep-tab ze vallen. Reset zodra de gebruiker handmatig een
  // tab kiest of het categorie-filter wisselt — dan keert tab-scoping terug.
  const [tabBypass, setTabBypass]                       = useState<boolean>(false);
  const [rekeningGroepen, setRekeningGroepen]           = useState<RekeningGroep[]>([]);
  const [geconfigureerdeTabs, setGeconfigureerdeTabs]   = useState<{ id: number; type: 'groep' | 'rekening'; entiteit_id: number; naam: string }[]>([]);
  const [tabsGeladen, setTabsGeladen]                   = useState(false);
const [patronModal, setPatronModal]                   = useState<PatronModalData | null>(null);
  const [uniekeCategorieenDropdown, setUniekeCategorieenDropdown] = useState<string[]>([]);
  const [subcategorieFilter, setSubcategorieFilter]   = useState<string | null>(null);
  const [gemarkeerdeTransactie, setGemarkeerdeTransactie] = useState<number | null>(null);
  const [maandStartModalOpen, setMaandStartModalOpen]     = useState(false);
  const gemarkeerdeRef                                 = useRef<HTMLTableRowElement | null>(null);
  const scrolledToRef                                  = useRef<number | null>(null);
  const scrollPosRef                                     = useRef(0);
  const isReloadRef                                      = useRef(false);
  const topScrollRef                                    = useRef<HTMLDivElement>(null);
  const tableWrapperRef                                 = useRef<HTMLDivElement>(null);
  const syncingRef                                      = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const { setTableRequiredWidth } = useSidebar();

  // Stap 1: laad periodes op mount, stel actuele in als standaard; verwerk URL params
  useEffect(() => {
    fetch('/api/periodes')
      .then(r => r.ok ? r.json() : [])
      .then((ps: Periode[]) => {
        setPeriodes(ps);
        const sp = new URLSearchParams(window.location.search);
        const catParam          = sp.get('categorie');
        const subParam          = sp.get('subcategorie');
        const maandParam        = sp.get('maand');
        const trxParam          = sp.get('transactie');
        const ongecategoriseerd = sp.get('ongecategoriseerd') === '1';

        if (ongecategoriseerd) {
          const actueel = kiesStartPeriode(ps);
          setGeselecteerdJaar(actueel?.jaar ?? new Date().getFullYear());
          setAlleJaren(true);
          setGeselecteerdePeriode(null);
          setCategorieFilter('ongecategoriseerd');
          setTabBypass(true);
          setKlaar(true);
          return;
        }

        let actueel: Periode | null = null;
        if (maandParam) {
          const [jaar, maandNr] = maandParam.split('-').map(Number);
          actueel = ps.find(p => p.jaar === jaar && p.maand === maandNr) ?? null;
          if (actueel) setGeselecteerdJaar(jaar);
        }
        if (!actueel) actueel = kiesStartPeriode(ps);
        setGeselecteerdePeriode(actueel);
        if (!maandParam) setGeselecteerdJaar(actueel?.jaar ?? new Date().getFullYear());

        if (catParam) setCategorieFilter(catParam);
        if (subParam) setSubcategorieFilter(subParam);
        if (trxParam) setGemarkeerdeTransactie(parseInt(trxParam, 10));
        setKlaar(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev: open CategoriePopup via ?devpopup=1
  useEffect(() => {
    if (!klaar) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('devpopup') !== '1') return;
    const dummy: TransactieMetCategorie = {
      id: 0, import_id: 0, iban_bban: null, munt: null, bic: null, volgnummer: null,
      datum: new Date().toISOString().slice(0, 10), rentedatum: null, bedrag: -42.00,
      saldo_na_trn: null, tegenrekening_iban_bban: null, naam_tegenpartij: 'Dev Tegenpartij',
      naam_uiteindelijke_partij: null, naam_initierende_partij: null, bic_tegenpartij: null,
      code: null, batch_id: null, transactiereferentie: null, machtigingskenmerk: null,
      incassant_id: null, betalingskenmerk: null, omschrijving_1: 'Dev omschrijving', omschrijving_2: null,
      omschrijving_3: null, reden_retour: null, oorspr_bedrag: null, oorspr_munt: null, koers: null,
      type: 'normaal-af', datum_aanpassing: null, categorie_id: null, status: 'nieuw',
      handmatig_gecategoriseerd: 0, bevroren: 0, fout_geboekt: 0, toelichting: null, categorie: null,
      subcategorie: null, regel_bedrag_min: null, regel_bedrag_max: null,
      rekening_naam: null, tegenrekening_naam: null, is_nieuw: 0,
    };
    const naamChips = maakNaamChips(dummy.naam_tegenpartij);
    const chips = analyseerOmschrijvingen(dummy);
    setPatronModal({ transactie: dummy, toelichting: '', nieuweCat: '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [], subcatNieuw: false, naamChips, gekozenNaamChips: [], chips, gekozenWoorden: [], scope: 'alle', bedragMin: null, bedragMax: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaar]);

  // Herstel scrollpositie na reloadTrigger
  useEffect(() => {
    if (isReloadRef.current) {
      const pos = scrollPosRef.current;
      requestAnimationFrame(() => {
        window.scrollTo(0, pos);
        isReloadRef.current = false;
      });
    }
  }, [transacties]);

  // Scroll naar gemarkeerde transactie (eenmalig)
  useEffect(() => {
    if (!gemarkeerdeTransactie || scrolledToRef.current === gemarkeerdeTransactie) return;
    if (gemarkeerdeRef.current) {
      scrolledToRef.current = gemarkeerdeTransactie;
      requestAnimationFrame(() => {
        gemarkeerdeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  });

  // Stap 2: laad transacties zodra periodes gereed zijn, of bij filterwijziging
  const isHerladen = useRef(false);
  useEffect(() => {
    if (!klaar) return;
    const herladen = reloadTrigger > 0 && transacties.length > 0;
    isHerladen.current = herladen;
    if (!herladen) setLaden(true);
    setFout(null);
    const queryParts: string[] = [];
    if (!alleJaren) {
      if (geselecteerdePeriode) {
        queryParts.push(`datum_van=${geselecteerdePeriode.start}`);
        queryParts.push(`datum_tot=${geselecteerdePeriode.eind}`);
      } else {
        queryParts.push(`datum_van=${geselecteerdJaar}-01-01`);
        queryParts.push(`datum_tot=${geselecteerdJaar}-12-31`);
      }
    } else if (geselecteerdePeriode) {
      queryParts.push(`maand_nr=${geselecteerdePeriode.maand}`);
    }
    const url = queryParts.length > 0
      ? `/api/transacties?${queryParts.join('&')}`
      : '/api/transacties';
    fetch(url, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('Laden mislukt.');
        return r.json() as Promise<TransactieMetCategorie[]>;
      })
      .then(data => { setTransacties(data); setLaden(false); isHerladen.current = false; })
      .catch(err  => { setFout(err.message); setLaden(false); isHerladen.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaar, geselecteerdePeriode, geselecteerdJaar, alleJaren, reloadTrigger]);

  // Laad lookup/metadata in één gebundelde fetch (was 6 losse calls).
  // Subcat-opties (datalist) komen ook uit dit pakket — vervangt de aparte
  // /api/categorieen fetch verderop.
  useEffect(() => {
    fetch('/api/lookup-data')
      .then(r => r.ok ? r.json() : null)
      .then((d: {
        budgettenPotjes?: typeof budgettenPotjes | null;
        rekeningen?: typeof rekeningen | null;
        rekeningGroepen?: typeof rekeningGroepen | null;
        transactieTabs?: typeof geconfigureerdeTabs | null;
        uniekeCategorieen?: string[] | null;
        subcategorieen?: { categorie: string; naam: string; inActieveRegel: boolean }[] | null;
      } | null) => {
        if (!d) return;
        setBudgettenPotjes(d.budgettenPotjes ?? []);
        setRekeningen(d.rekeningen ?? []);
        setRekeningGroepen(d.rekeningGroepen ?? []);
        setGeconfigureerdeTabs(d.transactieTabs ?? []);
        setTabsGeladen(true);
        setUniekeCategorieenDropdown(d.uniekeCategorieen ?? []);
        const subs = d.subcategorieen ?? [];
        const map: Record<string, { naam: string; inActieveRegel: boolean }[]> = {};
        for (const s of subs) (map[s.categorie] ??= []).push({ naam: s.naam, inActieveRegel: s.inActieveRegel });
        setAlleSubcatMap(map);
        setSubcatOpties(Array.from(new Set(subs.map(s => s.naam))).sort());
      });
  }, [lookupReload]);

  // Default tab instellen op eerste geconfigureerde tab
  useEffect(() => {
    if (actieveTab || geconfigureerdeTabs.length === 0) return;
    const eerste = geconfigureerdeTabs[0];
    if (eerste.type === 'groep') { setActieveTab(`groep:${eerste.entiteit_id}`); return; }
    const rek = rekeningen.find(r => r.id === eerste.entiteit_id);
    if (rek) setActieveTab(rek.iban);
  }, [actieveTab, geconfigureerdeTabs, rekeningen]);

  // Breedte van de tabel-container observeren (voor dynamische min-width scrollbalk)
  // scrollWidth ipv contentRect.width: top-scrollbar krijgt exact dezelfde scrollrange als de tabel
  // Dependency op klaar: tableWrapperRef.current is null op mount (tabel in conditional)
  useEffect(() => {
    if (!tableWrapperRef.current) return;
    const el = tableWrapperRef.current;
    const obs = new ResizeObserver(() => {
      setContainerWidth(el.scrollWidth);
      setHasOverflow(el.scrollWidth > el.clientWidth);
      if (el.scrollWidth > el.clientWidth) setTableRequiredWidth(el.scrollWidth);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [klaar, laden]);

  // Refresh subcat-opties + uniekeCategorieen na een categoriseer-actie
  // (initiële load gebeurt via /api/lookup-data hierboven).
  useEffect(() => {
    if (!reloadTrigger) return;
    fetch('/api/subcategorieen?volledig=1')
      .then(r => r.ok ? r.json() : [])
      .then((subs: { categorie: string; naam: string; inActieveRegel: boolean }[]) => {
        const map: Record<string, { naam: string; inActieveRegel: boolean }[]> = {};
        for (const s of subs) (map[s.categorie] ??= []).push({ naam: s.naam, inActieveRegel: s.inActieveRegel });
        setAlleSubcatMap(map);
        setSubcatOpties(Array.from(new Set(subs.map(s => s.naam))).sort());
      });
  }, [reloadTrigger]);

  // Laad kolomkeuze uit instellingen (DB) op mount — DIR-21: voorkeur moet meekomen met backup/restore.
  useEffect(() => {
    let actief = true;
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then((inst: { transactieKolommen: string[] | null; gebruikersProfiel: 'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null } | null) => {
        if (!actief) return;
        if (inst?.transactieKolommen) setZichtbareKolommen(new Set(inst.transactieKolommen));
        setGebruikersProfiel(inst?.gebruikersProfiel ?? null);
      })
      .catch(() => { /* instelling kan ontbreken; default staat */ });
    return () => { actief = false; };
  }, []);

  // Sluit kolommenmenu bij klik buiten
  useEffect(() => {
    if (!kolomMenuOpen) return;
    function handleClick() { setKolomMenuOpen(false); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [kolomMenuOpen]);

  async function openCategoriePopup(t: TransactieMetCategorie) {
    setPatronModal(await buildCategoriePopupData(t));
  }


  function slaScrollOpVoorHerstel() {
    scrollPosRef.current = window.scrollY;
    isReloadRef.current = true;
  }

  // Houd in de gaten of de bulk-toolbar onder de zoekbalk in beeld is. Zo niet,
  // tonen we een floating-bottom variant zodat de actie-knoppen altijd bij de hand zijn.
  useEffect(() => {
    if (!selectieModus) { setBulkToolbarZichtbaar(true); return; }
    const el = bulkToolbarRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setBulkToolbarZichtbaar(entry.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [selectieModus]);

  // Klik buiten de tabel / selectie-banner schakelt selectiemodus uit.
  // Elementen met data-selectie-behouden blijven ongemoeid (popup, floating banner).
  useEffect(() => {
    if (!selectieModus) return;
    function handler(e: MouseEvent) {
      if (bulkPopupOpen) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (tableWrapperRef.current?.contains(target)) return;
      if (bulkToolbarRef.current?.contains(target)) return;
      if (target.closest('[data-selectie-behouden]')) return;
      setSelectieModus(false);
      setGeselecteerdeIds(new Set());
      setLaatstGeklikteId(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectieModus, bulkPopupOpen]);

  // Selectie-handler in selectiemodus: klik = enkel, Ctrl = toggle, Shift = range
  // vanaf laatst-aangeklikte t/m huidige rij in de huidige (gefilterde+gesorteerde) lijst.
  function handleSelectieKlik(id: number, e: React.MouseEvent) {
    if (e.shiftKey) e.preventDefault();
    if (e.shiftKey && laatstGeklikteId !== null) {
      const ids = gesorteerdeTransacties.map(t => t.id);
      const startIdx = ids.indexOf(laatstGeklikteId);
      const endIdx = ids.indexOf(id);
      if (startIdx === -1 || endIdx === -1) {
        setGeselecteerdeIds(new Set([id]));
        setLaatstGeklikteId(id);
        return;
      }
      const [a, b] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      setGeselecteerdeIds(new Set(ids.slice(a, b + 1)));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setGeselecteerdeIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLaatstGeklikteId(id);
      return;
    }
    setGeselecteerdeIds(new Set([id]));
    setLaatstGeklikteId(id);
  }

  async function handleBulkBevestig(categorie: string, subcategorie: string, toelichting: string, maakRegels: boolean) {
    const ids = [...geselecteerdeIds];
    if (ids.length === 0) return;
    slaScrollOpVoorHerstel();
    setBulkPopupOpen(false);

    const geselecteerdeTrx = tabTransacties.filter(t => geselecteerdeIds.has(t.id));
    // Dedupliceer op (iban, naam): zelfde tegenrekening + zelfde naam → 1 regel.
    const regelReprs = maakRegels
      ? (() => {
          const map = new Map<string, typeof geselecteerdeTrx[0]>();
          for (const t of geselecteerdeTrx) {
            const naam = (t.naam_tegenpartij ?? '').trim();
            if (!naam) continue;
            const sleutel = `${t.tegenrekening_iban_bban ?? ''}|${naam}`;
            if (!map.has(sleutel)) map.set(sleutel, t);
          }
          return [...map.values()];
        })()
      : [];
    const vandaag = new Date().toISOString().slice(0, 10);

    const aantalIds = ids.length;
    const catLabel = `${categorie}${subcategorie ? ' › ' + subcategorie : ''}`;
    const beschrijving = maakRegels && regelReprs.length > 0
      ? `${regelReprs.length} categorieregel${regelReprs.length === 1 ? '' : 's'} aangemaakt — ${catLabel}`
      : `${aantalIds} transactie${aantalIds === 1 ? '' : 's'} gecategoriseerd als ${catLabel}`;

    await metActie(async () => {
      // 1. Per unieke (iban, naam) combinatie een regel aanmaken.
      //    laatste_gebruik = vandaag zodat regels niet meteen worden gearchiveerd.
      for (const repr of regelReprs) {
        const naam = (repr.naam_tegenpartij ?? '').trim();
        try {
          await fetch('/api/categorieen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              iban: repr.tegenrekening_iban_bban ?? null,
              naam_origineel: naam,
              naam_zoekwoord_raw: naam,
              categorie,
              subcategorie: subcategorie || null,
              toelichting: toelichting || null,
              type: repr.type ?? 'alle',
              laatste_gebruik: vandaag,
            }),
          });
        } catch { /* silent: volgende naam */ }
      }

      // 2. Bulk-categoriseer alleen wanneer er GEEN regels zijn aangemaakt.
      //    Bij maakRegels=true categoriseert stap 3 de transacties via de
      //    nieuwe regels — zou hier ook markeren als handmatig_gecategoriseerd=1
      //    dubbel registreren.
      if (!maakRegels) {
        const res = await fetch('/api/transacties/bulk-categoriseer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, categorie, subcategorie, toelichting: toelichting || null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setFout(d.error ?? 'Bulk-categorisatie mislukt.');
          return;
        }
      }

      // 3. Hermatch binnen dezelfde actie zodat undo de regel-creates én de
      //    transactie-updates samen terugdraait (fetch-wrapper neemt
      //    x-actie-id mee). Synchroon awaiten zodat de snackbar pas
      //    verschijnt nadat de complete actie geregistreerd is.
      if (maakRegels && regelReprs.length > 0) {
        await fetch('/api/categoriseer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }
    }, { beschrijving });

    setGeselecteerdeIds(new Set());
    setLaatstGeklikteId(null);
    setSelectieModus(false);
    slaScrollOpVoorHerstel();
    setReloadTrigger(n => n + 1);
  }

  async function handlePatronModalBevestig() {
    if (!patronModal) return;
    slaScrollOpVoorHerstel();
    const snap = patronModal;
    setPatronModal(null);
    // Optimistic: lokale state direct bijwerken zodat de rij meteen verdwijnt/wijzigt.
    // Bij fout: setReloadTrigger forceert een fetch zodat de UI weer de server-staat reflecteert.
    setTransacties(prev => prev.map(tr => {
      if (tr.id !== snap.transactie.id) return tr;
      if (snap.nieuweCat === '__geen__') return { ...tr, status: 'nieuw' as const, categorie: null, subcategorie: null, handmatig_gecategoriseerd: 0 };
      if (!snap.nieuweCat) return tr;
      return { ...tr, status: 'verwerkt' as const, categorie: snap.nieuweCat.trim(), subcategorie: snap.subcategorie && snap.subcategorie !== '__geen__' ? snap.subcategorie : null, handmatig_gecategoriseerd: snap.scope === 'enkel' ? 1 : 0 };
    }));
    const beschrijving = snap.nieuweCat === '__geen__'
      ? 'Categorisatie verwijderd'
      : `Transactie gecategoriseerd als ${snap.nieuweCat}${snap.subcategorie && snap.subcategorie !== '__geen__' ? ' › ' + snap.subcategorie : ''}`;
    try {
      const { hermatch } = await metActie(() => bevestigCategorisatie(snap), { beschrijving });
      setReloadTrigger(n => n + 1);
      // Bij een nieuw aangemaakte categorie: lookup-data herladen zodat de
      // auto-toegekende kleur uit budgetten_potjes direct in badges verschijnt
      // (anders blauwe default-kleur tot volgende refresh).
      if (snap.catNieuw) setLookupReload(n => n + 1);
      if (hermatch) hermatch.then(() => { slaScrollOpVoorHerstel(); setReloadTrigger(n => n + 1); });
    } catch (err) {
      // Rollback van optimistic update: forceer reload zodat server-state weer leidend is.
      setReloadTrigger(n => n + 1);
      const bericht = err instanceof Error ? err.message : 'Onbekende fout.';
      alert(`Categoriseren mislukt: ${bericht}\n\nDe wijziging is teruggedraaid.`);
    }
  }

  function syncScroll(source: 'top' | 'table') {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (source === 'top' && tableWrapperRef.current && topScrollRef.current) {
      tableWrapperRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    } else if (source === 'table' && topScrollRef.current && tableWrapperRef.current) {
      topScrollRef.current.scrollLeft = tableWrapperRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { syncingRef.current = false; });
  }

  const tabTransacties = (() => {
    if (tabBypass) return transacties;
    if (actieveTab.startsWith('groep:')) {
      const groepId = Number(actieveTab.slice(6));
      const groep = rekeningGroepen.find(g => g.id === groepId);
      if (!groep) return [];
      const groepIbans = new Set(rekeningen.filter(r => groep.rekening_ids.includes(r.id)).map(r => r.iban));
      return transacties.filter(t => groepIbans.has(t.iban_bban ?? ''));
    }
    return transacties.filter(t => t.iban_bban === actieveTab);
  })();

  function handleJaarSelectie(jaar: number) {
    setAlleJaren(false);
    setGeselecteerdJaar(jaar);
    setGeselecteerdePeriode(null);
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

  // Unieke categorieën uit huidige gefilterde transacties (voor categorie-filterrij)
  const uniekeCategorieën = Array.from(
    new Set(tabTransacties.map(t => t.categorie).filter((c): c is string => c !== null))
  ).sort((a, b) => a.localeCompare(b, 'nl'));
  const categorieTellers: Record<string, number> = {};
  for (const t of tabTransacties) {
    if (t.categorie) categorieTellers[t.categorie] = (categorieTellers[t.categorie] ?? 0) + 1;
  }
  const ongecategoriseerdTeller = tabTransacties.filter(t => !t.categorie || t.status === 'nieuw').length;


  // Kolommen toggle helper — persisteer naar instellingen (DB) zodat keuze syncet tussen apparaten.
  function toggleKolom(id: string, aan: boolean) {
    setZichtbareKolommen(prev => {
      const next = new Set(prev);
      if (aan) next.add(id); else next.delete(id);
      const lijst = [...next];
      fetch('/api/instellingen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactieKolommen: lijst }),
      }).catch(() => { /* UI blijft in sync; persist mag stilletjes falen */ });
      return next;
    });
  }

  // Client-side categorie-filter + zoekfilter + geavanceerde filters toepassen
  const geavanceerdeFiltersActief = geavanceerdeFilters.typen.length > 0 || !!subcategorieFilter || !!geavanceerdeFilters.datumVan || !!geavanceerdeFilters.datumTot || !!geavanceerdeFilters.bedragMin || !!geavanceerdeFilters.bedragMax || geavanceerdeFilters.aangepast;
  const gefilterdeTransacties = (
    categorieFilter === 'alle'
      ? tabTransacties
      : categorieFilter === 'ongecategoriseerd'
        ? tabTransacties.filter(t => !t.categorie || t.status === 'nieuw')
        : tabTransacties.filter(t => t.categorie === categorieFilter)
  ).filter(t => {
    if (subcategorieFilter && (t.subcategorie ?? '') !== subcategorieFilter) return false;
    if (geavanceerdeFilters.aangepast && t.handmatig_gecategoriseerd !== 1) return false;
    if (geavanceerdeFilters.typen.length > 0 && !geavanceerdeFilters.typen.includes(t.type as TransactieType)) return false;
    const effectiefDatum = t.datum_aanpassing ?? t.datum ?? '';
    if (geavanceerdeFilters.datumVan && effectiefDatum < geavanceerdeFilters.datumVan) return false;
    if (geavanceerdeFilters.datumTot && effectiefDatum > geavanceerdeFilters.datumTot) return false;
    if (geavanceerdeFilters.bedragMin && t.bedrag !== null && t.bedrag < parseFloat(geavanceerdeFilters.bedragMin)) return false;
    if (geavanceerdeFilters.bedragMax && t.bedrag !== null && t.bedrag > parseFloat(geavanceerdeFilters.bedragMax)) return false;
    if (!zoekterm) return true;
    const q = zoekterm.toLowerCase();
    const bedragStr = t.bedrag != null ? t.bedrag.toFixed(2).replace('.', ',') : '';
    return (
      t.naam_tegenpartij?.toLowerCase().includes(q) ||
      t.omschrijving_1?.toLowerCase().includes(q) ||
      t.tegenrekening_iban_bban?.toLowerCase().includes(q) ||
      t.toelichting?.toLowerCase().includes(q) ||
      bedragStr.includes(q)
    );
  });

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const gesorteerdeTransacties = [...gefilterdeTransacties].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortCol] ?? '';
    const bv = (b as unknown as Record<string, unknown>)[sortCol] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'nl');
    if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
    // Tweede laag: bij datum-sortering op volgnummer, bij overige op datum
    if (sortCol === 'datum') {
      const va = String((a as unknown as Record<string, unknown>)['volgnummer'] ?? '');
      const vb = String((b as unknown as Record<string, unknown>)['volgnummer'] ?? '');
      return sortDir === 'asc' ? va.localeCompare(vb, 'nl') : vb.localeCompare(va, 'nl');
    }
    const da = String((a as unknown as Record<string, unknown>)['datum'] ?? '');
    const db2 = String((b as unknown as Record<string, unknown>)['datum'] ?? '');
    return sortDir === 'asc' ? da.localeCompare(db2, 'nl') : db2.localeCompare(da, 'nl');
  });

  if (tabsGeladen && geconfigureerdeTabs.length === 0) {
    return (
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <p className="empty">Geen tabbladen geconfigureerd. Voeg rekeningen of groepen toe via <a href="/instellingen#transacties-tabs" style={{ color: 'var(--accent)' }}>Instellingen → Transacties instellingen</a>.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {/* Rekening-tabs */}
      {(() => {
        const tabItems: { key: string; naam: string }[] = geconfigureerdeTabs.flatMap(t => {
              if (t.type === 'groep') return [{ key: `groep:${t.entiteit_id}`, naam: t.naam }];
              const rek = rekeningen.find(r => r.id === t.entiteit_id);
              return rek ? [{ key: rek.iban, naam: t.naam }] : [];
            });
        if (tabItems.length <= 1) return null;
        return (
          <div style={{ display: 'flex', marginBottom: 16, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
            {tabItems.map(tab => {
              const actief = actieveTab === tab.key;
              return (
                <button key={tab.key} onClick={() => { setTabBypass(false); setActieveTab(tab.key); }}
                  style={{
                    padding: '10px 16px', fontSize: 14, cursor: 'pointer',
                    background: actief ? 'var(--bg-card)' : 'transparent',
                    color: actief ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: actief ? 600 : 400,
                    border: 'none',
                    borderBottom: actief ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -2,
                  }}
                >
                  {tab.naam}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Categorie-filterrij */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => { setTabBypass(false); setCategorieFilter('alle'); }} style={filterKnopStijl(categorieFilter === 'alle')}>
          Alle categorieën ({tabTransacties.length})
        </button>
        {uniekeCategorieën.map(cat => {
          const kleur = budgettenPotjes.find(bp => bp.naam === cat)?.kleur ?? undefined;
          const actief = categorieFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => { setTabBypass(false); setCategorieFilter(cat); }}
              style={{
                ...filterKnopStijl(actief),
                background: actief ? (kleur ?? 'var(--accent)') : 'var(--bg-card)',
                borderColor: kleur ?? 'var(--border)',
                color: actief ? '#fff' : (kleur ?? 'var(--text)'),
              }}
            >
              {cat} ({categorieTellers[cat] ?? 0})
            </button>
          );
        })}
        {ongecategoriseerdTeller > 0 && (
          <button
            onClick={() => setCategorieFilter('ongecategoriseerd')}
            style={{
              ...filterKnopStijl(categorieFilter === 'ongecategoriseerd'),
              background: categorieFilter === 'ongecategoriseerd' ? 'var(--red)' : 'var(--bg-card)',
              borderColor: 'var(--red)',
              color: categorieFilter === 'ongecategoriseerd' ? '#fff' : 'var(--red)',
            }}
          >
            Ongecategoriseerd ({ongecategoriseerdTeller})
          </button>
        )}
      </div>

      <div data-onboarding="transacties-maandfilter" style={{ marginBottom: 20 }}>
        <MaandFilter
          periodes={periodes}
          geselecteerdJaar={geselecteerdJaar}
          geselecteerdePeriode={geselecteerdePeriode}
          onJaarChange={handleJaarSelectie}
          onPeriodeChange={setGeselecteerdePeriode}
          toonAlleJaren
          alleJarenActief={alleJaren}

          onAlleJaren={() => { setAlleJaren(true); setGeselecteerdePeriode(null); }}
        />
      </div>

      {/* Zoekbalk + kolommen knop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Zoek op naam, omschrijving of IBAN…"
            value={zoekterm}
            onChange={e => setZoekterm(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 32px 6px 10px',
              fontSize: 13,
              color: 'var(--text-h)',
              outline: 'none',
            }}
          />
          {zoekterm && (
            <button
              onClick={() => setZoekterm('')}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        <button
          onClick={() => setFilterModalOpen(true)}
          title="Geavanceerde filters"
          style={{
            background: geavanceerdeFiltersActief ? 'var(--accent)' : 'var(--bg-card)',
            border: `1px solid ${geavanceerdeFiltersActief ? 'var(--accent)' : 'var(--border)'}`,
            color: geavanceerdeFiltersActief ? '#fff' : 'var(--text-dim)',
            borderRadius: 6, padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', alignSelf: 'stretch',
          }}
        >
          <Filter size={14} />
        </button>
        <button
          onClick={() => {
            setSelectieModus(prev => {
              const nieuw = !prev;
              if (!nieuw) { setGeselecteerdeIds(new Set()); setLaatstGeklikteId(null); }
              return nieuw;
            });
          }}
          title={selectieModus ? 'Selectiemodus uitschakelen' : 'Transacties selecteren voor bulk-categorisatie (Aangepast)'}
          style={{
            background: selectieModus ? 'var(--accent)' : 'var(--bg-card)',
            border: `1px solid ${selectieModus ? 'var(--accent)' : 'var(--border)'}`,
            color: selectieModus ? '#fff' : 'var(--text-dim)',
            borderRadius: 6, padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', alignSelf: 'stretch',
          }}
        >
          <CheckSquare size={14} />
        </button>
        <button
          onClick={() => setMaandStartModalOpen(true)}
          title="Maandstartdag instellen"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            borderRadius: 6, padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', alignSelf: 'stretch',
          }}
        >
          <Settings size={14} />
        </button>
      </div>

      {geavanceerdeFiltersActief && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 12, color: 'var(--accent)' }}>
          <Filter size={12} />
          <span>Geavanceerde filters actief</span>
          <button
            onClick={() => { setGeavanceerdeFilters({ typen: [], datumVan: '', datumTot: '', bedragMin: '', bedragMax: '', aangepast: false }); setSubcategorieFilter(null); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}
          >
            Wis filters ×
          </button>
        </div>
      )}

      {selectieModus && (
        <div ref={bulkToolbarRef} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 12, color: 'var(--accent)' }}>
          <CheckSquare size={12} />
          <span>{geselecteerdeIds.size} geselecteerd</span>
          <button
            onClick={() => { setGeselecteerdeIds(new Set()); setLaatstGeklikteId(null); }}
            disabled={geselecteerdeIds.size === 0}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: geselecteerdeIds.size === 0 ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, padding: 0, opacity: geselecteerdeIds.size === 0 ? 0.5 : 1 }}
          >
            Selectie wissen ×
          </button>
          <button
            disabled={geselecteerdeIds.size === 0}
            onClick={() => setBulkPopupOpen(true)}
            style={{ marginLeft: 'auto', background: geselecteerdeIds.size === 0 ? 'transparent' : 'var(--accent)', border: `1px solid var(--accent)`, color: geselecteerdeIds.size === 0 ? 'var(--text-dim)' : '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: geselecteerdeIds.size === 0 ? 'not-allowed' : 'pointer', opacity: geselecteerdeIds.size === 0 ? 0.5 : 1 }}
          >
            Categoriseer selectie
          </button>
        </div>
      )}

      {fout && <div className="error-melding">{fout}</div>}

      {!klaar || (laden && !isHerladen.current) ? (
        <p className="loading">Laden…</p>
      ) : gefilterdeTransacties.length === 0 && !isHerladen.current ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p className="empty" style={{ margin: '0 0 12px' }}>Geen transacties gevonden.</p>
          {geavanceerdeFiltersActief && (
            <button
              onClick={() => { setGeavanceerdeFilters({ typen: [], datumVan: '', datumTot: '', bedragMin: '', bedragMax: '', aangepast: false }); setSubcategorieFilter(null); }}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 13, cursor: 'pointer' }}
            >
              Wis filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ opacity: isHerladen.current ? 0.5 : 1, pointerEvents: isHerladen.current ? 'none' : 'auto', transition: 'opacity 0.15s' }}>

          {/* Scrollbalk bovenaan (alleen zichtbaar bij overflow) */}
          {hasOverflow && (
            <div
              ref={topScrollRef}
              onScroll={() => syncScroll('top')}
              style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, scrollbarColor: 'var(--border) var(--bg-base)', scrollbarWidth: 'thin' }}
            >
              <div style={{ minWidth: containerWidth + 10, height: 1 }} />
            </div>
          )}

          <div ref={tableWrapperRef} className="table-wrapper" onScroll={() => syncScroll('table')}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {selectieModus && (() => {
                    const zichtbareIds = gesorteerdeTransacties.map(t => t.id);
                    const allesGeselecteerd = zichtbareIds.length > 0 && zichtbareIds.every(id => geselecteerdeIds.has(id));
                    return (
                      <th style={{ width: 32, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allesGeselecteerd}
                          onChange={e => {
                            if (e.target.checked) setGeselecteerdeIds(new Set(zichtbareIds));
                            else { setGeselecteerdeIds(new Set()); setLaatstGeklikteId(null); }
                          }}
                          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                          title="Alle zichtbare transacties (de)selecteren"
                        />
                      </th>
                    );
                  })()}
                  {ALLE_KOLOMMEN.filter(k => zichtbareKolommen.has(k.id)).map(k => (
                    <th
                      key={k.id}
                      onClick={() => toggleSort(k.id)}
                      style={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        userSelect: 'none',
                        ...(k.id === 'bedrag' || k.id === 'saldo_na_trn' ? { textAlign: 'right' } : {}),
                        ...(k.id === 'naam_tegenpartij' ? { width: 250, minWidth: 250, maxWidth: 250 } : {}),
                        ...(k.id === 'omschrijving_1' ? { minWidth: 150, maxWidth: 350 } : {}),
                      }}
                    >
                      {k.label}
                      <span style={{ marginLeft: 4, opacity: sortCol === k.id ? 1 : 0.3 }}>
                        {sortCol === k.id && sortDir === 'desc' ? '↓' : '↑'}
                      </span>
                    </th>
                  ))}
                  <th
                    className="sticky-acties"
                    style={{ position: 'relative', width: 42, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    onClick={e => { e.stopPropagation(); setKolomMenuOpen(o => !o); }}
                    title="Kolommen instellen"
                  >
                    ⚙
                    {kolomMenuOpen && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 9000,
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          borderRadius: 12, minWidth: 220, padding: 5,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)', marginTop: 4,
                        }}
                      >
                        {ALLE_KOLOMMEN.map(k => (
                          <label
                            key={k.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderRadius: 7, transition: 'background 80ms' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <input
                              type="checkbox"
                              checked={zichtbareKolommen.has(k.id)}
                              onChange={e => toggleKolom(k.id, e.target.checked)}
                              style={{ accentColor: 'var(--accent)' }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text)' }}>{k.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {gesorteerdeTransacties.map(t => {
                  const catKleur     = budgettenPotjes.find(bp => bp.naam === t.categorie)?.kleur ?? 'var(--accent)';
                  const zk           = zichtbareKolommen;
                  const isGemarkeerdRow = gemarkeerdeTransactie != null && t.id === gemarkeerdeTransactie;

                  return (
                    <Fragment key={t.id}>
                      <tr
                        ref={isGemarkeerdRow ? gemarkeerdeRef : null}
                        data-onboarding="categorie-rij"
                        onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                        onClick={(e) => {
                          if (selectieModus) {
                            handleSelectieKlik(t.id, e);
                            return;
                          }
                          // Ctrl/Shift+klik buiten selectiemodus: activeer selectiemodus en pas direct selectie toe.
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            setSelectieModus(true);
                            handleSelectieKlik(t.id, e);
                            return;
                          }
                          openCategoriePopup(t);
                        }}
                        style={{ cursor: 'pointer', background: selectieModus && geselecteerdeIds.has(t.id) ? 'var(--accent-dim)' : (isGemarkeerdRow ? 'var(--accent-dim)' : undefined), userSelect: selectieModus ? 'none' : undefined }}
                      >
                        {selectieModus && (
                          <td
                            style={{ width: 32, textAlign: 'center' }}
                            onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                handleSelectieKlik(t.id, e);
                                return;
                              }
                              setGeselecteerdeIds(prev => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                                return next;
                              });
                              setLaatstGeklikteId(t.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={geselecteerdeIds.has(t.id)}
                              onChange={() => { /* handled via td onClick */ }}
                              style={{ accentColor: 'var(--accent)', cursor: 'pointer', pointerEvents: 'none' }}
                              tabIndex={-1}
                              readOnly
                            />
                          </td>
                        )}
                        {zk.has('datum') && (
                          <td
                            style={{ color: t.datum_aanpassing ? 'var(--accent)' : 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}
                            title={t.datum_aanpassing ? `Origineel geboekt op ${formatDatum(t.datum)}` : undefined}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span>{formatDatum(t.datum_aanpassing ?? t.datum)}</span>
                              {t.datum_aanpassing && <Calendar size={11} />}
                              {t.is_nieuw === 1 && <span className="badge" style={{ marginLeft: 1, fontSize: 9, padding: '0px 4px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>Nieuw</span>}
                            </div>
                            {t.datum_aanpassing && (
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1, fontWeight: 400 }}>
                                origineel: {formatDatum(t.datum)}
                              </div>
                            )}
                          </td>
                        )}
                        {zk.has('iban_bban') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                            {t.iban_bban ?? '—'}
                            {t.rekening_naam && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{t.rekening_naam}</div>}
                          </td>
                        )}
                        {zk.has('tegenrekening_iban_bban') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                            {t.tegenrekening_iban_bban ?? '—'}
                            {t.tegenrekening_naam && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{t.tegenrekening_naam}</div>}
                          </td>
                        )}
                        {zk.has('naam_tegenpartij') && (
                          <td style={{ color: 'var(--text-h)', fontWeight: 500, fontSize: 12, width: 250, minWidth: 250, maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.fout_geboekt === 1 && <span style={{ color: '#f76707', marginRight: 4, fontSize: 12 }}>⚠</span>}
                            {t.handmatig_gecategoriseerd === 1 && <span style={{ color: 'var(--text-dim)', marginRight: 4, fontSize: 11 }}>🔒</span>}
                            {t.naam_tegenpartij ?? '—'}
                          </td>
                        )}
                        {zk.has('bedrag') && (
                          <td style={{ textAlign: 'right', fontWeight: 600, color: (t.bedrag ?? 0) < 0 ? 'var(--red)' : 'var(--green)' }}>
                            {formatBedrag(t.bedrag)}
                          </td>
                        )}
                        {zk.has('type') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                            <TypeLabel type={t.type} />
                          </td>
                        )}
                        {zk.has('categorie') && (
                          <td>
                            {t.categorie
                              ? <span className="badge" style={{ cursor: 'pointer', background: kleurBg(catKleur), border: `1px solid ${catKleur}`, color: catKleur }}>{t.categorie}</span>
                              : <span className="badge-outline-red" style={{ cursor: 'pointer' }}>Ongecategoriseerd</span>
                            }
                          </td>
                        )}
                        {zk.has('subcategorie') && (
                          <td>
                            {t.subcategorie
                              ? <span className="badge-outline" style={{ cursor: 'pointer', borderColor: catKleur, color: catKleur }}>{t.subcategorie}</span>
                              : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                            }
                          </td>
                        )}
                        {zk.has('omschrijving_1') && (
                          <td style={{ fontSize: 12, minWidth: 150, maxWidth: 350, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden' }}>
                            {t.toelichting && <div style={{ color: 'var(--accent)', marginBottom: 2 }}>{t.toelichting}</div>}
                            <span style={{ color: 'var(--text-dim)' }}>{t.omschrijving_1 ?? '—'}</span>
                          </td>
                        )}
                        {zk.has('rentedatum') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{formatDatum(t.rentedatum)}</td>
                        )}
                        {zk.has('saldo_na_trn') && (
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-dim)' }}>{formatBedrag(t.saldo_na_trn)}</td>
                        )}
                        {zk.has('datum_aanpassing') && (
                          <td style={{ color: t.datum_aanpassing ? '#f76707' : 'var(--text-dim)', fontSize: 12 }}>{formatDatum(t.datum_aanpassing)}</td>
                        )}
                        {zk.has('transactiereferentie') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{t.transactiereferentie ?? '—'}</td>
                        )}
                        {zk.has('omschrijving_2') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.omschrijving_2 ?? '—'}</td>
                        )}
                        {zk.has('omschrijving_3') && (
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.omschrijving_3 ?? '—'}</td>
                        )}
                        <td className="sticky-acties" onClick={e => e.stopPropagation()} />
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Geavanceerde filters */}
      {filterModalOpen && (
        <Modal open={filterModalOpen} onClose={() => setFilterModalOpen(false)} title="Geavanceerde filters" breedte={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Type */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Type transactie</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['normaal-af', 'normaal-bij', 'omboeking-af', 'omboeking-bij'] as TransactieType[]).map(type => (
                  <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={geavanceerdeFilters.typen.includes(type)}
                      onChange={e => setGeavanceerdeFilters(f => ({
                        ...f,
                        typen: e.target.checked ? [...f.typen, type] : f.typen.filter(t => t !== type),
                      }))}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    {TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>
            {/* Subcategorie */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Subcategorie</p>
              <select
                value={subcategorieFilter ?? ''}
                onChange={e => setSubcategorieFilter(e.target.value || null)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }}
              >
                <option value="">— Alle subcategorieën —</option>
                {Array.from(new Set(tabTransacties.map(t => t.subcategorie).filter((s): s is string => s !== null))).sort().map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {/* Aangepast */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={geavanceerdeFilters.aangepast}
                  onChange={e => setGeavanceerdeFilters(f => ({ ...f, aangepast: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)' }}
                />
                🔒 Alleen handmatig gecategoriseerd
              </label>
            </div>
            {/* Datum range */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Datumbereik</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={geavanceerdeFilters.datumVan}
                  onChange={e => setGeavanceerdeFilters(f => ({ ...f, datumVan: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }} />
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>t/m</span>
                <input type="date" value={geavanceerdeFilters.datumTot}
                  onChange={e => setGeavanceerdeFilters(f => ({ ...f, datumTot: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }} />
              </div>
            </div>
            {/* Bedrag range */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Bedragbereik (€)</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" placeholder="Min" value={geavanceerdeFilters.bedragMin}
                  onChange={e => setGeavanceerdeFilters(f => ({ ...f, bedragMin: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }} />
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>t/m</span>
                <input type="number" placeholder="Max" value={geavanceerdeFilters.bedragMax}
                  onChange={e => setGeavanceerdeFilters(f => ({ ...f, bedragMax: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }} />
              </div>
            </div>
            {/* Acties */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setGeavanceerdeFilters({ typen: [], datumVan: '', datumTot: '', bedragMin: '', bedragMax: '', aangepast: false }); setSubcategorieFilter(null); setFilterModalOpen(false); }}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
              >
                Wis alle filters
              </button>
              <button
                onClick={() => setFilterModalOpen(false)}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Toepassen
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Patroonherkenning omschrijving */}
      {patronModal && (
        <div data-onboarding="categorie-popup">
        <CategoriePopup
          patronModal={patronModal}
          setPatronModal={setPatronModal}
          onBevestig={handlePatronModalBevestig}
          onBevestigStart={slaScrollOpVoorHerstel}
          onSluiten={() => setPatronModal(null)}
          onReset={() => { setPatronModal(null); slaScrollOpVoorHerstel(); setReloadTrigger(prev => prev + 1); }}
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
          uniekeCategorieenDropdown={uniekeCategorieenDropdown}
          alleSubcatMap={alleSubcatMap}
          gebruikersProfiel={gebruikersProfiel}
        />
        </div>
      )}

      <BulkCategoriePopup
        open={bulkPopupOpen}
        aantal={geselecteerdeIds.size}
        aantalUniekeNamen={new Set(
          tabTransacties.filter(t => geselecteerdeIds.has(t.id))
            .map(t => { const n = (t.naam_tegenpartij ?? '').trim(); return n ? `${t.tegenrekening_iban_bban ?? ''}|${n}` : ''; })
            .filter(n => n.length > 0)
        ).size}
        onClose={() => setBulkPopupOpen(false)}
        onBevestig={handleBulkBevestig}
      />

      {selectieModus && !bulkToolbarZichtbaar && (
        <div data-selectie-behouden style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 900, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 999, fontSize: 12, color: 'var(--accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)' }}>
          <CheckSquare size={12} />
          <span>{geselecteerdeIds.size} geselecteerd</span>
          <button
            onClick={() => { setGeselecteerdeIds(new Set()); setLaatstGeklikteId(null); }}
            disabled={geselecteerdeIds.size === 0}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: geselecteerdeIds.size === 0 ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, padding: 0, opacity: geselecteerdeIds.size === 0 ? 0.5 : 1 }}
          >
            Wissen
          </button>
          <button
            disabled={geselecteerdeIds.size === 0}
            onClick={() => setBulkPopupOpen(true)}
            style={{ background: geselecteerdeIds.size === 0 ? 'transparent' : 'var(--accent)', border: '1px solid var(--accent)', color: geselecteerdeIds.size === 0 ? 'var(--text-dim)' : '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: geselecteerdeIds.size === 0 ? 'not-allowed' : 'pointer', opacity: geselecteerdeIds.size === 0 ? 0.5 : 1 }}
          >
            Categoriseer selectie
          </button>
          <button
            onClick={() => { setSelectieModus(false); setGeselecteerdeIds(new Set()); setLaatstGeklikteId(null); }}
            title="Selectiemodus uitschakelen"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>
      )}

{maandStartModalOpen && (
        <Modal
          open={maandStartModalOpen}
          onClose={() => {
            setMaandStartModalOpen(false);
            fetch('/api/periodes')
              .then(r => r.ok ? r.json() : [])
              .then((ps: Periode[]) => {
                setPeriodes(ps);
                const actueel = kiesStartPeriode(ps);
                setGeselecteerdJaar(actueel?.jaar ?? new Date().getFullYear());
                setGeselecteerdePeriode(actueel);
                setReloadTrigger(t => t + 1);
              });
          }}
          title="Maandstartdag"
          breedte={480}
        >
          <AlgemeneInstellingen sectie="startdag" />
        </Modal>
      )}

    </div>
  );
}
