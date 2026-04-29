import getDb from '@/lib/db';

export interface VpGroep {
  id: number;
  naam: string;
  subcategorieen: string[];
}

export function getVpGroepen(): VpGroep[] {
  const db = getDb();
  const groepen = db.prepare('SELECT id, naam FROM vp_groepen ORDER BY naam').all() as { id: number; naam: string }[];
  const koppelingen = db.prepare('SELECT groep_id, subcategorie FROM vp_groep_subcategorieen').all() as { groep_id: number; subcategorie: string }[];
  const map = new Map<number, string[]>();
  for (const k of koppelingen) {
    if (!map.has(k.groep_id)) map.set(k.groep_id, []);
    map.get(k.groep_id)!.push(k.subcategorie);
  }
  return groepen.map(g => ({ ...g, subcategorieen: map.get(g.id) ?? [] }));
}

export function createVpGroep(naam: string): number {
  const db = getDb();
  const result = db.prepare('INSERT INTO vp_groepen (naam) VALUES (?)').run(naam.trim());
  return result.lastInsertRowid as number;
}

export function renameVpGroep(id: number, naam: string): void {
  const db = getDb();
  db.prepare('UPDATE vp_groepen SET naam = ? WHERE id = ?').run(naam.trim(), id);
}

export function deleteVpGroep(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM vp_groepen WHERE id = ?').run(id);
}

export function addSubcategorieToGroep(groepId: number, subcategorie: string): void {
  const db = getDb();
  // Verwijder eerst uit andere groep indien aanwezig
  db.prepare('DELETE FROM vp_groep_subcategorieen WHERE subcategorie = ?').run(subcategorie);
  db.prepare('INSERT INTO vp_groep_subcategorieen (groep_id, subcategorie) VALUES (?, ?)').run(groepId, subcategorie);
}

export function removeSubcategorieFromGroep(subcategorie: string): void {
  const db = getDb();
  db.prepare('DELETE FROM vp_groep_subcategorieen WHERE subcategorie = ?').run(subcategorie);
}
