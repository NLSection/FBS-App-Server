import { getTransacties } from '@/lib/transacties';
import { getBudgettenPotjes } from '@/lib/budgettenPotjes';
import { getRekeningen } from '@/lib/rekeningen';
import { getRekeningGroep } from '@/lib/rekeningGroepen';

export interface BlsTransactie {
  id: number;
  datum: string | null;
  volgnummer: string | null;
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

export interface BlsRegel {
  categorie: string;
  gedaanOpRekening: string;
  hoortOpRekening: string;
  bedrag: number;
  gecorrigeerd: number;
  saldo: number;
  transacties: BlsTransactie[];
}

export interface CatSubrij { subcategorie: string; bedrag: number; }
export interface CatRegel { categorie: string; totaal: number; subrijen: CatSubrij[]; }

export interface DashboardFilter {
  datumVan?: string;
  datumTot?: string;
  groepId?: number;
  rekeningId?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** BLS + CAT in één pass: deelt de dure getTransacties-call. */
export function getDashboardOverzicht(filter: DashboardFilter): { bls: BlsRegel[]; cat: CatRegel[] } {
  const transacties = getTransacties({ datum_van: filter.datumVan, datum_tot: filter.datumTot });
  const rekeningen = getRekeningen();

  // Filter-set: rekening_ids voor BLS, ibans voor CAT (beide afgeleid van dezelfde groep/rekening keuze).
  let groepRekeningIds: Set<number> | null = null;
  let groepIbans: Set<string> | null = null;
  if (filter.groepId != null) {
    const groep = getRekeningGroep(filter.groepId);
    if (groep) {
      groepRekeningIds = new Set(groep.rekening_ids);
      groepIbans = new Set(rekeningen.filter(r => groep.rekening_ids.includes(r.id)).map(r => r.iban));
    } else {
      groepRekeningIds = new Set();
      groepIbans = new Set();
    }
  } else if (filter.rekeningId != null) {
    groepRekeningIds = new Set([filter.rekeningId]);
    const rek = rekeningen.find(r => r.id === filter.rekeningId);
    groepIbans = rek ? new Set([rek.iban]) : new Set();
  }

  const bls = berekenBls(transacties, rekeningen, groepRekeningIds);
  const cat = berekenCat(transacties, groepIbans);
  return { bls, cat };
}

function berekenBls(
  transacties: ReturnType<typeof getTransacties>,
  rekeningen: ReturnType<typeof getRekeningen>,
  groepRekeningIds: Set<number> | null,
): BlsRegel[] {
  const rekeningNaamById = new Map<number, string>(rekeningen.map(r => [r.id, r.naam]));
  const rekeningNaamByIban = new Map<string, string>(rekeningen.map(r => [r.iban, r.naam]));
  const rekeningIdByIban = new Map<string, number>(rekeningen.map(r => [r.iban, r.id]));

  const catGekoppeld = new Map<string, number>();
  for (const potje of getBudgettenPotjes()) {
    if (potje.rekening_ids.length > 0) catGekoppeld.set(potje.naam, potje.rekening_ids[0]);
  }

  type Groep = { categorie: string; iban_bban: string; gekoppeldeRekeningId: number; bedrag: number; gecorrigeerd: number; transacties: BlsTransactie[] };
  const groepMap = new Map<string, Groep>();

  const maakDetail = (t: typeof transacties[number]): BlsTransactie => ({
    id: t.id,
    datum: t.datum_aanpassing ?? t.datum,
    volgnummer: t.volgnummer,
    naam_tegenpartij: t.naam_tegenpartij,
    omschrijving: [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' '),
    bedrag: t.bedrag,
    rekening_naam: t.rekening_naam ?? (t.iban_bban ? rekeningNaamByIban.get(t.iban_bban) ?? null : null),
    categorie_id: t.categorie_id,
    categorie: t.categorie,
    subcategorie: t.subcategorie,
    toelichting: t.toelichting,
    type: t.type,
    tegenrekening_iban_bban: t.tegenrekening_iban_bban,
    omschrijving_1: t.omschrijving_1,
    omschrijving_2: t.omschrijving_2,
    omschrijving_3: t.omschrijving_3,
    handmatig_gecategoriseerd: t.handmatig_gecategoriseerd,
  });

  for (const t of transacties) {
    if (!t.categorie || !t.iban_bban) continue;
    if (t.type !== 'normaal-af' && t.type !== 'normaal-bij') continue;

    const gekoppeldeRekeningId = catGekoppeld.get(t.categorie);
    if (gekoppeldeRekeningId === undefined) continue;

    const trxRekeningId = rekeningIdByIban.get(t.iban_bban);
    if (trxRekeningId === undefined) continue;
    if (groepRekeningIds && !groepRekeningIds.has(trxRekeningId)) continue;
    if (trxRekeningId === gekoppeldeRekeningId) continue;

    const sleutel = `${t.categorie}::${t.iban_bban}::${gekoppeldeRekeningId}`;
    const bestaand = groepMap.get(sleutel);
    if (bestaand) {
      bestaand.bedrag += t.bedrag ?? 0;
      bestaand.transacties.push(maakDetail(t));
    } else {
      groepMap.set(sleutel, {
        categorie: t.categorie,
        iban_bban: t.iban_bban,
        gekoppeldeRekeningId,
        bedrag: t.bedrag ?? 0,
        gecorrigeerd: 0,
        transacties: [maakDetail(t)],
      });
    }
  }

  // Gecorrigeerd: omboekingen die exact matchen op {subcategorie = categorie_naam, iban_bban}.
  for (const t of transacties) {
    if (t.type !== 'omboeking-af' && t.type !== 'omboeking-bij') continue;
    if (!t.subcategorie || !t.iban_bban) continue;

    const gekoppeldeRekeningId = catGekoppeld.get(t.subcategorie);
    if (gekoppeldeRekeningId === undefined) continue;

    const sleutel = `${t.subcategorie}::${t.iban_bban}::${gekoppeldeRekeningId}`;
    const groep = groepMap.get(sleutel);
    if (groep) {
      groep.gecorrigeerd += t.bedrag ?? 0;
      groep.transacties.push(maakDetail(t));
    }
  }

  const resultaat: BlsRegel[] = [];
  for (const g of groepMap.values()) {
    g.transacties.sort((a, b) => {
      const ad = a.datum ?? '';
      const bd = b.datum ?? '';
      if (ad !== bd) return bd.localeCompare(ad);
      return (parseInt(a.volgnummer ?? '0', 10) || 0) - (parseInt(b.volgnummer ?? '0', 10) || 0);
    });
    resultaat.push({
      categorie: g.categorie,
      gedaanOpRekening: rekeningNaamByIban.get(g.iban_bban) ?? g.iban_bban,
      hoortOpRekening: rekeningNaamById.get(g.gekoppeldeRekeningId) ?? String(g.gekoppeldeRekeningId),
      bedrag: round2(g.bedrag),
      gecorrigeerd: round2(g.gecorrigeerd),
      saldo: round2(g.bedrag + g.gecorrigeerd),
      transacties: g.transacties,
    });
  }
  resultaat.sort((a, b) => a.categorie.localeCompare(b.categorie, 'nl'));
  return resultaat;
}

function berekenCat(
  transacties: ReturnType<typeof getTransacties>,
  groepIbans: Set<string> | null,
): CatRegel[] {
  const groepMap = new Map<string, Map<string, number>>();

  for (const t of transacties) {
    if (!t.categorie) continue;
    if (t.type === 'omboeking-af' || t.type === 'omboeking-bij') continue;
    if (groepIbans && (!t.iban_bban || !groepIbans.has(t.iban_bban))) continue;

    const sub = t.subcategorie ?? '';
    if (!groepMap.has(t.categorie)) groepMap.set(t.categorie, new Map());
    const subMap = groepMap.get(t.categorie)!;
    subMap.set(sub, (subMap.get(sub) ?? 0) + (t.bedrag ?? 0));
  }

  const resultaat: CatRegel[] = [];
  for (const [categorie, subMap] of groepMap) {
    const subrijen: CatSubrij[] = [];
    let totaal = 0;
    const subs = [...subMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
    for (const [sub, bedrag] of subs) {
      totaal += bedrag;
      if (sub) subrijen.push({ subcategorie: sub, bedrag: round2(bedrag) });
    }
    // Toon subrijen alleen als er >1 subcategorie is, of als de subcategorie afwijkt van de categorienaam.
    const gefilterdeSubrijen = subrijen.length > 1
      ? subrijen
      : subrijen.filter(s => s.subcategorie !== categorie);
    resultaat.push({ categorie, totaal: round2(totaal), subrijen: gefilterdeSubrijen });
  }
  resultaat.sort((a, b) => a.categorie.localeCompare(b.categorie, 'nl'));
  return resultaat;
}
