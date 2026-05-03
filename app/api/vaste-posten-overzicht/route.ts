import { NextRequest, NextResponse } from 'next/server';
import { getInstellingen } from '@/lib/instellingen';
import { getCategorieRegels, matchCategorie } from '@/lib/categorisatie';
import { getTransacties } from '@/lib/transacties';
import { getPeriodeBereik, getPeriodeVanDatum } from '@/lib/maandperiodes';
import { getPeriodeConfigs, msdVoorPeriode } from '@/lib/periodeConfigs';
import { getVpGroepen } from '@/lib/vpGroepen';
import { getVpVolgorde } from '@/lib/vpVolgorde';
import { getVpNegeer } from '@/lib/vpNegeer';
import { getDashboardOverzicht } from '@/lib/dashboard';
import { getDashboardTabs } from '@/lib/dashboardTabs';
import { getRekeningGroep } from '@/lib/rekeningGroepen';
import { getRekeningen } from '@/lib/rekeningen';

export type VastePostStatus = 'geweest' | 'verwacht' | 'verlopen' | 'ontbreekt';

export interface VastePostTransactie {
  id: number;
  datum: string;
  originele_datum: string | null; // import-datum als de transactie een aangepaste boekdatum heeft, anders null
  periode: string; // YYYY-MM — periode (op basis van maand_start_dag) waarin de transactie valt
  naam_tegenpartij: string | null;
  omschrijving_1: string | null;
  omschrijving_2: string | null;
  omschrijving_3: string | null;
  bedrag: number;
  categorie: string | null;
  subcategorie: string | null;
  categorie_id: number | null;
  toelichting: string | null;
  type: string | null;
  tegenrekening_iban_bban: string | null;
  iban_bban: string | null;
  rekening_naam: string | null;
}

export interface VastePostItem {
  regelId: number;
  subcategorie: string;
  naam: string;
  status: VastePostStatus;
  datum: string | null;
  bedrag: number | null;
  gemiddeldBedrag: number | null;
  afwijkingBedrag: number | null;
  ontbrokenAantal: number;
  nieuw: boolean;
  transacties: VastePostTransactie[];
}

export interface VastePostGroep {
  subcategorie: string;  // weergavenaam (groepnaam of subcategorie)
  groepId: number | null;
  subcategorieen: string[];  // alle subcategorieen in deze weergavegroep
  items: VastePostItem[];
}

export interface NegeerItem {
  regelId: number;
  naam: string;
  subcategorie: string;
  periode: string; // 'permanent' | 'YYYY-MM'
  transacties: VastePostTransactie[];
}

export interface VastePostenOverzicht {
  periodeLabel: string;
  periodeStart: string;
  periodeEind: string;
  vandaag: string;
  afwijkingDrempel: number;
  groepen: VastePostGroep[];
  negeerde: NegeerItem[];
  totaalInkomsten: number;        // alle positieve transacties in periode (excl. omboekingen)
  totaalUitgaven: number;          // werkelijk uitgegeven aan VP (geweest + verlopen)
  nogTeGaan: number;
  totaalOverigeUitgaven: number;   // alle negatieve transacties in NIET-VP categorieën (excl. omboekingen)
  totaalSaldoVrij: number;         // saldo van niet-VP gecategoriseerde transacties (CAT-tabel som excl. VP)
  overigeUitsplitsing: { categorie: string; catTotaal: number; blsCorrectie: number; netto: number }[];
  budgetbeheerActief: boolean;     // bepaalt of BLS-correctie wordt toegepast
}

const MAANDEN = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function vandaagStr(): string {
  const v = new Date();
  return toISO(v.getFullYear(), v.getMonth() + 1, v.getDate());
}

export function GET(req: NextRequest) {
  try {
    const inst = getInstellingen();
    const { vastePostenOverzicht, vastePostenVergelijk, vastePostenAfwijkingProcent, vastePostenNieuwDrempel, vastePostenSubtabelPeriode, vastePostenVerbergDrempel } = inst;
    // Parse alle 'jaar / alles / N maanden' instellingen
    const ALLES = 999;
    const overzichtIsJaar   = vastePostenOverzicht === 'jaar';
    const overzichtIsAlles  = vastePostenOverzicht === 'alles';
    const overzichtMaanden  = (overzichtIsJaar || overzichtIsAlles) ? 0 : Math.max(1, Math.min(12, parseInt(vastePostenOverzicht, 10) || 4));
    const vergelijkIsJaar   = vastePostenVergelijk === 'jaar';
    const vergelijkIsAlles  = vastePostenVergelijk === 'alles';
    const vergelijkMaanden  = (vergelijkIsJaar || vergelijkIsAlles) ? 0 : Math.max(1, Math.min(12, parseInt(vastePostenVergelijk, 10) || 3));
    const subtabelIsJaar    = vastePostenSubtabelPeriode === 'jaar';
    const subtabelIsAlles   = vastePostenSubtabelPeriode === 'alles';
    const subtabelMaanden   = (subtabelIsJaar || subtabelIsAlles) ? 0 : Math.max(1, Math.min(24, parseInt(vastePostenSubtabelPeriode, 10) || 3));
    const nieuwIsJaar       = vastePostenNieuwDrempel === 'jaar';
    const nieuwIsAlles      = vastePostenNieuwDrempel === 'alles';
    const nieuwDrempelMaanden = (nieuwIsJaar || nieuwIsAlles) ? 0 : Math.max(1, Math.min(36, parseInt(vastePostenNieuwDrempel, 10) || 12));
    const verbergIsJaar     = vastePostenVerbergDrempel === 'jaar';
    const verbergIsAlles    = vastePostenVerbergDrempel === 'alles';
    const verbergDrempelMaanden = (verbergIsJaar || verbergIsAlles) ? 0 : Math.max(1, Math.min(36, parseInt(vastePostenVerbergDrempel, 10) || 4));
    const configs = getPeriodeConfigs();

    const sp = req.nextUrl.searchParams;
    const paramJaar  = sp.get('jaar')  ? parseInt(sp.get('jaar')!)  : null;
    const paramMaand = sp.get('maand') ? parseInt(sp.get('maand')!) : null;

    const nu = new Date();
    const huidigMsd = msdVoorPeriode(configs, nu.getFullYear(), nu.getMonth() + 1);
    const huidig = getPeriodeVanDatum(nu, huidigMsd);
    const gesJaar  = paramJaar  ?? huidig.jaar;
    const gesMaand = paramMaand ?? huidig.maand;

    const gesMsd = msdVoorPeriode(configs, gesJaar, gesMaand);
    const { start: periodeStart, eind: periodeEind } = getPeriodeBereik(gesJaar, gesMaand, gesMsd);
    const periodeLabel = `${MAANDEN[gesMaand - 1]} '${String(gesJaar).slice(2)}`;
    const vandaag = vandaagStr();

    // Lookback: genoeg voor alle periode-instellingen. Voor 'jaar' kunnen er tot 11
    // periodes vóór de huidige gehaald worden (december → januari binnen gesJaar).
    const overzichtLookback = overzichtIsAlles ? ALLES : (overzichtIsJaar ? 11 : overzichtMaanden);
    const vergelijkLookback = vergelijkIsAlles ? ALLES : (vergelijkIsJaar ? 11 : vergelijkMaanden);
    const subtabelLookback  = subtabelIsAlles  ? ALLES : (subtabelIsJaar  ? 11 : subtabelMaanden);
    const nieuwLookback     = nieuwIsAlles     ? ALLES : (nieuwIsJaar     ? 11 : nieuwDrempelMaanden);
    const verbergLookback   = verbergIsAlles   ? ALLES : (verbergIsJaar   ? 11 : verbergDrempelMaanden);
    const aantalTerug = Math.max(overzichtLookback, vergelijkLookback, nieuwLookback, subtabelLookback, verbergLookback);
    let lookJaar = gesJaar, lookMaand = gesMaand;
    for (let i = 0; i < aantalTerug; i++) {
      if (--lookMaand < 1) { lookMaand = 12; lookJaar--; }
    }
    const { start: lookbackStart } = getPeriodeBereik(lookJaar, lookMaand, msdVoorPeriode(configs, lookJaar, lookMaand));

    // X periodes (voor verwachte datum)
    // - 'jaar': alle maanden van gesJaar behalve de huidige
    // - 'alles': alle ALLES voorgaande periodes (lookback dekt dit al via aantalTerug)
    // - aantal: N voorgaande periodes (excl. huidige)
    const xPeriodes: { start: string; eind: string }[] = [];
    if (overzichtIsJaar) {
      for (let m = 1; m <= 12; m++) {
        if (m === gesMaand) continue;
        xPeriodes.push(getPeriodeBereik(gesJaar, m, msdVoorPeriode(configs, gesJaar, m)));
      }
    } else {
      let pJ = gesJaar, pM = gesMaand;
      const pAantal = overzichtIsAlles ? ALLES : overzichtMaanden;
      for (let i = 0; i < pAantal; i++) {
        if (--pM < 1) { pM = 12; pJ--; }
        xPeriodes.push(getPeriodeBereik(pJ, pM, msdVoorPeriode(configs, pJ, pM)));
      }
    }

    // Y periodes (voor bedraggemiddelde) — zelfde semantiek als X
    const yPeriodes: { start: string; eind: string }[] = [];
    if (vergelijkIsJaar) {
      for (let m = 1; m <= 12; m++) {
        if (m === gesMaand) continue;
        yPeriodes.push(getPeriodeBereik(gesJaar, m, msdVoorPeriode(configs, gesJaar, m)));
      }
    } else {
      let yJ = gesJaar, yM = gesMaand;
      const yAantal = vergelijkIsAlles ? ALLES : vergelijkMaanden;
      for (let i = 0; i < yAantal; i++) {
        if (--yM < 1) { yM = 12; yJ--; }
        yPeriodes.push(getPeriodeBereik(yJ, yM, msdVoorPeriode(configs, yJ, yM)));
      }
    }

    // Verberg-periodes: huidige periode + voorgaande periodes binnen het venster.
    // - 'jaar': huidige + maanden 1..gesMaand-1 van gesJaar (year-to-date)
    // - 'alles': huidige + alle voorgaande periodes (ALLES)
    // - aantal: huidige + (N-1) voorgaande periodes
    // verbergPeriodes[0] is altijd de huidige periode (vereiste voor ontbroken-iteratie).
    const verbergPeriodes: { start: string; eind: string }[] = [];
    verbergPeriodes.push({ start: periodeStart, eind: periodeEind });
    if (verbergIsJaar) {
      for (let m = gesMaand - 1; m >= 1; m--) {
        verbergPeriodes.push(getPeriodeBereik(gesJaar, m, msdVoorPeriode(configs, gesJaar, m)));
      }
    } else {
      let vJ = gesJaar, vM = gesMaand;
      const vAantal = verbergIsAlles ? ALLES : verbergDrempelMaanden - 1;
      for (let i = 0; i < vAantal; i++) {
        if (--vM < 1) { vM = 12; vJ--; }
        verbergPeriodes.push(getPeriodeBereik(vJ, vM, msdVoorPeriode(configs, vJ, vM)));
      }
    }

    // Subtabel-periodes (los van vergelijkMaanden):
    // - 'jaar': januari t/m december van het geselecteerde jaar
    // - 'alles': huidige periode + alle voorgaande periodes (ALLES)
    // - numeriek: huidige periode + N periodes terug
    const subtabelPeriodes: { start: string; eind: string; jaar: number; maand: number }[] = [];
    if (subtabelIsJaar) {
      for (let m = 1; m <= 12; m++) {
        const { start, eind } = getPeriodeBereik(gesJaar, m, msdVoorPeriode(configs, gesJaar, m));
        subtabelPeriodes.push({ start, eind, jaar: gesJaar, maand: m });
      }
    } else {
      subtabelPeriodes.push({ start: periodeStart, eind: periodeEind, jaar: gesJaar, maand: gesMaand });
      let sJ = gesJaar, sM = gesMaand;
      const sAantal = subtabelIsAlles ? ALLES : subtabelMaanden;
      for (let i = 0; i < sAantal; i++) {
        if (--sM < 1) { sM = 12; sJ--; }
        const { start, eind } = getPeriodeBereik(sJ, sM, msdVoorPeriode(configs, sJ, sM));
        subtabelPeriodes.push({ start, eind, jaar: sJ, maand: sM });
      }
    }

    // Alle VP regels
    const alleRegels = getCategorieRegels().filter(r => r.categorie === 'Vaste Posten');

    // Datum-bereik: lookback voor X/Y/nieuw + subtabel-periodes (voor 'jaar' kan december > periodeEind)
    const subtabelMinStart = subtabelPeriodes.reduce((min, p) => p.start < min ? p.start : min, subtabelPeriodes[0]?.start ?? lookbackStart);
    const subtabelMaxEind  = subtabelPeriodes.reduce((max, p) => p.eind  > max ? p.eind  : max, subtabelPeriodes[0]?.eind  ?? periodeEind);
    const fetchVan = lookbackStart < subtabelMinStart ? lookbackStart : subtabelMinStart;
    const fetchTot = periodeEind   > subtabelMaxEind  ? periodeEind   : subtabelMaxEind;

    // Tab-filter: actieve dashboard-tab uit instellingen, gedeeld met dashboard.
    // Default = eerste tab (matched dashboard-gedrag bij eerste opening).
    const tabs = getDashboardTabs();
    const actieveTab = inst.actieveDashboardTabId != null
      ? tabs.find(t => t.id === inst.actieveDashboardTabId) ?? tabs[0]
      : tabs[0];

    let filterIbans: Set<string> | null = null;
    let filterGroepId: number | undefined;
    let filterRekeningId: number | undefined;
    if (actieveTab) {
      const rekeningen = getRekeningen();
      if (actieveTab.type === 'groep') {
        filterGroepId = actieveTab.entiteit_id;
        const groep = getRekeningGroep(actieveTab.entiteit_id);
        filterIbans = groep
          ? new Set(rekeningen.filter(r => groep.rekening_ids.includes(r.id)).map(r => r.iban))
          : new Set();
      } else {
        filterRekeningId = actieveTab.entiteit_id;
        const rek = rekeningen.find(r => r.id === actieveTab.entiteit_id);
        filterIbans = rek ? new Set([rek.iban]) : new Set();
      }
    }

    // Alle relevante transacties ophalen — direct gefilterd op Vaste Posten in SQL,
    // daarna in JS op tab-ibans (zodat VP-items per tab gescoped zijn).
    const alleTrx = getTransacties({ datum_van: fetchVan, datum_tot: fetchTot, categorie: 'Vaste Posten' })
      .filter(t => !filterIbans || (t.iban_bban != null && filterIbans.has(t.iban_bban)));

    // Map elke transactie naar een regelId
    interface TrxMapped { regelId: number; datum: string; bedrag: number; t: ReturnType<typeof getTransacties>[0] }
    const trxGemapped: TrxMapped[] = [];
    for (const t of alleTrx) {
      const r = matchCategorie(t, alleRegels);
      if (!r) continue;
      const datum = (t.datum_aanpassing ?? t.datum) ?? '';
      if (!datum) continue;
      trxGemapped.push({ regelId: r.id, datum, bedrag: t.bedrag ?? 0, t });
    }

    // Groepeer op regelId
    const perRegel = new Map<number, TrxMapped[]>();
    for (const tm of trxGemapped) {
      if (!perRegel.has(tm.regelId)) perRegel.set(tm.regelId, []);
      perRegel.get(tm.regelId)!.push(tm);
    }

    function inPeriode(datum: string, p: { start: string; eind: string }) {
      return datum >= p.start && datum <= p.eind;
    }

    // Negeer- en volgorde-data ophalen
    const periodeSleutel = `${gesJaar}-${String(gesMaand).padStart(2, '0')}`;
    const negeerRegels = getVpNegeer();
    const negeerMap = new Map<number, string>(); // regelId → periode (meest specifiek)
    for (const n of negeerRegels) {
      if (n.periode === 'permanent') {
        negeerMap.set(n.regel_id, 'permanent');
      } else if (n.periode.startsWith('vanaf:')) {
        const vanaf = n.periode.slice(6); // 'YYYY-MM'
        if (periodeSleutel >= vanaf && !negeerMap.has(n.regel_id)) negeerMap.set(n.regel_id, n.periode);
      } else if (n.periode === periodeSleutel && !negeerMap.has(n.regel_id)) {
        negeerMap.set(n.regel_id, periodeSleutel);
      }
    }

    const items: VastePostItem[] = [];
    const negeerde: NegeerItem[] = [];

    for (const regel of alleRegels) {
      const trx = perRegel.get(regel.id) ?? [];

      // Verberg-check: regel verbergen als er geen matchende transactie was in de huidige
      // periode of de afgelopen N-1 periodes (vastePostenVerbergDrempelMaanden). Automatisch
      // herstel zodra er weer een matchende transactie binnen het venster valt.
      if (!trx.some(t => verbergPeriodes.some(vp => inPeriode(t.datum, vp)))) continue;

      // Geselecteerde periode
      const gesTrx = trx.filter(t => inPeriode(t.datum, { start: periodeStart, eind: periodeEind }));

      // Ontbroken-streak: tel consecutieve lege perioden vanaf de vorige periode
      // terug, gecapped op de verberg-drempel - 1 (een regel met N opeenvolgende
      // lege periodes wordt al verborgen, dus de badge kan max N-1 tonen).
      // verbergPeriodes[0] is de huidige periode, vandaar starten op index 1.
      let ontbrokenAantal = 0;
      for (let i = 1; i < verbergPeriodes.length; i++) {
        if (trx.some(t => inPeriode(t.datum, verbergPeriodes[i]))) break;
        ontbrokenAantal++;
      }

      // Nieuw: geen enkele matchende transactie in de drempel-periode vóór de huidige periode.
      // - 'jaar': geen voorkomens in dit jaar vóór de huidige periode
      // - aantal maanden: geen voorkomens in de afgelopen N maanden vóór de huidige periode
      // Een nieuwe regel óf een terugkomer na langere afwezigheid krijgt zo de "nieuw" badge.
      const nieuwDrempelStart = nieuwIsJaar
        ? `${gesJaar}-01-01`
        : nieuwIsAlles
          ? '1900-01-01'
          : (() => {
              let nJ = gesJaar, nM = gesMaand;
              for (let i = 0; i < nieuwDrempelMaanden; i++) {
                if (--nM < 1) { nM = 12; nJ--; }
              }
              return getPeriodeBereik(nJ, nM, msdVoorPeriode(configs, nJ, nM)).start;
            })();
      // Eerste maand van de ingestelde termijn overslaan: dan is het lookback-
      // venster leeg (bv. 'jaar' + januari → window collapseert tot 0 dagen)
      // waardoor alles ten onrechte als 'nieuw' wordt gemarkeerd.
      const nieuw = nieuwDrempelStart >= periodeStart
        ? false
        : !trx.some(t => t.datum >= nieuwDrempelStart && t.datum < periodeStart);

      // Werkelijk bedrag + datum voor geselecteerde periode
      const werkelijkBedrag = gesTrx.length > 0
        ? gesTrx.reduce((s, t) => s + t.bedrag, 0)
        : null;
      const werkelijkeDatum = gesTrx.length > 0
        ? [...gesTrx].sort((a, b) => a.datum.localeCompare(b.datum))[0].datum
        : null;

      // Verwachte datum: gemiddelde dag-van-maand uit X periodes waar transactie voorkwam
      const xDagen: number[] = [];
      for (const xp of xPeriodes) {
        const xt = trx.filter(t => inPeriode(t.datum, xp));
        if (xt.length > 0) {
          const vroegste = [...xt].sort((a, b) => a.datum.localeCompare(b.datum))[0];
          xDagen.push(parseInt(vroegste.datum.slice(8, 10), 10));
        }
      }
      let verwachteDatum: string | null = null;
      if (xDagen.length > 0) {
        const gemDag = Math.round(xDagen.reduce((s, d) => s + d, 0) / xDagen.length);
        const maxDag = new Date(gesJaar, gesMaand, 0).getDate();
        const dag = Math.min(gemDag, maxDag);
        verwachteDatum = toISO(gesJaar, gesMaand, dag);
      }

      // Gemiddeld bedrag uit Y periodes
      const yBedragen: number[] = [];
      for (const yp of yPeriodes) {
        const yt = trx.filter(t => inPeriode(t.datum, yp));
        if (yt.length > 0) {
          yBedragen.push(yt.reduce((s, t) => s + t.bedrag, 0));
        }
      }
      const gemiddeldBedrag = yBedragen.length > 0
        ? yBedragen.reduce((s, b) => s + b, 0) / yBedragen.length
        : null;

      // Afwijking
      const afwijkingProcent = (werkelijkBedrag !== null && gemiddeldBedrag !== null && gemiddeldBedrag !== 0)
        ? Math.round(((werkelijkBedrag - gemiddeldBedrag) / Math.abs(gemiddeldBedrag)) * 100)
        : null;
      const afwijkingBedrag = (werkelijkBedrag !== null && gemiddeldBedrag !== null)
        ? werkelijkBedrag - gemiddeldBedrag
        : null;

      // Status
      // - geweest:   transactie bevestigd via CSV-import
      // - ontbreekt: periode is al voorbij, geen match → blijft niet meetellen
      // - verlopen:  huidige periode, verwachte datum is al verstreken maar
      //              transactie nog niet binnen (vermoedelijk gebeurd, telt
      //              niet meer mee in 'nog te gaan')
      // - verwacht:  huidige periode, verwachte datum nog niet bereikt
      let status: VastePostStatus;
      if (werkelijkBedrag !== null) {
        status = 'geweest';
      } else if (periodeEind < vandaag) {
        status = 'ontbreekt';
      } else if (verwachteDatum && verwachteDatum < vandaag) {
        status = 'verlopen';
      } else {
        status = 'verwacht';
      }

      const naam = regel.naam_origineel ?? regel.naam_zoekwoord ?? '?';

      // Subtabel-transacties: alleen die binnen één van de subtabelPeriodes vallen
      const subtabelTrx: VastePostTransactie[] = trx
        .filter(tm => tm.datum >= subtabelMinStart && tm.datum <= subtabelMaxEind)
        .sort((a, b) => b.datum.localeCompare(a.datum))
        .map(tm => {
          const p = subtabelPeriodes.find(sp => tm.datum >= sp.start && tm.datum <= sp.eind);
          const periode = p ? `${p.jaar}-${String(p.maand).padStart(2, '0')}` : tm.datum.slice(0, 7);
          return {
            id: tm.t.id,
            datum: tm.datum,
            originele_datum: tm.t.datum_aanpassing ? (tm.t.datum ?? null) : null,
            periode,
            naam_tegenpartij: tm.t.naam_tegenpartij ?? null,
            omschrijving_1: tm.t.omschrijving_1 ?? null,
            omschrijving_2: tm.t.omschrijving_2 ?? null,
            omschrijving_3: tm.t.omschrijving_3 ?? null,
            bedrag: tm.bedrag,
            categorie: tm.t.categorie ?? null,
            subcategorie: tm.t.subcategorie ?? null,
            categorie_id: tm.t.categorie_id ?? null,
            toelichting: tm.t.toelichting ?? null,
            type: tm.t.type ?? null,
            tegenrekening_iban_bban: tm.t.tegenrekening_iban_bban ?? null,
            iban_bban: tm.t.iban_bban ?? null,
            rekening_naam: tm.t.rekening_naam ?? null,
          };
        });

      const negeerPeriode = negeerMap.get(regel.id);
      if (negeerPeriode) {
        // Negeerde regel: alleen tonen als er transacties in de subtabel-periode zijn
        if (subtabelTrx.length > 0) {
          negeerde.push({ regelId: regel.id, naam, subcategorie: regel.subcategorie ?? '—', periode: negeerPeriode, transacties: subtabelTrx });
        }
      } else {
        items.push({
          regelId: regel.id,
          subcategorie: regel.subcategorie ?? '—',
          naam,
          status,
          datum: werkelijkeDatum ?? verwachteDatum,
          bedrag: werkelijkBedrag ?? (yBedragen.length > 0 ? yBedragen[0] : null),
          gemiddeldBedrag,
          afwijkingBedrag: Math.abs(afwijkingProcent ?? 0) > vastePostenAfwijkingProcent ? afwijkingBedrag : null,
          ontbrokenAantal,
          nieuw,
          transacties: subtabelTrx,
        });
      }
    }

    // Sorteer items: 1) datum oplopend, 2) subcategorie, 3) naam
    items.sort((a, b) => {
      const ad = a.datum ?? '9999';
      const bd = b.datum ?? '9999';
      if (ad !== bd) return ad.localeCompare(bd);
      if (a.subcategorie !== b.subcategorie) return a.subcategorie.localeCompare(b.subcategorie);
      return a.naam.localeCompare(b.naam);
    });

    // Groepeer op subcategorie, rekening houdend met vp_groepen
    const vpGroepen = getVpGroepen();
    // subcategorie → { groepId, groepNaam }
    const subcatNaarGroep = new Map<string, { groepId: number; groepNaam: string }>();
    for (const g of vpGroepen) {
      for (const s of g.subcategorieen) subcatNaarGroep.set(s, { groepId: g.id, groepNaam: g.naam });
    }

    // Sleutel: groepNaam als in groep, anders subcategorie zelf
    const groepenMap = new Map<string, { groepId: number | null; subcategorieen: Set<string>; items: VastePostItem[] }>();
    for (const item of items) {
      const groepInfo = subcatNaarGroep.get(item.subcategorie);
      const sleutel = groepInfo ? groepInfo.groepNaam : item.subcategorie;
      if (!groepenMap.has(sleutel)) groepenMap.set(sleutel, { groepId: groepInfo?.groepId ?? null, subcategorieen: new Set(), items: [] });
      const entry = groepenMap.get(sleutel)!;
      entry.subcategorieen.add(item.subcategorie);
      entry.items.push(item);
    }
    const volgorde = getVpVolgorde(periodeSleutel);
    const groepen: VastePostGroep[] = [...groepenMap.entries()]
      .map(([subcategorie, { groepId, subcategorieen, items }]) => ({ subcategorie, groepId, subcategorieen: [...subcategorieen], items }))
      .sort((a, b) => {
        const va = volgorde.get(a.subcategorie) ?? Infinity;
        const vb = volgorde.get(b.subcategorie) ?? Infinity;
        if (va !== vb) return va - vb;
        return a.subcategorie.localeCompare(b.subcategorie);
      });

    // Inkomsten + VP-uitgaven blokken: berekend uit dezelfde VP-items die
    // op de pagina getoond worden (dus geen losse transactie-aggregatie).
    //  - totaalInkomsten = som positieve VP-items (salaris e.d.)
    //  - totaalUitgaven  = werkelijk uitgegeven aan VP (geweest + verlopen)
    //  - nogTeGaan       = vp 'verwacht' (toekomstig deze maand)
    let totaalInkomsten = 0, totaalUitgaven = 0, nogTeGaan = 0;
    for (const item of items) {
      const b = item.bedrag ?? 0;
      if (b > 0) {
        totaalInkomsten += b;
      } else if (b < 0) {
        const abs = Math.abs(b);
        if (item.status === 'geweest' || item.status === 'verlopen') totaalUitgaven += abs;
        if (item.status === 'verwacht') nogTeGaan += abs;
      }
    }

    // Overige uitgaven blok: enige blok dat buiten de VP-items kijkt —
    // negatieve transacties in niet-VP categorieën, excl. omboekingen.
    const periodeTrx = getTransacties({ datum_van: periodeStart, datum_tot: periodeEind })
      .filter(t => t.type !== 'omboeking-af' && t.type !== 'omboeking-bij' && t.categorie !== 'Omboekingen')
      .filter(t => !filterIbans || (t.iban_bban != null && filterIbans.has(t.iban_bban)));
    let totaalOverigeUitgaven = 0;
    for (const t of periodeTrx) {
      const b = t.bedrag ?? 0;
      if (b < 0 && t.categorie !== 'Vaste Posten') totaalOverigeUitgaven += Math.abs(b);
    }

    // Saldo "Overige uitgaven" = CAT-totaal excl Vaste Posten + BLS-gecorrigeerd
    // per categorie. De BLS gecorrigeerd-bedragen zijn omboekingen vanuit het
    // gekoppelde potje (subcategorie = categorienaam) die een uitgave compenseren.
    // Door die bij CAT op te tellen valt een goed-gefund potje weg op 0; alleen
    // werkelijke tekorten/overschotten blijven zichtbaar.
    const dashOverzicht = getDashboardOverzicht({
      datumVan: periodeStart,
      datumTot: periodeEind,
      groepId: filterGroepId,
      rekeningId: filterRekeningId,
    });
    // BLS-correctie alleen toepassen in het Budgetbeheer-profiel (interne
    // waarde 'potjesbeheer'): daar zijn categorieën gefund vanuit een gekoppeld
    // potje en wil je de omboeking-bij verrekenen tegen de uitgave. In
    // Uitgavenbeheer/Handmatig is BLS niet ingericht en zou de correctie de
    // cijfers vervuilen.
    const isBudgetbeheer = inst.gebruikersProfiel === 'potjesbeheer';
    const blsGecorrigeerdPerCat = new Map<string, number>();
    if (isBudgetbeheer) {
      for (const r of dashOverzicht.bls) {
        blsGecorrigeerdPerCat.set(r.categorie, (blsGecorrigeerdPerCat.get(r.categorie) ?? 0) + r.gecorrigeerd);
      }
    }
    const overigeUitsplitsing = dashOverzicht.cat
      .filter(c => c.categorie !== 'Vaste Posten')
      .map(c => {
        const blsCorrectie = blsGecorrigeerdPerCat.get(c.categorie) ?? 0;
        return {
          categorie: c.categorie,
          catTotaal: c.totaal,
          blsCorrectie,
          netto: Math.round((c.totaal + blsCorrectie) * 100) / 100,
        };
      })
      .sort((a, b) => a.categorie.localeCompare(b.categorie, 'nl'));
    const totaalSaldoVrij = overigeUitsplitsing.reduce((s, r) => s + r.netto, 0);

    return NextResponse.json({
      periodeLabel,
      periodeStart,
      periodeEind,
      vandaag,
      afwijkingDrempel: vastePostenAfwijkingProcent,
      groepen,
      negeerde,
      totaalInkomsten,
      totaalUitgaven,
      nogTeGaan,
      totaalOverigeUitgaven,
      totaalSaldoVrij,
      overigeUitsplitsing,
      budgetbeheerActief: isBudgetbeheer,
    } satisfies VastePostenOverzicht);

  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
