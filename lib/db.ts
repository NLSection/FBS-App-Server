// FILE: db.ts
// AANGEMAAKT: 25-03-2026 10:00
// VERSIE: 1
// GEWIJZIGD: 04-04-2026 22:30
//
// WIJZIGINGEN (25-03-2026 10:00):
// - Initiële aanmaak: singleton SQLite verbinding naar fbs.db
// WIJZIGINGEN (03-04-2026 22:00):
// - Migratie: cat_uitklappen kolom toegevoegd aan instellingen tabel
// WIJZIGINGEN (04-04-2026 22:30):
// - Fix: UPDATE die cat_uitklappen=0 steeds resette naar 1 verwijderd

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { leesActieContext } from './wijzigingContext';

export const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'fbs.db');
const EMPTY_DB_PATH = path.join(path.dirname(DB_PATH), 'fbs-dev-empty.db');

declare global {
  // eslint-disable-next-line no-var
  var _db: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var _emptyDb: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var _useEmptyDb: boolean | undefined;
}

function applyPragmas(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -32768');
  db.pragma('mmap_size = 134217728');
  db.pragma('temp_store = MEMORY');
  registerUDFs(db);
}

/**
 * Registreert de actie-context UDFs die door de wijziging_log-triggers worden
 * gebruikt. De triggers schrijven elke INSERT/UPDATE/DELETE naar wijziging_log
 * met de actie_id/type/beschrijving van de huidige request — gelezen uit de
 * AsyncLocalStorage-context via deze functies.
 */
function registerUDFs(db: Database.Database) {
  db.function('huidige_actie_id',     () => leesActieContext().actieId);
  db.function('huidige_actie_type',   () => leesActieContext().type);
  db.function('huidige_actie_beschrijving', () => leesActieContext().beschrijving);
  // Triggers gebruiken WHEN log_actief() = 1 om gehele logging-pauze te respecteren
  db.function('log_actief', () => leesActieContext().loggingActief ? 1 : 0);
}

export function initFallbackSchema(db: Database.Database) {
  // Idempotente tabel/kolom checks — draaien voor zowel echte als lege DB
  db.prepare(`
    CREATE TABLE IF NOT EXISTS genegeerde_rekeningen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iban TEXT NOT NULL UNIQUE,
      datum_toegevoegd TEXT NOT NULL DEFAULT (date('now'))
    )
  `).run();
  try { db.prepare('ALTER TABLE instellingen ADD COLUMN cat_uitklappen INTEGER DEFAULT 1').run(); } catch {}
  try { db.prepare('ALTER TABLE instellingen ADD COLUMN vaste_posten_buffer REAL NOT NULL DEFAULT 0').run(); } catch {}
  try { db.prepare('ALTER TABLE instellingen ADD COLUMN vaste_posten_vergelijk_maanden INTEGER DEFAULT 3').run(); } catch {}
  try { db.prepare('ALTER TABLE rekeningen ADD COLUMN kleur_auto INTEGER NOT NULL DEFAULT 1').run(); } catch {}
  try { db.prepare('ALTER TABLE budgetten_potjes ADD COLUMN kleur_auto INTEGER NOT NULL DEFAULT 1').run(); } catch {}
  try { db.prepare("ALTER TABLE instellingen ADD COLUMN update_kanaal TEXT NOT NULL DEFAULT 'main'").run(); } catch {}
}

function openDb(dbPath: string): Database.Database {
  try {
    const db = new Database(dbPath);
    applyPragmas(db);
    return db;
  } catch (err) {
    // WAL/SHM inconsistentie na harde afsluiting — checkpoint + verwijder en heropen
    const code = (err as { code?: string }).code;
    if (code === 'SQLITE_IOERR_TRUNCATE' || code === 'SQLITE_IOERR' || code === 'SQLITE_CORRUPT') {
      console.warn('[db] WAL-herstel gestart wegens:', code);
      try {
        const db = new Database(dbPath);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch { /* als zelfs dit faalt, doorgaan naar verwijder-poging */ }
      for (const ext of ['-wal', '-shm']) {
        try { fs.unlinkSync(dbPath + ext); } catch { /* bestaat mogelijk niet */ }
      }
      const db = new Database(dbPath);
      applyPragmas(db);
      return db;
    }
    throw err;
  }
}

function getDb(): Database.Database {
  if (global._useEmptyDb) {
    if (!global._emptyDb) throw new Error('Lege DB niet geïnitialiseerd');
    return global._emptyDb;
  }
  if (!global._db) {
    global._db = openDb(DB_PATH);
    initFallbackSchema(global._db);
  }
  return global._db;
}

export function setUseEmptyDb(val: boolean): void {
  if (val) {
    if (global._emptyDb) {
      try { global._emptyDb.close(); } catch {}
      global._emptyDb = undefined;
    }
    if (fs.existsSync(EMPTY_DB_PATH)) fs.unlinkSync(EMPTY_DB_PATH);
    global._emptyDb = openDb(EMPTY_DB_PATH);
    global._useEmptyDb = true;
    // initFallbackSchema draait NA runMigrations in switch-db route (migrations creeren basis-schema eerst)
  } else {
    global._useEmptyDb = false;
  }
}

export function getUseEmptyDb(): boolean {
  return global._useEmptyDb === true;
}

export default getDb;
