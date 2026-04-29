// Differential-backup file (F5: per-dag set).
//
// Elke kalenderdag krijgt z'n eigen `wlog_<YYYY-MM-DD>.ndjson.gz` met de
// log-entries die op die dag zijn ontstaan. Samen met `backup_anker_<datum>`
// vormen ze één set: anker = staat aan het begin van de dag, diff = wat er
// daarna op die dag is veranderd. Restore "terug naar dag X" laadt anker X
// + replayt diff X.
//
// Dag-rollover binnen lopende sessie: `triggerDiffDump` bepaalt bij elke
// tick de huidige datum en schrijft naar de file van die dag. Een wijziging
// om 23:55 valt in `wlog_<25-04>`, een om 00:05 in `wlog_<26-04>`. Het
// anker voor de nieuwe dag wordt door `triggerDiffDump` zelf gepoked
// zodat een doorlopende sessie ook netjes een nieuwe set start.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import getDb from './db';
import { BACKUP_DIR } from './backup';
import { ontsleutel } from './backupEncryptie';
import { vandaagISO, zorgVoorAnkerVandaag, ankerNaamVoor } from './anchor';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export function diffFileNaam(datum: string): string {
  return `wlog_${datum}.ndjson.gz`;
}
export function diffEncFileNaam(datum: string): string {
  return `wlog_${datum}.ndjson.enc.gz`;
}
export function diffMetaNaam(datum: string): string {
  return `wlog_${datum}.meta.json`;
}

export type DiffMeta = {
  datum: string;
  laatste_timestamp_ms: number | null;
  aantal_entries: number;
  hoogste_id: number;
  /** Bestandsnaam van het anker waarop dit diff-file bovenop bouwt
   *  (`backup_anker_<datum>.sqlite.gz`). */
  voor_anker: string | null;
  /** UUID van het apparaat dat deze dump heeft gemaakt. Voor split-brain
   *  detectie: extern's schrijver != eigen UUID + extern's hoogste_id
   *  > onze gezien_extern_hoogste_id ⇒ ander apparaat heeft geschreven. */
  schrijver_apparaat_id: string | null;
};

// Re-entrancy met catch-up: bij overlappende calls draait er één dump tegelijk
// en wordt er na afloop nog één extra ronde gedaan als er ondertussen meer
// triggers waren. Voorkomt verloren updates zonder per-trigger I/O.
let dumpBezig = false;
let dumpAgain = false;

export function triggerDiffDump(): void {
  if (dumpBezig) { dumpAgain = true; return; }
  setImmediate(async () => {
    do {
      dumpBezig = true;
      dumpAgain = false;
      try {
        const datum = vandaagISO();
        // Garandeer dat het anker van vandaag bestaat — vangt middernacht-
        // rollover binnen een lopende sessie. Idempotent.
        await zorgVoorAnkerVandaag(datum);
        await dumpDiffFile(datum);
      }
      catch (err) { console.error('[diff] dump mislukt:', err); }
      dumpBezig = false;
    } while (dumpAgain);
  });
}

export async function dumpDiffFile(datum: string = vandaagISO()): Promise<void> {
  const db = getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Filter entries op de kalenderdag waaraan ze toebehoren (Amsterdam tz).
  // Goedkoop: log blijft compact door retention.
  const alle = db.prepare('SELECT * FROM wijziging_log ORDER BY id').all() as DiffEntry[];
  const rijen = alle.filter(r => vandaagISO(new Date(r.timestamp_ms)) === datum);
  const ndjson = rijen.map(r => JSON.stringify(r)).join('\n');
  const compressed = await gzipAsync(Buffer.from(ndjson, 'utf-8'));
  await fsp.writeFile(path.join(BACKUP_DIR, diffFileNaam(datum)), compressed);

  let schrijverId: string | null = null;
  try {
    const r = db.prepare('SELECT apparaat_id FROM instellingen WHERE id = 1').get() as { apparaat_id: string | null } | undefined;
    schrijverId = r?.apparaat_id ?? null;
  } catch { /* */ }

  const meta: DiffMeta = {
    datum,
    laatste_timestamp_ms: rijen.length > 0 ? rijen[rijen.length - 1].timestamp_ms : null,
    aantal_entries: rijen.length,
    hoogste_id: rijen.length > 0 ? rijen[rijen.length - 1].id : 0,
    voor_anker: ankerNaamVoor(datum),
    schrijver_apparaat_id: schrijverId,
  };
  await fsp.writeFile(path.join(BACKUP_DIR, diffMetaNaam(datum)), JSON.stringify(meta, null, 2), 'utf-8');
}

export function leesDiffMeta(dir: string, datum: string): DiffMeta | null {
  const pad = path.join(dir, diffMetaNaam(datum));
  if (!fs.existsSync(pad)) return null;
  try { return JSON.parse(fs.readFileSync(pad, 'utf-8')) as DiffMeta; }
  catch { return null; }
}

/** Geeft alle datums terug waarvoor een diff-meta bestaat in `dir`,
 *  oplopend gesorteerd. */
export function lijstDiffDatums(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => f.match(/^wlog_(\d{4}-\d{2}-\d{2})\.meta\.json$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => m[1])
    .sort();
}

export type DiffEntry = {
  id: number; actie_id: string; timestamp_ms: number;
  type: string; beschrijving: string; tabel: string;
  rij_id: number | null; operatie: 'insert' | 'update' | 'delete';
  voor_json: string | null; na_json: string | null;
  teruggedraaid: number;
};

/** Leest het diff-file voor `datum` vanaf disk en geeft de log-entries terug.
 *  Probeert eerst de plain variant, valt terug op de encrypted variant
 *  (vereist encryptie-hash + salt). Returnt een lege array als geen van
 *  beide bestaat. */
export async function leesDiffFile(
  dir: string,
  datum: string,
  encryptie?: { hash: string; salt: string },
): Promise<DiffEntry[]> {
  const plainPad = path.join(dir, diffFileNaam(datum));
  const encPad = path.join(dir, diffEncFileNaam(datum));

  let compressed: Buffer | null = null;
  if (fs.existsSync(plainPad)) {
    compressed = await fsp.readFile(plainPad);
  } else if (fs.existsSync(encPad)) {
    if (!encryptie) return []; // versleuteld diff zonder sleutel — skip
    const raw = await fsp.readFile(encPad);
    compressed = ontsleutel(raw, encryptie.hash, encryptie.salt);
  } else {
    return [];
  }

  const ndjson = (await gunzipAsync(compressed)).toString('utf-8');
  if (!ndjson.trim()) return [];
  return ndjson.split('\n').filter(r => r.length > 0).map(r => JSON.parse(r) as DiffEntry);
}
