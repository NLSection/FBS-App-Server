// Heartbeat-systeem: elk apparaat schrijft periodiek z'n eigen heartbeat-
// bestand naar de externe locatie (subdirectory `heartbeats/`). Bij app-start
// + interval scant elke andere installatie die map om te zien of een ander
// apparaat recent actief was — als binnen RECENT_DREMPEL_MS, toon banner
// "ander apparaat is actief, niet tegelijk werken".
//
// Heartbeat staat los van het wijziging_log en backup-syncs: zelfs zonder
// wijzigingen wil je weten of een ander apparaat geopend is. Daarom een eigen
// timer ipv haken op metWijziging.

import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import getDb from './db';
import { isExternPadBereikbaar } from './backup';
import { zonderLogging } from './wijzigingContext';

export const HEARTBEATS_SUBDIR = 'heartbeats';
const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_RECENT_DREMPEL_MS = 90_000;

export type Heartbeat = {
  apparaat_id: string;
  apparaat_naam: string | null;
  last_activity: string; // ISO
};

let heartbeatTimer: NodeJS.Timeout | null = null;

/** Sync `instellingen.apparaat_naam` naar `os.hostname()` als deze afwijkt.
 *  apparaat_naam is een device-eigenschap, geen gebruikers-instelling: hij
 *  wordt nooit handmatig aangepast en hoort niet via backup-replay tussen
 *  apparaten te lekken. Wordt aangeroepen vóór elke heartbeat-tick zodat
 *  een eventuele restore-overschrijving zichzelf binnen 60s corrigeert. */
export function syncApparaatNaam(): void {
  try {
    const db = getDb();
    const row = db.prepare('SELECT apparaat_naam FROM instellingen WHERE id = 1')
      .get() as { apparaat_naam: string | null } | undefined;
    const huidigeHost = os.hostname();
    if (row && row.apparaat_naam !== huidigeHost) {
      zonderLogging(() => {
        db.prepare('UPDATE instellingen SET apparaat_naam = ? WHERE id = 1').run(huidigeHost);
      });
    }
  } catch { /* DB nog niet beschikbaar — volgende tick */ }
}

async function schrijfHeartbeat(): Promise<void> {
  try {
    syncApparaatNaam();
    const db = getDb();
    const row = db.prepare('SELECT apparaat_id, apparaat_naam, backup_extern_pad FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; apparaat_naam: string | null; backup_extern_pad: string | null } | undefined;
    if (!row?.apparaat_id || !row.backup_extern_pad) return;
    if (!await isExternPadBereikbaar(row.backup_extern_pad)) return;

    const dir = path.join(row.backup_extern_pad, HEARTBEATS_SUBDIR);
    await fsp.mkdir(dir, { recursive: true });
    const data: Heartbeat = {
      apparaat_id: row.apparaat_id,
      apparaat_naam: row.apparaat_naam,
      last_activity: new Date().toISOString(),
    };
    await fsp.writeFile(path.join(dir, `${row.apparaat_id}.json`), JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* extern offline of niet bereikbaar — geen blocker */ }
}

export function startHeartbeatWorker(): void {
  if (heartbeatTimer) return;
  // Direct schrijven bij startup zodat andere apparaten ons meteen zien
  schrijfHeartbeat();
  heartbeatTimer = setInterval(() => { schrijfHeartbeat(); }, HEARTBEAT_INTERVAL_MS);

  const stop = () => { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

/** Lees alle heartbeat-bestanden van extern. Retourneert een lege array als
 *  extern niet bereikbaar of geen heartbeats-map aanwezig. */
export async function leesAndereHeartbeats(): Promise<Heartbeat[]> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT apparaat_id, backup_extern_pad FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; backup_extern_pad: string | null } | undefined;
    if (!row?.backup_extern_pad) return [];
    if (!await isExternPadBereikbaar(row.backup_extern_pad)) return [];

    const dir = path.join(row.backup_extern_pad, HEARTBEATS_SUBDIR);
    if (!fs.existsSync(dir)) return [];

    const bestanden = await fsp.readdir(dir);
    const result: Heartbeat[] = [];
    for (const f of bestanden) {
      if (!f.endsWith('.json')) continue;
      try {
        const inhoud = await fsp.readFile(path.join(dir, f), 'utf-8');
        const hb = JSON.parse(inhoud) as Heartbeat;
        if (hb.apparaat_id !== row.apparaat_id) result.push(hb);
      } catch (err) { console.warn(`[heartbeat] Kapot bestand overgeslagen: ${f}`, err); }
    }
    return result;
  } catch {
    return [];
  }
}
