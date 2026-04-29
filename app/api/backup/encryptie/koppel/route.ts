import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';
import { verifieerWachtwoord } from '@/lib/backupEncryptie';

interface ExternConfig {
  salt: string;
  hash: string;
  hint: string;
  herstelsleutelHash?: string;
}

/**
 * POST: koppel dit apparaat aan een bestaande versleutelde backup-configuratie op de externe locatie.
 * Genereert geen nieuwe salt/hash/herstelsleutel — hergebruikt de configuratie van het eerste apparaat.
 */
export async function POST(request: NextRequest) {
  let body: { wachtwoord: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  if (!body.wachtwoord?.trim()) {
    return NextResponse.json({ error: 'Wachtwoord is verplicht.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null } | undefined;

    const externPad = row?.backup_extern_pad;
    if (!externPad) return NextResponse.json({ error: 'Geen externe locatie ingesteld.' }, { status: 400 });

    const configPad = path.join(externPad, 'backup-config.json');
    if (!fs.existsSync(configPad)) {
      return NextResponse.json({ error: 'Geen backup-configuratie gevonden op externe locatie.' }, { status: 404 });
    }

    const config = JSON.parse(fs.readFileSync(configPad, 'utf-8')) as ExternConfig;
    const wachtwoordKlopt = verifieerWachtwoord(body.wachtwoord, config.salt, config.hash);
    const herstelKlopt = config.herstelsleutelHash ? verifieerWachtwoord(body.wachtwoord, config.salt, config.herstelsleutelHash) : false;
    if (!wachtwoordKlopt && !herstelKlopt) {
      return NextResponse.json({ error: 'Wachtwoord of herstelsleutel is onjuist.' }, { status: 403 });
    }

    // Sla dezelfde configuratie op — geen nieuwe salt/hash/herstelsleutel
    db.prepare('UPDATE instellingen SET backup_encryptie_hash = ?, backup_encryptie_hint = ?, backup_encryptie_salt = ? WHERE id = 1')
      .run(config.hash, config.hint, config.salt);

    // Synchroniseer backup_versie naar max van lokale en externe meta om fork-detectie en stale-backup melding te voorkomen
    try {
      let maxVersie = 0;
      const externMetaPad = path.join(externPad, 'backup-meta.json');
      if (fs.existsSync(externMetaPad)) {
        const meta = JSON.parse(fs.readFileSync(externMetaPad, 'utf-8')) as { versie?: number };
        if (meta.versie != null && meta.versie > maxVersie) maxVersie = meta.versie;
      }
      const { BACKUP_DIR } = await import('@/lib/backup');
      const lokaalMetaPad = path.join(BACKUP_DIR, 'backup-meta.json');
      if (fs.existsSync(lokaalMetaPad)) {
        const meta = JSON.parse(fs.readFileSync(lokaalMetaPad, 'utf-8')) as { versie?: number };
        if (meta.versie != null && meta.versie > maxVersie) maxVersie = meta.versie;
      }
      if (maxVersie > 0) {
        db.prepare('UPDATE instellingen SET backup_versie = ? WHERE id = 1').run(maxVersie);
      }
    } catch { /* meta niet leesbaar */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
