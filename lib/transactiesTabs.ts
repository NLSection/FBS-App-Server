import getDb from './db';

export interface TransactiesTab {
  id: number;
  type: 'groep' | 'rekening';
  entiteit_id: number;
  naam: string;
  volgorde: number;
}

export function getTransactiesTabs(): TransactiesTab[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT tt.id, tt.type, tt.entiteit_id, tt.volgorde,
      CASE
        WHEN tt.type = 'groep'    THEN rg.naam
        WHEN tt.type = 'rekening' THEN r.naam
      END AS naam
    FROM transacties_tabs tt
    LEFT JOIN rekening_groepen rg ON tt.type = 'groep'    AND tt.entiteit_id = rg.id
    LEFT JOIN rekeningen       r  ON tt.type = 'rekening' AND tt.entiteit_id = r.id
    ORDER BY tt.volgorde ASC
  `).all() as { id: number; type: string; entiteit_id: number; volgorde: number; naam: string | null }[];

  return rows.map(r => ({
    id:          r.id,
    type:        r.type as 'groep' | 'rekening',
    entiteit_id: r.entiteit_id,
    naam:        r.naam ?? `#${r.entiteit_id}`,
    volgorde:    r.volgorde,
  }));
}

export function addTransactiesTab(type: 'groep' | 'rekening', entiteit_id: number): number {
  const db = getDb();
  const maxVolgorde = (db.prepare('SELECT MAX(volgorde) as m FROM transacties_tabs').get() as { m: number | null }).m ?? -1;
  const result = db.prepare(
    'INSERT INTO transacties_tabs (type, entiteit_id, volgorde) VALUES (?, ?, ?)'
  ).run(type, entiteit_id, maxVolgorde + 1);
  return Number(result.lastInsertRowid);
}

export function deleteTransactiesTab(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM transacties_tabs WHERE id = ?').run(id);
}

export function reorderTransactiesTabs(items: { id: number; volgorde: number }[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE transacties_tabs SET volgorde = ? WHERE id = ?');
  const batch = db.transaction(() => { for (const item of items) stmt.run(item.volgorde, item.id); });
  batch();
}
