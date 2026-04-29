// Bundelt de 6 mount-time fetches van BackupRestore.tsx in één response.
// Vervangt: /api/instellingen + /api/backup/encryptie + /api/backup/lijst?bron=lokaal
//          + /api/backup/pending-extern + /api/backup/extern-config + /api/heartbeats
// Mutaties (POST/PUT/DELETE) blijven losse endpoints.
//
// externConfig en heartbeats zijn null wanneer geen externPad is ingesteld
// (dan worden ze in de oorspronkelijke component ook niet aangeroepen).

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';
import { getInstellingen } from '@/lib/instellingen';
import { BACKUP_DIR } from '@/lib/backup';
import { leesAndereHeartbeats, HEARTBEAT_RECENT_DREMPEL_MS } from '@/lib/heartbeat';

interface ExternConfig {
  salt: string;
  hash: string;
  hint: string;
}

function leesEncryptie() {
  try {
    const row = getDb()
      .prepare('SELECT backup_encryptie_hash, backup_encryptie_hint FROM instellingen WHERE id = 1')
      .get() as { backup_encryptie_hash: string | null; backup_encryptie_hint: string | null } | undefined;
    return { ingesteld: !!row?.backup_encryptie_hash, hint: row?.backup_encryptie_hint ?? null };
  } catch {
    return { ingesteld: false, hint: null };
  }
}

function leesLaatsteBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const bestanden = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && (f.endsWith('.sqlite.gz') || f.endsWith('.sqlite.enc.gz')))
      .sort()
      .reverse();
    if (bestanden.length === 0) return null;
    const f = bestanden[0];
    const stat = fs.statSync(path.join(BACKUP_DIR, f));
    return { naam: f, grootte: stat.size, datum: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

function leesPending() {
  try {
    const dir = path.join(BACKUP_DIR, 'pending-extern');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('backup_'))
      .map(naam => {
        const stat = fs.statSync(path.join(dir, naam));
        return { naam, grootte: stat.size, datum: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.naam.localeCompare(a.naam));
  } catch {
    return [];
  }
}

function leesExternConfig(externPad: string) {
  try {
    const configPad = path.join(externPad, 'backup-config.json');
    if (!fs.existsSync(configPad)) return { exists: false, hint: null };
    const config = JSON.parse(fs.readFileSync(configPad, 'utf-8')) as ExternConfig;
    return { exists: true, hint: config.hint ?? null };
  } catch {
    return { exists: false, hint: null };
  }
}

async function leesHeartbeats() {
  try {
    const heartbeats = await leesAndereHeartbeats();
    const nu = Date.now();
    const verrijkt = heartbeats.map(hb => {
      const last = new Date(hb.last_activity).getTime();
      const elapsed = nu - last;
      return {
        apparaat_id: hb.apparaat_id,
        apparaat_naam: hb.apparaat_naam,
        last_activity: hb.last_activity,
        minuten_geleden: Math.max(0, Math.round(elapsed / 60_000)),
        actief: elapsed < HEARTBEAT_RECENT_DREMPEL_MS,
        is_eigen: false,
      };
    });
    const eigen = getDb()
      .prepare('SELECT apparaat_id, apparaat_naam FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; apparaat_naam: string | null } | undefined;
    if (eigen?.apparaat_id) {
      verrijkt.unshift({
        apparaat_id: eigen.apparaat_id,
        apparaat_naam: eigen.apparaat_naam,
        last_activity: new Date(nu).toISOString(),
        minuten_geleden: 0,
        actief: true,
        is_eigen: true,
      });
    }
    verrijkt.sort((a, b) => {
      if (a.is_eigen && !b.is_eigen) return -1;
      if (!a.is_eigen && b.is_eigen) return 1;
      return a.minuten_geleden - b.minuten_geleden;
    });
    return { apparaten: verrijkt };
  } catch {
    return { apparaten: [] };
  }
}

export async function GET() {
  try {
    const inst = getInstellingen();
    const externPad = inst.backupExternPad ?? null;

    const [externConfig, heartbeats] = await Promise.all([
      externPad ? Promise.resolve(leesExternConfig(externPad)) : Promise.resolve(null),
      externPad ? leesHeartbeats() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      instellingen: {
        backupBewaarDagen: inst.backupBewaarDagen,
        backupExternPad: externPad,
        backupExternInterval: inst.backupExternInterval,
      },
      encryptie: leesEncryptie(),
      laatsteBackup: leesLaatsteBackup(),
      pending: leesPending(),
      externConfig,
      heartbeats,
    });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Bundle laden mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
