import getDb from '@/lib/db';

export interface PeriodeConfig {
  id: number;
  maandStartDag: number;
  geldigVanaf: string;  // 'YYYY-MM' of '0000-01' voor "alle maanden"
  aangemaaktOp: string;
}

export function getPeriodeConfigs(): PeriodeConfig[] {
  try {
    const rows = getDb()
      .prepare('SELECT id, maand_start_dag, geldig_vanaf, aangemaakt_op FROM periode_configuraties ORDER BY aangemaakt_op ASC')
      .all() as { id: number; maand_start_dag: number; geldig_vanaf: string; aangemaakt_op: string }[];
    return rows.map(r => ({
      id: r.id,
      maandStartDag: r.maand_start_dag,
      geldigVanaf: r.geldig_vanaf,
      aangemaaktOp: r.aangemaakt_op,
    }));
  } catch {
    // Tabel bestaat nog niet (migratie nog niet uitgevoerd) — gebruik instelling als fallback
    return [];
  }
}

/**
 * Helpers voor gebruik in routes die veel periodes verwerken (voorkomt herhaalde DB-queries).
 * Meest recent ingesteld wint bij meerdere toepasselijke configs.
 */
export function msdVoorPeriode(configs: PeriodeConfig[], jaar: number, maand: number): number {
  const jm = `${jaar}-${String(maand).padStart(2, '0')}`;
  const matches = configs.filter(c => c.geldigVanaf <= jm);
  if (matches.length === 0) return configs[0]?.maandStartDag ?? 27;
  // Meest recent ingesteld wint
  return matches.reduce((a, b) => a.aangemaaktOp > b.aangemaaktOp ? a : b).maandStartDag;
}

export function addPeriodeConfig(maandStartDag: number, geldigVanaf: string): void {
  getDb()
    .prepare('INSERT INTO periode_configuraties (maand_start_dag, geldig_vanaf) VALUES (?, ?)')
    .run(maandStartDag, geldigVanaf);
}

export function deletePeriodeConfig(id: number): void {
  const db = getDb();
  const rij = db.prepare('SELECT geldig_vanaf FROM periode_configuraties WHERE id = ?').get(id) as { geldig_vanaf: string } | undefined;
  if (!rij) throw new Error('Configuratie niet gevonden.');
  // De initiële catch-all (laagste id) mag alleen verwijderd worden als er geen specifieke
  // periode-configs meer zijn én er minstens één andere catch-all overblijft.
  const initCatchAll = db.prepare("SELECT id FROM periode_configuraties WHERE geldig_vanaf = '0000-01' ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
  if (initCatchAll && id === initCatchAll.id) {
    const aantalSpecifiek = (db.prepare("SELECT COUNT(*) AS n FROM periode_configuraties WHERE geldig_vanaf != '0000-01'").get() as { n: number }).n;
    if (aantalSpecifiek > 0) throw new Error('De initiële basisperiode kan niet verwijderd worden zolang er specifieke periode-instellingen zijn.');
    const aantalCatchAll = (db.prepare("SELECT COUNT(*) AS n FROM periode_configuraties WHERE geldig_vanaf = '0000-01'").get() as { n: number }).n;
    if (aantalCatchAll <= 1) throw new Error('Er moet altijd minstens één basisperiode (alle maanden) aanwezig zijn.');
  }
  db.prepare('DELETE FROM periode_configuraties WHERE id = ?').run(id);
}
