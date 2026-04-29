// Per-dag anker (F5): elke kalenderdag krijgt één set bestaande uit een
// `backup_anker_<YYYY-MM-DD>.sqlite.gz` (full DB snapshot) en een
// `wlog_<YYYY-MM-DD>.ndjson.gz` met de wijzigingen van die dag. Het anker
// wordt aangemaakt bij de eerste page-load van de dag (verbergt I/O van
// db.backup() achter de pagina-load) of bij de eerste wijziging na
// middernacht binnen een lopende sessie.
//
// `zorgVoorAnkerVandaag()` is idempotent: bestaat het bestand al, dan no-op.
// Re-entrancy guard voorkomt dubbele runs bij parallelle calls.
//
// Voor restore "terug naar dag X": laad anker van X + replay diff van X.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import getDb from './db';
import { BACKUP_DIR, sidecarNaam, triggerGatekeeperTick, isExternPadBereikbaar, leesSidecar, type BackupSidecar } from './backup';
import { versleutel, ontsleutel } from './backupEncryptie';
import { SCHEMA_VERSION } from './migrations';

const gzipAsync = promisify(zlib.gzip);

const ANKER_BESCHRIJVING = 'Dagelijks ankerpunt — vast referentie­punt voor restore naar deze dag';

/** YYYY-MM-DD in Europe/Amsterdam tijdzone — bepaalt aan welke dag-set een
 *  wijziging hoort. Niet UTC: een gebruiker die om 23:50 een wijziging maakt
 *  zou anders in de "morgen"-set landen. */
export function vandaagISO(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

export function ankerNaamVoor(datum: string): string {
  return `backup_anker_${datum}.sqlite.gz`;
}

export async function maakAnker(datum: string = vandaagISO()): Promise<string | null> {
  let tmpPad: string | null = null;
  const naam = ankerNaamVoor(datum);
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    // Idempotent: anker voor deze dag bestaat al.
    if (fs.existsSync(path.join(BACKUP_DIR, naam))) return naam;

    const db = getDb();
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* niet-kritiek */ }

    const inst = db.prepare('SELECT apparaat_id, backup_extern_pad, backup_encryptie_hash, backup_encryptie_salt FROM instellingen WHERE id = 1').get() as {
      apparaat_id: string | null; backup_extern_pad: string | null;
      backup_encryptie_hash: string | null; backup_encryptie_salt: string | null;
    } | undefined;

    const apparaatId = inst?.apparaat_id ?? 'onbekend';
    const externPad = inst?.backup_extern_pad ?? null;
    const hash = inst?.backup_encryptie_hash ?? null;
    const salt = inst?.backup_encryptie_salt ?? null;
    const heeftEncryptie = !!hash && !!salt;

    // Pull-first: als extern al een anker van een ander apparaat heeft voor
    // deze dag, kopieer dat naar lokaal i.p.v. zelf maken. Voorkomt dat de
    // gatekeeper-split-brain-guard onze pending opstapelt zonder ooit te
    // pushen (die guard weigert terecht extern overschrijven).
    if (externPad && await isExternPadBereikbaar(externPad)) {
      const externNaam = heeftEncryptie ? naam.replace('.sqlite.gz', '.sqlite.enc.gz') : naam;
      const externBestand = path.join(externPad, externNaam);
      if (fs.existsSync(externBestand)) {
        const sc = leesSidecar(externPad, externNaam);
        if (sc?.apparaat_id && sc.apparaat_id !== apparaatId) {
          try {
            const raw = await fsp.readFile(externBestand);
            const compressed = heeftEncryptie ? ontsleutel(raw, hash!, salt!) : raw;
            await fsp.writeFile(path.join(BACKUP_DIR, naam), compressed);
            fs.writeFileSync(path.join(BACKUP_DIR, sidecarNaam(naam)), JSON.stringify(sc, null, 2), 'utf-8');
            try {
              db.prepare(`
                INSERT INTO backup_log (bestandsnaam, type, beschrijving, aangemaakt_op)
                VALUES (?, 'anker', ?, ?)
                ON CONFLICT(bestandsnaam) DO NOTHING
              `).run(naam, sc.beschrijving ?? ANKER_BESCHRIJVING, sc.aangemaakt_op ?? new Date().toISOString());
            } catch { /* */ }
            console.log(`[anker] ${naam} opgehaald van apparaat ${sc.apparaat_id} (extern → lokaal)`);
            return naam;
          } catch (err) {
            console.warn(`[anker] Pull-first mislukt voor ${naam}, val terug op eigen creatie:`, err);
          }
        }
      }
    }

    tmpPad = path.join(BACKUP_DIR, `.tmp-anker-${process.pid}-${Date.now()}.sqlite`);
    await db.backup(tmpPad);
    const dbBuffer = await fsp.readFile(tmpPad);
    const compressed = await gzipAsync(dbBuffer);
    await fsp.writeFile(path.join(BACKUP_DIR, naam), compressed);

    const sidecar: BackupSidecar = {
      bestandsnaam: naam,
      type: 'anker',
      beschrijving: ANKER_BESCHRIJVING,
      apparaat_id: apparaatId,
      aangemaakt_op: new Date().toISOString(),
      schema_versie: SCHEMA_VERSION,
    };
    fs.writeFileSync(path.join(BACKUP_DIR, sidecarNaam(naam)), JSON.stringify(sidecar, null, 2), 'utf-8');

    try {
      db.prepare(`
        INSERT INTO backup_log (bestandsnaam, type, beschrijving, aangemaakt_op)
        VALUES (?, 'anker', ?, ?)
        ON CONFLICT(bestandsnaam) DO NOTHING
      `).run(naam, sidecar.beschrijving, sidecar.aangemaakt_op);
    } catch { /* tabel mogelijk nog niet aanwezig bij verse install */ }

    if (externPad) {
      const externNaam = heeftEncryptie ? naam.replace('.sqlite.gz', '.sqlite.enc.gz') : naam;
      const externData = heeftEncryptie ? versleutel(compressed, hash!, salt!) : compressed;
      const pendingDir = path.join(BACKUP_DIR, 'pending-extern');
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, externNaam), externData);
      fs.writeFileSync(path.join(pendingDir, sidecarNaam(externNaam)), JSON.stringify(sidecar, null, 2), 'utf-8');
      triggerGatekeeperTick();
    }

    return naam;
  } catch (err) {
    console.error('[anker] Aanmaak mislukt:', err);
    return null;
  } finally {
    if (tmpPad) { try { fs.unlinkSync(tmpPad); } catch { /* */ } }
  }
}

let ankerBezig = false;

/** Garandeert dat het anker voor `datum` (default vandaag) bestaat. Idempotent.
 *  Synchroon awaitable — caller kan kiezen tussen await (endpoint) of
 *  fire-and-forget (binnen metWijziging). */
export async function zorgVoorAnkerVandaag(datum: string = vandaagISO()): Promise<string | null> {
  if (ankerBezig) return null;
  ankerBezig = true;
  try {
    return await maakAnker(datum);
  } finally {
    ankerBezig = false;
  }
}
