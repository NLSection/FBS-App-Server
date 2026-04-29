import getDb from '@/lib/db';

export interface RekeningGroep {
  id: number;
  naam: string;
  volgorde: number;
  rekening_ids: number[];
}

export function getRekeningGroepen(): RekeningGroep[] {
  const db = getDb();
  const groepen = db.prepare(
    'SELECT id, naam, volgorde FROM rekening_groepen ORDER BY volgorde ASC, id ASC'
  ).all() as Omit<RekeningGroep, 'rekening_ids'>[];

  const koppelingen = db.prepare(
    'SELECT groep_id, rekening_id FROM rekening_groep_rekeningen'
  ).all() as { groep_id: number; rekening_id: number }[];

  const koppelingMap = new Map<number, number[]>();
  for (const k of koppelingen) {
    if (!koppelingMap.has(k.groep_id)) koppelingMap.set(k.groep_id, []);
    koppelingMap.get(k.groep_id)!.push(k.rekening_id);
  }

  return groepen.map(g => ({
    ...g,
    rekening_ids: koppelingMap.get(g.id) ?? [],
  }));
}

export function getRekeningGroep(id: number): RekeningGroep | undefined {
  return getRekeningGroepen().find(g => g.id === id);
}

export function insertRekeningGroep(naam: string, rekening_ids: number[]): number {
  const db = getDb();
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  const maxVolgorde = db.prepare('SELECT COALESCE(MAX(volgorde), -1) AS m FROM rekening_groepen').get() as { m: number };
  const result = db.prepare('INSERT INTO rekening_groepen (naam, volgorde) VALUES (?, ?)').run(naam.trim(), maxVolgorde.m + 1);
  const id = Number(result.lastInsertRowid);
  setGroepKoppelingen(db, id, rekening_ids);
  return id;
}

export function updateRekeningGroep(id: number, naam?: string, rekening_ids?: number[]): void {
  const db = getDb();
  const rij = db.prepare('SELECT id FROM rekening_groepen WHERE id = ?').get(id);
  if (!rij) throw new Error('Rekeninggroep niet gevonden.');
  db.transaction(() => {
    if (naam !== undefined) {
      if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
      db.prepare('UPDATE rekening_groepen SET naam = ? WHERE id = ?').run(naam.trim(), id);
    }
    if (rekening_ids !== undefined) {
      setGroepKoppelingen(db, id, rekening_ids);
    }
  })();
}

export function deleteRekeningGroep(id: number): void {
  const db = getDb();
  const rij = db.prepare('SELECT id FROM rekening_groepen WHERE id = ?').get(id);
  if (!rij) throw new Error('Rekeninggroep niet gevonden.');
  db.prepare('DELETE FROM rekening_groepen WHERE id = ?').run(id);
}

export function updateRekeningGroepenVolgorde(items: { id: number; volgorde: number }[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE rekening_groepen SET volgorde = ? WHERE id = ?');
  db.transaction(() => {
    for (const item of items) {
      stmt.run(item.volgorde, item.id);
    }
  })();
}

function setGroepKoppelingen(db: ReturnType<typeof getDb>, groepId: number, rekeningIds: number[]): void {
  db.prepare('DELETE FROM rekening_groep_rekeningen WHERE groep_id = ?').run(groepId);
  const ins = db.prepare('INSERT OR IGNORE INTO rekening_groep_rekeningen (groep_id, rekening_id) VALUES (?, ?)');
  for (const rId of rekeningIds) {
    ins.run(groepId, rId);
  }
}
