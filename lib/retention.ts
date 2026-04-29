// Per-dag set retention (F5.2).
//
// Een set bestaat uit:
//   - backup_anker_<YYYY-MM-DD>.sqlite.gz   (of .sqlite.enc.gz)
//   - backup_anker_<YYYY-MM-DD>.meta.json   (sidecar)
//   - wlog_<YYYY-MM-DD>.ndjson.gz           (of .ndjson.enc.gz)
//   - wlog_<YYYY-MM-DD>.meta.json
//
// Retention-regel: een set verloopt als z'n datum > `bewaarDagen` geleden is,
// MET ÉÉN UITZONDERING — de jongste set (= hoogste datum) blijft altijd
// staan, ongeacht leeftijd. Dat is het minimum-vangnet zodat een gebruiker
// die de app weken niet opent niet z'n hele backup-historie kwijtraakt.
//
// Verlopen sets worden in z'n geheel verwijderd — anker + diff + meta +
// sidecars samen. Geen halve sets (anker zonder diff is voor restore-naar-
// punt nutteloos en omgekeerd).
//
// Daarnaast: losse snapshots (`backup_<timestamp>.sqlite.gz` zonder anker-
// prefix, bv. handmatige of pre-restore backups) krijgen dezelfde leeftijd-
// gebaseerde retention zonder uitzondering. Die staan los van het set-systeem.
//
// Werkt op zowel lokale BACKUP_DIR als externe locatie. backup_log-cleanup
// alleen voor lokaal — extern bevat entries van andere apparaten.

import fs from 'fs';
import path from 'path';
import getDb from './db';
import { BACKUP_DIR, sidecarNaam } from './backup';

const SET_DATUM_REGEX = /^backup_anker_(\d{4}-\d{2}-\d{2})\.sqlite(\.enc)?\.gz$/;
const WLOG_DATUM_REGEX = /^wlog_(\d{4}-\d{2}-\d{2})\.(ndjson(?:\.enc)?\.gz|meta\.json)$/;
const LOSSE_SNAPSHOT_REGEX = /^backup_\d{4}-\d{2}-\d{2}_[\d-]+\.sqlite(\.enc)?\.gz$/;

/** Datum (YYYY-MM-DD) → lijst bestanden die bij die set horen. */
export function verzamelSets(dir: string): Map<string, string[]> {
  const sets = new Map<string, string[]>();
  if (!fs.existsSync(dir)) return sets;
  for (const f of fs.readdirSync(dir)) {
    let datum: string | null = null;
    const ankerMatch = f.match(SET_DATUM_REGEX);
    if (ankerMatch) datum = ankerMatch[1];
    const wlogMatch = !datum ? f.match(WLOG_DATUM_REGEX) : null;
    if (wlogMatch) datum = wlogMatch[1];
    // Sidecar bij anker (`backup_anker_<datum>.meta.json`)
    const sidecarMatch = !datum ? f.match(/^backup_anker_(\d{4}-\d{2}-\d{2})\.meta\.json$/) : null;
    if (sidecarMatch) datum = sidecarMatch[1];
    if (!datum) continue;
    const lijst = sets.get(datum) ?? [];
    lijst.push(f);
    sets.set(datum, lijst);
  }
  return sets;
}

/** Verwijdert verlopen sets (datum < grens) behalve de jongste set.
 *  Returnt de bestandsnamen die zijn verwijderd. */
export function cleanupSets(dir: string, bewaarDagen: number, nu: Date = new Date()): string[] {
  const sets = verzamelSets(dir);
  if (sets.size === 0) return [];

  const datums = Array.from(sets.keys()).sort();
  const jongste = datums[datums.length - 1];

  // Grens als YYYY-MM-DD-string (datum-vergelijking; tijd irrelevant)
  const grensDate = new Date(nu.getTime() - bewaarDagen * 86400_000);
  const grens = grensDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

  const verwijderd: string[] = [];
  for (const datum of datums) {
    if (datum === jongste) continue; // jongste set altijd behouden
    if (datum >= grens) continue;    // binnen bewaartermijn

    for (const f of sets.get(datum)!) {
      try {
        fs.unlinkSync(path.join(dir, f));
        verwijderd.push(f);
      } catch { /* individueel bestand mislukt — ga door */ }
    }
  }
  return verwijderd;
}

/** Verwijdert losse snapshots (geen anker, geen diff) ouder dan bewaarDagen.
 *  Geen jongste-uitzondering: deze backups zijn ad-hoc en vervangbaar.
 *  Returnt de bestandsnamen die zijn verwijderd. */
export function cleanupLosseSnapshots(dir: string, bewaarDagen: number, nu: Date = new Date()): string[] {
  if (!fs.existsSync(dir)) return [];
  const grens = nu.getTime() - bewaarDagen * 86400_000;
  const verwijderd: string[] = [];

  for (const f of fs.readdirSync(dir)) {
    if (!LOSSE_SNAPSHOT_REGEX.test(f)) continue;
    const pad = path.join(dir, f);
    try {
      const stat = fs.statSync(pad);
      if (stat.mtime.getTime() >= grens) continue;
      fs.unlinkSync(pad);
      verwijderd.push(f);
      // Bijbehorende sidecar
      const sc = path.join(dir, sidecarNaam(f));
      if (fs.existsSync(sc)) { try { fs.unlinkSync(sc); } catch { /* */ } }
    } catch { /* */ }
  }
  return verwijderd;
}

/** Volledig retention-pas: sets + losse snapshots + backup_log opruiming
 *  (alleen voor lokale BACKUP_DIR). */
export function cleanupAll(dir: string, bewaarDagen: number, nu: Date = new Date()): void {
  const setVerwijderd = cleanupSets(dir, bewaarDagen, nu);
  const losVerwijderd = cleanupLosseSnapshots(dir, bewaarDagen, nu);
  const alle = [...setVerwijderd, ...losVerwijderd];

  // backup_log entries van verwijderde lokale backups opruimen.
  // Externe locatie kan door andere apparaten gevuld zijn — log-rijen blijven.
  if (dir === BACKUP_DIR && alle.length > 0) {
    try {
      const db = getDb();
      const stmt = db.prepare('DELETE FROM backup_log WHERE bestandsnaam = ?');
      for (const f of alle) stmt.run(f);
    } catch { /* */ }
  }
}
