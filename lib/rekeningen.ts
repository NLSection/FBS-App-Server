// FILE: rekeningen.ts
//
// CRUD-queries voor de rekeningen-tabel.

import getDb from '@/lib/db';

export interface Rekening {
  id: number;
  iban: string;
  naam: string;
  type: 'betaal' | 'spaar';
  kleur: string | null;
  kleur_auto: number;
}

export function getRekeningen(): Rekening[] {
  return getDb()
    .prepare('SELECT id, iban, naam, type, kleur, kleur_auto FROM rekeningen ORDER BY type, naam')
    .all() as Rekening[];
}

export function insertRekening(iban: string, naam: string, type: 'betaal' | 'spaar', kleur?: string | null, kleurAuto?: number): number {
  if (!iban.trim()) throw new Error('IBAN mag niet leeg zijn.');
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  const result = getDb()
    .prepare('INSERT INTO rekeningen (iban, naam, type, kleur, kleur_auto) VALUES (?, ?, ?, ?, ?)')
    .run(iban.trim().toUpperCase(), naam.trim(), type, kleur ?? null, kleurAuto ?? 1);
  return Number(result.lastInsertRowid);
}

export function updateRekening(id: number, iban: string, naam: string, type: 'betaal' | 'spaar', kleur?: string | null, kleurAuto?: number): void {
  if (!iban.trim()) throw new Error('IBAN mag niet leeg zijn.');
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  getDb()
    .prepare('UPDATE rekeningen SET iban = ?, naam = ?, type = ?, kleur = ?, kleur_auto = ? WHERE id = ?')
    .run(iban.trim().toUpperCase(), naam.trim(), type, kleur ?? null, kleurAuto ?? 1, id);
}

export function deleteRekening(id: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('UPDATE budgetten_potjes SET rekening_id = NULL WHERE rekening_id = ?').run(id);
    db.prepare('DELETE FROM rekeningen WHERE id = ?').run(id);
  })();
}
