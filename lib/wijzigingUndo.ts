// Reverse-operaties + forward-replay voor wijziging_log entries — gedeeld
// door restore-naar-punt, per-actie undo en diff-replay binnen restore.
//
// Reverse-mapping (draaiTerug):
// - INSERT  → DELETE FROM tabel WHERE <pk>
// - DELETE  → INSERT INTO tabel (...) VALUES (...) uit voor_json
// - UPDATE  → UPDATE tabel SET <alle kolommen> = voor_json.* WHERE <pk>
//
// Forward-mapping (pasToe): omgekeerd — past `na_json` toe.
//
// Tabellen met expliciete `id INTEGER PRIMARY KEY` gebruiken die kolom als pk;
// koppeltabellen zonder enkelvoudige id worden geïdentificeerd door alle
// kolommen te vergelijken (NULL-safe via IS).
//
// === Schema-evolutie robuustheid (DIR-20) ===
// Diff-files kunnen entries bevatten van een vorige appversie. Bij restore
// loopt eerst `runMigrations()` op het anker, dus replay gebeurt op de
// HUIDIGE schema-staat — kolommen kunnen hernoemd, tabellen gedropt,
// kolommen toegevoegd zijn sinds de entry werd opgeslagen.
//
// Daarom zijn beide functies defensief:
// - Tabel bestaat niet meer → silent skip (return). Caller krijgt geen
//   exception; wijziging is "verloren" maar restore stopt niet halverwege.
// - Kolom in voor_json/na_json bestaat niet meer in de huidige tabel →
//   wordt vóór de SQL-call uit het object gefilterd. Niet-bestaande
//   kolommen worden dus gewoon overgeslagen.
// - Nieuwe NOT NULL-kolom in de huidige tabel die niet in de entry zit →
//   SQLite vult de DEFAULT-waarde (DIR-20 vereist DEFAULT op nieuwe NOT
//   NULL-kolommen). Geen actie nodig vanuit deze code.

import type Database from 'better-sqlite3';

export type LogRij = {
  id: number;
  actie_id: string;
  tabel: string;
  rij_id: number | null;
  operatie: 'insert' | 'update' | 'delete';
  voor_json: string | null;
  na_json: string | null;
};

// Cache tabel → set van kolomnamen. Wordt geïnvalideerd door
// `wisSchemaCache()` na een runMigrations()-call.
const tabelKolommenCache = new Map<string, Set<string> | null>();

function tabelKolommen(db: Database.Database, tabel: string): Set<string> | null {
  if (tabelKolommenCache.has(tabel)) return tabelKolommenCache.get(tabel)!;
  let set: Set<string> | null = null;
  try {
    const cols = db.prepare(`PRAGMA table_info("${tabel}")`).all() as { name: string }[];
    if (cols.length > 0) set = new Set(cols.map(c => c.name));
  } catch { set = null; }
  tabelKolommenCache.set(tabel, set);
  return set;
}

/** Verwijder schema-cache. Roep aan na runMigrations() of file-replace
 *  zodat opvolgende replay-calls de actuele kolomlijst lezen. */
export function wisSchemaCache(): void {
  tabelKolommenCache.clear();
}

function filterBestaandeKolommen(
  data: Record<string, unknown>,
  bestaande: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (bestaande.has(k)) result[k] = v;
  }
  return result;
}

export function draaiTerug(db: Database.Database, e: LogRij): void {
  const kolommen = tabelKolommen(db, e.tabel);
  if (!kolommen) return; // tabel bestaat niet meer — entry overslaan
  const heeftId = kolommen.has('id');

  if (e.operatie === 'insert') {
    const naDataRaw = e.na_json ? JSON.parse(e.na_json) as Record<string, unknown> : {};
    if (heeftId && e.rij_id !== null) {
      db.prepare(`DELETE FROM "${e.tabel}" WHERE id = ?`).run(e.rij_id);
    } else {
      const naData = filterBestaandeKolommen(naDataRaw, kolommen);
      const cols = Object.keys(naData);
      if (cols.length === 0) return;
      const whereParts = cols.map(c => `"${c}" IS ?`);
      db.prepare(`DELETE FROM "${e.tabel}" WHERE ${whereParts.join(' AND ')}`)
        .run(...cols.map(c => naData[c]));
    }
    return;
  }

  if (e.operatie === 'delete') {
    const voorDataRaw = e.voor_json ? JSON.parse(e.voor_json) as Record<string, unknown> : {};
    const voorData = filterBestaandeKolommen(voorDataRaw, kolommen);
    const cols = Object.keys(voorData);
    if (cols.length === 0) return;
    const placeholders = cols.map(() => '?').join(', ');
    db.prepare(`INSERT INTO "${e.tabel}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`)
      .run(...cols.map(c => voorData[c]));
    return;
  }

  if (e.operatie === 'update') {
    const voorDataRaw = e.voor_json ? JSON.parse(e.voor_json) as Record<string, unknown> : {};
    const naDataRaw   = e.na_json   ? JSON.parse(e.na_json)   as Record<string, unknown> : {};
    const voorData = filterBestaandeKolommen(voorDataRaw, kolommen);
    const naData   = filterBestaandeKolommen(naDataRaw, kolommen);
    if (heeftId) {
      const idVal = (naData.id ?? voorData.id ?? e.rij_id) as number | undefined;
      if (idVal === undefined) return;
      const cols = Object.keys(voorData).filter(c => c !== 'id');
      if (cols.length === 0) return;
      const setClause = cols.map(c => `"${c}" = ?`).join(', ');
      db.prepare(`UPDATE "${e.tabel}" SET ${setClause} WHERE id = ?`)
        .run(...cols.map(c => voorData[c]), idVal);
    } else {
      const allCols = Object.keys(voorData);
      if (allCols.length === 0) return;
      const setClause = allCols.map(c => `"${c}" = ?`).join(', ');
      const whereParts = allCols.map(c => `"${c}" IS ?`);
      db.prepare(`UPDATE "${e.tabel}" SET ${setClause} WHERE ${whereParts.join(' AND ')}`)
        .run(...allCols.map(c => voorData[c]), ...allCols.map(c => naData[c] ?? null));
    }
  }
}

export function pasToe(db: Database.Database, e: LogRij): void {
  const kolommen = tabelKolommen(db, e.tabel);
  if (!kolommen) return; // tabel bestaat niet meer — entry overslaan
  const heeftId = kolommen.has('id');

  if (e.operatie === 'insert') {
    const naDataRaw = e.na_json ? JSON.parse(e.na_json) as Record<string, unknown> : {};
    const naData = filterBestaandeKolommen(naDataRaw, kolommen);
    const cols = Object.keys(naData);
    if (cols.length === 0) return;
    const placeholders = cols.map(() => '?').join(', ');
    db.prepare(`INSERT INTO "${e.tabel}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`)
      .run(...cols.map(c => naData[c]));
    return;
  }

  if (e.operatie === 'delete') {
    const voorDataRaw = e.voor_json ? JSON.parse(e.voor_json) as Record<string, unknown> : {};
    if (heeftId && e.rij_id !== null) {
      db.prepare(`DELETE FROM "${e.tabel}" WHERE id = ?`).run(e.rij_id);
    } else {
      const voorData = filterBestaandeKolommen(voorDataRaw, kolommen);
      const cols = Object.keys(voorData);
      if (cols.length === 0) return;
      const whereParts = cols.map(c => `"${c}" IS ?`);
      db.prepare(`DELETE FROM "${e.tabel}" WHERE ${whereParts.join(' AND ')}`)
        .run(...cols.map(c => voorData[c]));
    }
    return;
  }

  if (e.operatie === 'update') {
    const voorDataRaw = e.voor_json ? JSON.parse(e.voor_json) as Record<string, unknown> : {};
    const naDataRaw   = e.na_json   ? JSON.parse(e.na_json)   as Record<string, unknown> : {};
    const voorData = filterBestaandeKolommen(voorDataRaw, kolommen);
    const naData   = filterBestaandeKolommen(naDataRaw, kolommen);
    if (heeftId) {
      const idVal = (voorData.id ?? naData.id ?? e.rij_id) as number | undefined;
      if (idVal === undefined) return;
      const cols = Object.keys(naData).filter(c => c !== 'id');
      if (cols.length === 0) return;
      const setClause = cols.map(c => `"${c}" = ?`).join(', ');
      db.prepare(`UPDATE "${e.tabel}" SET ${setClause} WHERE id = ?`)
        .run(...cols.map(c => naData[c]), idVal);
    } else {
      const allCols = Object.keys(naData);
      if (allCols.length === 0) return;
      const setClause = allCols.map(c => `"${c}" = ?`).join(', ');
      const whereParts = allCols.map(c => `"${c}" IS ?`);
      db.prepare(`UPDATE "${e.tabel}" SET ${setClause} WHERE ${whereParts.join(' AND ')}`)
        .run(...allCols.map(c => naData[c]), ...allCols.map(c => voorData[c] ?? null));
    }
  }
}

/**
 * Detecteert of een latere actie (na deze entry) dezelfde (tabel, rij_id) heeft
 * aangeraakt. Wordt gebruikt door per-actie undo: bij conflict moet de gebruiker
 * bewust kiezen om óf alle latere wijzigingen te negeren, óf ook die mee terug
 * te draaien. Returnt de log-entry-ids van conflicterende latere wijzigingen.
 */
export function vindLatereConflicten(
  db: Database.Database,
  actieEntries: LogRij[],
): { entryId: number; tabel: string; rij_id: number | null; latereActieId: string }[] {
  if (actieEntries.length === 0) return [];
  const maxId = Math.max(...actieEntries.map(e => e.id));
  const conflicten: { entryId: number; tabel: string; rij_id: number | null; latereActieId: string }[] = [];
  const stmt = db.prepare(`
    SELECT id, actie_id FROM wijziging_log
    WHERE id > ? AND tabel = ? AND rij_id IS ? AND teruggedraaid = 0
    LIMIT 1
  `);
  for (const e of actieEntries) {
    const rij = stmt.get(maxId, e.tabel, e.rij_id) as { id: number; actie_id: string } | undefined;
    if (rij && rij.actie_id !== e.actie_id) {
      conflicten.push({ entryId: e.id, tabel: e.tabel, rij_id: e.rij_id, latereActieId: rij.actie_id });
    }
  }
  return conflicten;
}
