import getDb from './db';

export interface DashboardTab {
  id: number;
  type: 'groep' | 'rekening';
  entiteit_id: number;
  naam: string;
  bls_tonen: boolean;
  cat_tonen: boolean;
  bls_trx_uitgeklapt: boolean;
  cat_uitklappen: boolean;
  cat_trx_uitgeklapt: boolean;
  volgorde: number;
}

export function getDashboardTabs(): DashboardTab[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT dt.id, dt.type, dt.entiteit_id, dt.bls_tonen, dt.cat_tonen,
           dt.bls_trx_uitgeklapt, dt.cat_uitklappen, dt.cat_trx_uitgeklapt, dt.volgorde,
      CASE
        WHEN dt.type = 'groep'     THEN rg.naam
        WHEN dt.type = 'rekening'  THEN r.naam
      END AS naam
    FROM dashboard_tabs dt
    LEFT JOIN rekening_groepen rg ON dt.type = 'groep'    AND dt.entiteit_id = rg.id
    LEFT JOIN rekeningen       r  ON dt.type = 'rekening' AND dt.entiteit_id = r.id
    ORDER BY dt.volgorde ASC
  `).all() as { id: number; type: string; entiteit_id: number; bls_tonen: number; cat_tonen: number; bls_trx_uitgeklapt: number; cat_uitklappen: number; cat_trx_uitgeklapt: number; volgorde: number; naam: string | null }[];

  return rows.map(r => ({
    id:                 r.id,
    type:               r.type as 'groep' | 'rekening',
    entiteit_id:        r.entiteit_id,
    naam:               r.naam ?? `#${r.entiteit_id}`,
    bls_tonen:          Boolean(r.bls_tonen),
    cat_tonen:          Boolean(r.cat_tonen),
    bls_trx_uitgeklapt: Boolean(r.bls_trx_uitgeklapt),
    cat_uitklappen:     Boolean(r.cat_uitklappen),
    cat_trx_uitgeklapt: Boolean(r.cat_trx_uitgeklapt),
    volgorde:           r.volgorde,
  }));
}

export function addDashboardTab(type: 'groep' | 'rekening', entiteit_id: number, blsTonen = true, catTonen = true): number {
  const db = getDb();
  const maxVolgorde = (db.prepare('SELECT MAX(volgorde) as m FROM dashboard_tabs').get() as { m: number | null }).m ?? -1;
  const result = db.prepare(
    'INSERT INTO dashboard_tabs (type, entiteit_id, bls_tonen, cat_tonen, volgorde) VALUES (?, ?, ?, ?, ?)'
  ).run(type, entiteit_id, blsTonen ? 1 : 0, catTonen ? 1 : 0, maxVolgorde + 1);
  return Number(result.lastInsertRowid);
}

export function updateDashboardTab(id: number, update: { bls_tonen?: boolean; cat_tonen?: boolean; bls_trx_uitgeklapt?: boolean; cat_uitklappen?: boolean; cat_trx_uitgeklapt?: boolean }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (update.bls_tonen          !== undefined) { fields.push('bls_tonen = ?');          values.push(update.bls_tonen ? 1 : 0); }
  if (update.cat_tonen          !== undefined) { fields.push('cat_tonen = ?');          values.push(update.cat_tonen ? 1 : 0); }
  if (update.bls_trx_uitgeklapt !== undefined) { fields.push('bls_trx_uitgeklapt = ?'); values.push(update.bls_trx_uitgeklapt ? 1 : 0); }
  if (update.cat_uitklappen     !== undefined) { fields.push('cat_uitklappen = ?');     values.push(update.cat_uitklappen ? 1 : 0); }
  if (update.cat_trx_uitgeklapt !== undefined) { fields.push('cat_trx_uitgeklapt = ?'); values.push(update.cat_trx_uitgeklapt ? 1 : 0); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE dashboard_tabs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteDashboardTab(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM dashboard_tabs WHERE id = ?').run(id);
}

export function resetDashboardTabsProfiel(blsTonen: boolean, catTonen: boolean): void {
  getDb().prepare('UPDATE dashboard_tabs SET bls_tonen = ?, cat_tonen = ?').run(blsTonen ? 1 : 0, catTonen ? 1 : 0);
}

export function reorderDashboardTabs(items: { id: number; volgorde: number }[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE dashboard_tabs SET volgorde = ? WHERE id = ?');
  const batch = db.transaction(() => { for (const item of items) stmt.run(item.volgorde, item.id); });
  batch();
}
