import getDb from '@/lib/db';

export type ConsolidatieBronType = 'rekening' | 'categorie' | 'subcategorie';

export interface TrendConsolidatie {
  id: number;
  naam: string;
  bron_type: ConsolidatieBronType;
  volgorde: number;
  leden: number[];
}

interface ConsolidatieRij {
  id: number;
  naam: string;
  bron_type: string;
  volgorde: number;
}

interface LidRij {
  consolidatie_id: number;
  bron_id: number;
}

export function getAllConsolidaties(): TrendConsolidatie[] {
  const db = getDb();
  const rijen = db.prepare('SELECT * FROM trend_consolidaties ORDER BY volgorde ASC, id ASC').all() as ConsolidatieRij[];
  if (rijen.length === 0) return [];
  const leden = db.prepare('SELECT consolidatie_id, bron_id FROM trend_consolidatie_leden ORDER BY consolidatie_id ASC, bron_id ASC').all() as LidRij[];
  const ledenPer = new Map<number, number[]>();
  for (const l of leden) {
    if (!ledenPer.has(l.consolidatie_id)) ledenPer.set(l.consolidatie_id, []);
    ledenPer.get(l.consolidatie_id)!.push(l.bron_id);
  }
  return rijen.map(r => ({
    id: r.id,
    naam: r.naam,
    bron_type: r.bron_type as ConsolidatieBronType,
    volgorde: r.volgorde,
    leden: ledenPer.get(r.id) ?? [],
  }));
}

export function getConsolidatie(id: number): TrendConsolidatie | null {
  const db = getDb();
  const rij = db.prepare('SELECT * FROM trend_consolidaties WHERE id = ?').get(id) as ConsolidatieRij | undefined;
  if (!rij) return null;
  const leden = (db.prepare('SELECT bron_id FROM trend_consolidatie_leden WHERE consolidatie_id = ? ORDER BY bron_id ASC').all(id) as { bron_id: number }[]).map(x => x.bron_id);
  return {
    id: rij.id,
    naam: rij.naam,
    bron_type: rij.bron_type as ConsolidatieBronType,
    volgorde: rij.volgorde,
    leden,
  };
}

export interface ConsolidatieInput {
  naam: string;
  bron_type: ConsolidatieBronType;
  leden: number[];
}

export function createConsolidatie(data: ConsolidatieInput): TrendConsolidatie {
  const db = getDb();
  const maxV = (db.prepare('SELECT MAX(volgorde) AS m FROM trend_consolidaties').get() as { m: number | null }).m ?? -1;
  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO trend_consolidaties (naam, bron_type, volgorde) VALUES (?, ?, ?)').run(
      data.naam, data.bron_type, maxV + 1,
    );
    const id = Number(r.lastInsertRowid);
    if (data.leden.length > 0) vervangLeden(id, data.leden);
    return id;
  });
  return getConsolidatie(tx())!;
}

export function updateConsolidatie(id: number, data: Partial<ConsolidatieInput>): TrendConsolidatie | null {
  const db = getDb();
  const huidig = getConsolidatie(id);
  if (!huidig) return null;
  const tx = db.transaction(() => {
    if (data.naam !== undefined || data.bron_type !== undefined) {
      db.prepare('UPDATE trend_consolidaties SET naam = ?, bron_type = ? WHERE id = ?').run(
        data.naam ?? huidig.naam,
        data.bron_type ?? huidig.bron_type,
        id,
      );
    }
    if (data.leden !== undefined) vervangLeden(id, data.leden);
  });
  tx();
  return getConsolidatie(id);
}

export function deleteConsolidatie(id: number): boolean {
  const db = getDb();
  const r = db.prepare('DELETE FROM trend_consolidaties WHERE id = ?').run(id);
  return r.changes > 0;
}

function vervangLeden(consolidatieId: number, leden: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM trend_consolidatie_leden WHERE consolidatie_id = ?').run(consolidatieId);
  if (leden.length === 0) return;
  const stmt = db.prepare('INSERT INTO trend_consolidatie_leden (consolidatie_id, bron_id) VALUES (?, ?)');
  for (const lid of leden) stmt.run(consolidatieId, lid);
}
