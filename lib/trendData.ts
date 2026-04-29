import getDb from '@/lib/db';
import type Database from 'better-sqlite3';
import { getAllePeriodes, getPeriodeVanDatum } from '@/lib/maandperiodes';
import { getPeriodeConfigs, msdVoorPeriode, type PeriodeConfig } from '@/lib/periodeConfigs';
import type { TrendPanel, TrendPanelSerie, XAsSchaal, Meting, BronType } from '@/lib/trendPanels';
import { getConsolidatie, type ConsolidatieBronType } from '@/lib/trendConsolidaties';

export interface TrendSerieData {
  id: number;
  label: string;
  kleur: string;
  as_zijde: 'links' | 'rechts';
  serie_type: 'lijn' | 'staaf';
  data: (number | null)[];
}

export interface TrendData {
  buckets: string[];
  series: TrendSerieData[];
}

type DB = Database.Database;

function bucketVoorDatum(datum: Date, schaal: XAsSchaal, configs: PeriodeConfig[]): string {
  const calMsd = msdVoorPeriode(configs, datum.getFullYear(), datum.getMonth() + 1);
  const { jaar, maand } = getPeriodeVanDatum(datum, calMsd);
  if (schaal === 'jaar') return `${jaar}`;
  if (schaal === 'kwartaal') return `${jaar}-K${Math.ceil(maand / 3)}`;
  return `${jaar}-${String(maand).padStart(2, '0')}`;
}

function bucketsSorteren(buckets: Set<string>): string[] {
  return [...buckets].sort();
}

function labelVoorSerie(db: DB, serie: TrendPanelSerie): string {
  if (serie.label) return serie.label;
  if (serie.bron_type === 'totaal') return `Totaal (${serie.meting})`;
  if (serie.bron_id == null) return `${serie.bron_type} (${serie.meting})`;

  if (serie.bron_type === 'rekening') {
    const r = db.prepare('SELECT naam FROM rekeningen WHERE id = ?').get(serie.bron_id) as { naam: string } | undefined;
    return r?.naam ?? `Rekening ${serie.bron_id}`;
  }
  if (serie.bron_type === 'rekening_groep') {
    const r = db.prepare('SELECT naam FROM rekening_groepen WHERE id = ?').get(serie.bron_id) as { naam: string } | undefined;
    return r?.naam ?? `Rekeninggroep ${serie.bron_id}`;
  }
  if (serie.bron_type === 'categorie') {
    const r = db.prepare('SELECT naam FROM budgetten_potjes WHERE id = ?').get(serie.bron_id) as { naam: string } | undefined;
    return r?.naam ?? `Categorie ${serie.bron_id}`;
  }
  if (serie.bron_type === 'subcategorie') {
    const r = db.prepare('SELECT categorie, naam FROM subcategorieen WHERE id = ?').get(serie.bron_id) as { categorie: string; naam: string } | undefined;
    return r ? (r.naam || r.categorie) : `Subcategorie ${serie.bron_id}`;
  }
  if (serie.bron_type === 'consolidatie') {
    const c = getConsolidatie(serie.bron_id);
    return c?.naam ?? `Consolidatie ${serie.bron_id}`;
  }
  return String(serie.bron_id);
}

function consolidatieData(
  db: DB, serie: TrendPanelSerie, schaal: XAsSchaal, configs: PeriodeConfig[],
  datumVan?: string, datumTot?: string,
): Map<string, number> {
  const resultaat = new Map<string, number>();
  if (serie.bron_id == null) return resultaat;
  const cons = getConsolidatie(serie.bron_id);
  if (!cons || cons.leden.length === 0) return resultaat;

  const lidBronType: BronType = cons.bron_type as ConsolidatieBronType;
  const saldoBron = serie.meting === 'saldo' && lidBronType === 'rekening';

  for (const lidId of cons.leden) {
    const virtSerie: TrendPanelSerie = { ...serie, bron_type: lidBronType, bron_id: lidId };
    const map = saldoBron
      ? rekeningSaldoData(db, virtSerie, schaal, configs, datumVan, datumTot)
      : transactieData(db, virtSerie, schaal, configs, datumVan, datumTot);
    for (const [b, v] of map) {
      resultaat.set(b, (resultaat.get(b) ?? 0) + v);
    }
  }
  for (const [k, v] of resultaat) resultaat.set(k, Math.round(v * 100) / 100);
  return resultaat;
}

function rekeningSaldoData(
  db: DB, serie: TrendPanelSerie, schaal: XAsSchaal, configs: PeriodeConfig[],
  datumVan?: string, datumTot?: string,
): Map<string, number> {
  const resultaat = new Map<string, number>();
  if (serie.bron_id == null) return resultaat;

  // Bepaal welke ibans meedoen: één rekening, of alle rekeningen in een groep.
  let ibans: string[] = [];
  if (serie.bron_type === 'rekening_groep') {
    ibans = (db.prepare(`
      SELECT r.iban FROM rekeningen r
      JOIN rekening_groep_rekeningen rgr ON rgr.rekening_id = r.id
      WHERE rgr.groep_id = ?
    `).all(serie.bron_id) as { iban: string }[]).map(r => r.iban);
  } else {
    const rek = db.prepare('SELECT iban FROM rekeningen WHERE id = ?').get(serie.bron_id) as { iban: string } | undefined;
    if (rek) ibans = [rek.iban];
  }
  if (ibans.length === 0) return resultaat;

  // Per rekening: laatste saldo per bucket. Combineer naar groep-totaal.
  const perRekPerBucket = new Map<string, Map<string, number>>(); // iban -> bucket -> saldo
  const placeholders = ibans.map(() => '?').join(',');
  const params: string[] = [...ibans];
  let filter = '';
  if (datumVan) { filter += ' AND datum >= ?'; params.push(datumVan); }
  if (datumTot) { filter += ' AND datum <= ?'; params.push(datumTot); }

  const rijen = db.prepare(`
    SELECT iban_bban, datum, saldo_na_trn, id
    FROM transacties
    WHERE iban_bban IN (${placeholders})
      AND saldo_na_trn IS NOT NULL
      AND datum IS NOT NULL
      ${filter}
    ORDER BY datum ASC, id ASC
  `).all(...params) as { iban_bban: string; datum: string; saldo_na_trn: number; id: number }[];

  for (const r of rijen) {
    const datum = new Date(r.datum + 'T00:00:00');
    const bucket = bucketVoorDatum(datum, schaal, configs);
    let map = perRekPerBucket.get(r.iban_bban);
    if (!map) { map = new Map(); perRekPerBucket.set(r.iban_bban, map); }
    map.set(bucket, r.saldo_na_trn); // ORDER BY datum ASC → laatst wint = eindsaldo per bucket
  }

  // Combineer: som per bucket over alle ibans.
  const alleBuckets = new Set<string>();
  for (const m of perRekPerBucket.values()) for (const b of m.keys()) alleBuckets.add(b);
  for (const b of alleBuckets) {
    let som = 0;
    for (const m of perRekPerBucket.values()) {
      const v = m.get(b);
      if (v != null) som += v;
    }
    resultaat.set(b, Math.round(som * 100) / 100);
  }
  return resultaat;
}

function transactieBronFilter(serie: TrendPanelSerie): { sql: string; params: (string | number)[] } {
  if (serie.bron_type === 'totaal' || serie.bron_id == null) {
    return { sql: '1=1', params: [] };
  }
  if (serie.bron_type === 'rekening') {
    return {
      sql: 't.iban_bban = (SELECT iban FROM rekeningen WHERE id = ?)',
      params: [serie.bron_id],
    };
  }
  if (serie.bron_type === 'rekening_groep') {
    return {
      sql: `t.iban_bban IN (
        SELECT r.iban FROM rekeningen r
        JOIN rekening_groep_rekeningen rgr ON rgr.rekening_id = r.id
        WHERE rgr.groep_id = ?
      )`,
      params: [serie.bron_id],
    };
  }
  if (serie.bron_type === 'categorie') {
    // bron_id = budgetten_potjes.id — filter via transactie_aanpassingen (zelfde logica als dashboard CAT).
    return {
      sql: `EXISTS (
        SELECT 1 FROM transactie_aanpassingen a
        LEFT JOIN categorieen c ON a.categorie_id = c.id
        JOIN budgetten_potjes bp ON bp.id = ?
        WHERE a.transactie_id = t.id
          AND COALESCE(c.categorie, a.categorie) = bp.naam
      )`,
      params: [serie.bron_id],
    };
  }
  // subcategorie — bron_id = subcategorieen.id → match op (categorie, naam) via aanpassingen.
  return {
    sql: `EXISTS (
      SELECT 1 FROM transactie_aanpassingen a
      LEFT JOIN categorieen c ON a.categorie_id = c.id
      JOIN subcategorieen s ON s.id = ?
      WHERE a.transactie_id = t.id
        AND COALESCE(c.categorie, a.categorie) = s.categorie
        AND COALESCE(c.subcategorie, a.subcategorie) = s.naam
    )`,
    params: [serie.bron_id],
  };
}

function metingFilter(meting: Meting): string {
  if (meting === 'uitgaven') return 't.bedrag < 0';
  if (meting === 'inkomsten') return 't.bedrag > 0';
  return '1=1';
}

function transactieData(
  db: DB, serie: TrendPanelSerie, schaal: XAsSchaal, configs: PeriodeConfig[],
  datumVan?: string, datumTot?: string,
): Map<string, number> {
  const resultaat = new Map<string, number>();
  const bronFilter = transactieBronFilter(serie);
  const mFilter = metingFilter(serie.meting);

  const extraParams: (string | number)[] = [];
  let periodeFilter = '';
  if (datumVan) { periodeFilter += ' AND t.datum >= ?'; extraParams.push(datumVan); }
  if (datumTot) { periodeFilter += ' AND t.datum <= ?'; extraParams.push(datumTot); }

  const sql = `
    SELECT t.datum, t.bedrag
    FROM transacties t
    WHERE t.datum IS NOT NULL
      AND t.type NOT IN ('omboeking-af','omboeking-bij')
      AND ${bronFilter.sql}
      AND ${mFilter}
      ${periodeFilter}
    ORDER BY t.datum ASC
  `;
  const rijen = db.prepare(sql).all(...bronFilter.params, ...extraParams) as { datum: string; bedrag: number }[];

  for (const r of rijen) {
    const datum = new Date(r.datum + 'T00:00:00');
    const bucket = bucketVoorDatum(datum, schaal, configs);
    const huidig = resultaat.get(bucket) ?? 0;
    if (serie.meting === 'aantal') {
      resultaat.set(bucket, huidig + 1);
    } else {
      const waarde = serie.meting === 'uitgaven' ? Math.abs(r.bedrag) : r.bedrag;
      resultaat.set(bucket, huidig + waarde);
    }
  }

  if (serie.meting !== 'aantal') {
    for (const [k, v] of resultaat) resultaat.set(k, Math.round(v * 100) / 100);
  }
  return resultaat;
}

function combineerCumulatief(map: Map<string, number>, buckets: string[]): Map<string, number> {
  const resultaat = new Map<string, number>();
  let som = 0;
  for (const b of buckets) {
    const w = map.get(b);
    if (w !== undefined) som += w;
    resultaat.set(b, Math.round(som * 100) / 100);
  }
  return resultaat;
}

export interface TrendPeriode { datum_van?: string; datum_tot?: string }

export function getTrendData(panel: TrendPanel, periode?: TrendPeriode): TrendData {
  const db = getDb();
  const configs = getPeriodeConfigs();
  const van = periode?.datum_van;

  // Upper-bound: einde van de laatste afgesloten (of actuele, als incl_actuele_maand)
  // periode. Toekomstige periodes doen nooit mee, ongeacht gebruikersfilter.
  const meegenomenStatussen: Array<'afgesloten' | 'actueel'> = panel.incl_actuele_maand
    ? ['afgesloten', 'actueel']
    : ['afgesloten'];
  const meegenomenPeriodes = getAllePeriodes().filter(p => meegenomenStatussen.includes(p.status as 'afgesloten' | 'actueel'));
  const cutoffPanel = meegenomenPeriodes.length > 0
    ? meegenomenPeriodes[meegenomenPeriodes.length - 1].eind
    : undefined;
  // Combineer met user-filter: de strengste (vroegste) datum wint.
  let tot = periode?.datum_tot;
  if (cutoffPanel && (!tot || cutoffPanel < tot)) tot = cutoffPanel;

  const perSerieData: Map<string, number>[] = [];
  const alleBuckets = new Set<string>();

  for (const serie of panel.series) {
    let map: Map<string, number>;
    if (serie.bron_type === 'consolidatie') {
      map = consolidatieData(db, serie, panel.x_as_schaal, configs, van, tot);
    } else {
      const saldoBron = serie.meting === 'saldo' && (serie.bron_type === 'rekening' || serie.bron_type === 'rekening_groep');
      map = saldoBron
        ? rekeningSaldoData(db, serie, panel.x_as_schaal, configs, van, tot)
        : transactieData(db, serie, panel.x_as_schaal, configs, van, tot);
    }
    for (const k of map.keys()) alleBuckets.add(k);
    perSerieData.push(map);
  }

  const buckets = bucketsSorteren(alleBuckets);

  const series: TrendSerieData[] = panel.series.map((serie, idx) => {
    let map = perSerieData[idx];
    if (panel.weergave === 'cumulatief' && serie.meting !== 'saldo') {
      map = combineerCumulatief(map, buckets);
    }
    const omkeren = serie.bedragen_omkeren && serie.meting !== 'aantal';
    return {
      id: serie.id,
      label: labelVoorSerie(db, serie),
      kleur: serie.kleur,
      as_zijde: serie.as_zijde,
      serie_type: serie.serie_type,
      data: buckets.map(b => {
        const v = map.get(b);
        if (v == null) return null;
        return omkeren ? -v : v;
      }),
    };
  });

  return { buckets, series };
}

export type { BronType, Meting };
