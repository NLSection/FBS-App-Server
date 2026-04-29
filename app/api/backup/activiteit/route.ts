// Gecombineerd activiteitenlog — primary restore interface.
// Merged uit lokale DB (snel) en externe sidecars (apparaat-overstijgend).

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { BACKUP_DIR, leesSidecar } from '@/lib/backup';
import getDb from '@/lib/db';

type Entry = {
  bestandsnaam: string;
  type: string;
  beschrijving: string;
  aangemaakt_op: string;
  apparaat_id: string;
  eigen: boolean;
  bron: 'lokaal' | 'extern';
  versleuteld: boolean;
  grootte: number;
};

export async function GET() {
  try {
    const db = getDb();
    const inst = db.prepare('SELECT apparaat_id FROM instellingen WHERE id = 1').get() as { apparaat_id: string | null } | undefined;
    const eigenApparaatId = inst?.apparaat_id ?? '';

    const entries = new Map<string, Entry>();

    // Lokale backups
    const lokaleBestanden = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_') && (f.endsWith('.sqlite.gz') || f.endsWith('.sqlite.enc.gz')))
      : [];

    let logRijen: { bestandsnaam: string; type: string; beschrijving: string; aangemaakt_op: string }[] = [];
    try {
      logRijen = db.prepare('SELECT bestandsnaam, type, beschrijving, aangemaakt_op FROM backup_log').all() as typeof logRijen;
    } catch { /* tabel nog niet aanwezig */ }
    const logMap = new Map(logRijen.map(r => [r.bestandsnaam, r]));

    for (const f of lokaleBestanden) {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const sc = leesSidecar(BACKUP_DIR, f);
      const log = logMap.get(f);
      const bron = sc ?? (log ? { type: log.type, beschrijving: log.beschrijving, apparaat_id: eigenApparaatId, aangemaakt_op: log.aangemaakt_op, bestandsnaam: f } : null);
      entries.set(f, {
        bestandsnaam: f,
        type: bron?.type ?? 'onbekend',
        beschrijving: bron?.beschrijving ?? '',
        aangemaakt_op: bron?.aangemaakt_op ?? stat.mtime.toISOString(),
        apparaat_id: bron?.apparaat_id ?? eigenApparaatId,
        eigen: (bron?.apparaat_id ?? eigenApparaatId) === eigenApparaatId,
        bron: 'lokaal',
        versleuteld: f.endsWith('.sqlite.enc.gz'),
        grootte: stat.size,
      });
    }

    // Externe backups — gelezen uit lokale cache (geschreven door gatekeeper na laatste sync)
    const externCache = path.join(BACKUP_DIR, 'backup-activiteit-extern.json.gz');
    if (fs.existsSync(externCache)) {
      try {
        const parsed = JSON.parse(zlib.gunzipSync(fs.readFileSync(externCache)).toString('utf-8')) as {
          bestandsnaam: string; type: string; beschrijving: string;
          aangemaakt_op: string; apparaat_id: string; versleuteld: boolean; grootte: number;
        }[];
        for (const e of parsed) {
          if (entries.has(e.bestandsnaam)) continue;
          if (entries.has(e.bestandsnaam.replace('.sqlite.enc.gz', '.sqlite.gz'))) continue;
          entries.set(e.bestandsnaam, {
            bestandsnaam: e.bestandsnaam,
            type: e.type,
            beschrijving: e.beschrijving,
            aangemaakt_op: e.aangemaakt_op,
            apparaat_id: e.apparaat_id,
            eigen: e.apparaat_id === eigenApparaatId,
            bron: 'extern',
            versleuteld: e.versleuteld,
            grootte: e.grootte,
          });
        }
      } catch { /* cache corrupt of onleesbaar */ }
    }

    const lijst = Array.from(entries.values()).sort((a, b) => b.aangemaakt_op.localeCompare(a.aangemaakt_op));
    return NextResponse.json({ entries: lijst, eigenApparaatId });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Activiteit kon niet geladen worden.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

