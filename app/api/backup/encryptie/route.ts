import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';
import { genereerSalt, hashWachtwoord, verifieerWachtwoord, genereerHerstelsleutel } from '@/lib/backupEncryptie';

function schrijfExternConfig(externPad: string, salt: string, hash: string, hint: string, herstelsleutelHash: string) {
  try {
    fs.mkdirSync(externPad, { recursive: true });
    fs.writeFileSync(
      path.join(externPad, 'backup-config.json'),
      JSON.stringify({ salt, hash, hint, herstelsleutelHash }),
      'utf-8'
    );
  } catch { /* extern niet bereikbaar — geen blocker */ }
}

/** GET: check of encryptie is ingesteld, retourneer hint */
export function GET() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_encryptie_hash, backup_encryptie_hint FROM instellingen WHERE id = 1')
      .get() as { backup_encryptie_hash: string | null; backup_encryptie_hint: string | null } | undefined;
    return NextResponse.json({
      ingesteld: !!row?.backup_encryptie_hash,
      hint: row?.backup_encryptie_hint ?? null,
    });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

/** POST: stel wachtwoord in of wijzig het */
export async function POST(request: NextRequest) {
  let body: { wachtwoord: string; hint: string; huidigWachtwoord?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  if (!body.wachtwoord?.trim()) return NextResponse.json({ error: 'Wachtwoord is verplicht.' }, { status: 400 });
  if (!body.hint?.trim()) return NextResponse.json({ error: 'Hint is verplicht.' }, { status: 400 });

  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_encryptie_hash, backup_encryptie_salt FROM instellingen WHERE id = 1')
      .get() as { backup_encryptie_hash: string | null; backup_encryptie_salt: string | null } | undefined;

    // Als er al een wachtwoord is, verifieer het huidige
    if (row?.backup_encryptie_hash && row?.backup_encryptie_salt) {
      if (!body.huidigWachtwoord) return NextResponse.json({ error: 'Huidig wachtwoord is verplicht bij wijziging.' }, { status: 400 });
      if (!verifieerWachtwoord(body.huidigWachtwoord, row.backup_encryptie_salt, row.backup_encryptie_hash)) {
        return NextResponse.json({ error: 'Huidig wachtwoord is onjuist.' }, { status: 403 });
      }
    }

    const salt = genereerSalt();
    const hash = hashWachtwoord(body.wachtwoord, salt);
    const herstelsleutel = genereerHerstelsleutel();
    const herstelHash = hashWachtwoord(herstelsleutel, salt);
    db.prepare('UPDATE instellingen SET backup_encryptie_hash = ?, backup_encryptie_hint = ?, backup_encryptie_salt = ?, backup_herstelsleutel_hash = ? WHERE id = 1')
      .run(hash, body.hint.trim(), salt, herstelHash);

    // Schrijf gedeelde config naar externe locatie (voor koppelen van extra apparaten)
    const extRow = db.prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1').get() as { backup_extern_pad: string | null } | undefined;
    if (extRow?.backup_extern_pad) {
      schrijfExternConfig(extRow.backup_extern_pad, salt, hash, body.hint.trim(), herstelHash);
    }

    // Herstelsleutel wordt éénmalig geretourneerd — niet opgeslagen in plaintext
    return NextResponse.json({ ok: true, herstelsleutel });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

/** DELETE: verwijder encryptie-wachtwoord (accepteert wachtwoord of herstelsleutel) */
export async function DELETE(request: NextRequest) {
  let body: { wachtwoord: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_encryptie_hash, backup_encryptie_salt, backup_herstelsleutel_hash FROM instellingen WHERE id = 1')
      .get() as { backup_encryptie_hash: string | null; backup_encryptie_salt: string | null; backup_herstelsleutel_hash: string | null } | undefined;

    if (row?.backup_encryptie_hash && row?.backup_encryptie_salt) {
      const wachtwoordKlopt = verifieerWachtwoord(body.wachtwoord, row.backup_encryptie_salt, row.backup_encryptie_hash);
      const herstelKlopt = row.backup_herstelsleutel_hash ? verifieerWachtwoord(body.wachtwoord, row.backup_encryptie_salt, row.backup_herstelsleutel_hash) : false;
      if (!wachtwoordKlopt && !herstelKlopt) {
        return NextResponse.json({ error: 'Wachtwoord of herstelsleutel is onjuist.' }, { status: 403 });
      }
    }

    db.prepare('UPDATE instellingen SET backup_encryptie_hash = NULL, backup_encryptie_hint = NULL, backup_encryptie_salt = NULL, backup_herstelsleutel_hash = NULL WHERE id = 1').run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
