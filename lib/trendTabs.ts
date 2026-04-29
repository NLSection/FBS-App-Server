import getDb from '@/lib/db';

export interface TrendTab {
  id: number;
  naam: string;
  volgorde: number;
}

export function getTrendTabs(): TrendTab[] {
  const db = getDb();
  return db.prepare('SELECT id, naam, volgorde FROM trend_tabs ORDER BY volgorde ASC, id ASC').all() as TrendTab[];
}

export function createTrendTab(naam: string): TrendTab {
  const db = getDb();
  const max = (db.prepare('SELECT MAX(volgorde) AS m FROM trend_tabs').get() as { m: number | null }).m ?? -1;
  const res = db.prepare('INSERT INTO trend_tabs (naam, volgorde) VALUES (?, ?)').run(naam, max + 1);
  return { id: Number(res.lastInsertRowid), naam, volgorde: max + 1 };
}

export function updateTrendTab(id: number, naam: string): boolean {
  const db = getDb();
  const r = db.prepare('UPDATE trend_tabs SET naam = ? WHERE id = ?').run(naam, id);
  return r.changes > 0;
}

export function deleteTrendTab(id: number): boolean {
  const db = getDb();
  // Alleen verwijderen als het niet de laatste tab is.
  const n = (db.prepare('SELECT COUNT(*) AS n FROM trend_tabs').get() as { n: number }).n;
  if (n <= 1) return false;
  // Panelen van deze tab naar een andere tab verplaatsen (eerste beschikbare anders dan deze).
  const andere = db.prepare('SELECT id FROM trend_tabs WHERE id != ? ORDER BY volgorde ASC LIMIT 1').get(id) as { id: number } | undefined;
  if (andere) db.prepare('UPDATE trend_panels SET tab_id = ? WHERE tab_id = ?').run(andere.id, id);
  const r = db.prepare('DELETE FROM trend_tabs WHERE id = ?').run(id);
  return r.changes > 0;
}

export function updateTrendTabsVolgorde(tabIds: number[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE trend_tabs SET volgorde = ? WHERE id = ?');
  const tx = db.transaction(() => {
    tabIds.forEach((id, idx) => stmt.run(idx, id));
  });
  tx();
}
