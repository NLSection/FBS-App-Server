import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';

/** POST: wis lokale encryptie-instellingen zonder wachtwoord.
 *  Body: { verwijderExternConfig?: boolean } — standaard false.
 *  Stuur true mee als dit het primaire apparaat is dat opnieuw begint;
 *  stuur false (of niets) bij een mismatch-koppeling vanuit een secundair apparaat. */
export async function POST(request: NextRequest) {
  let verwijderExternConfig = false;
  try { const body = await request.json(); verwijderExternConfig = !!body?.verwijderExternConfig; } catch { /* lege body */ }

  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null } | undefined;

    // Wis lokale encryptie-instellingen
    db.prepare('UPDATE instellingen SET backup_encryptie_hash = NULL, backup_encryptie_hint = NULL, backup_encryptie_salt = NULL, backup_herstelsleutel_hash = NULL WHERE id = 1').run();

    // Verwijder externe config en herstel backup-meta alleen als primair apparaat dat aanvraagt
    if (verwijderExternConfig && row?.backup_extern_pad) {
      try {
        const externPad = row.backup_extern_pad;

        // Verwijder backup-config.json
        const configPad = path.join(externPad, 'backup-config.json');
        if (fs.existsSync(configPad)) fs.unlinkSync(configPad);

        // Verwijder stale verwijzing in backup-meta.json als die naar een versleuteld bestand wijst
        const metaPad = path.join(externPad, 'backup-meta.json');
        if (fs.existsSync(metaPad)) {
          const meta = JSON.parse(fs.readFileSync(metaPad, 'utf-8')) as Record<string, unknown>;
          if (typeof meta.latestBackup === 'string' && meta.latestBackup.endsWith('.sqlite.enc.gz')) {
            delete meta.latestBackup;
            fs.writeFileSync(metaPad, JSON.stringify(meta), 'utf-8');
          }
        }
      } catch { /* extern niet bereikbaar */ }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
