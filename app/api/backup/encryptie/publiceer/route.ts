import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';

/** POST: schrijf backup-config.json van bestaande lokale encryptie-instellingen naar extern.
 *  Bedoeld voor apparaten die encryptie al hadden vóór de multi-device koppel-functie. */
export async function POST() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_pad, backup_encryptie_hash, backup_encryptie_salt, backup_encryptie_hint, backup_herstelsleutel_hash FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null; backup_encryptie_hash: string | null; backup_encryptie_salt: string | null; backup_encryptie_hint: string | null; backup_herstelsleutel_hash: string | null } | undefined;

    if (!row?.backup_extern_pad) return NextResponse.json({ error: 'Geen externe locatie ingesteld.' }, { status: 400 });
    if (!row.backup_encryptie_hash || !row.backup_encryptie_salt) return NextResponse.json({ error: 'Encryptie is niet ingesteld.' }, { status: 400 });

    fs.mkdirSync(row.backup_extern_pad, { recursive: true });
    fs.writeFileSync(
      path.join(row.backup_extern_pad, 'backup-config.json'),
      JSON.stringify({ salt: row.backup_encryptie_salt, hash: row.backup_encryptie_hash, hint: row.backup_encryptie_hint ?? '', herstelsleutelHash: row.backup_herstelsleutel_hash ?? '' }),
      'utf-8'
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Schrijven naar extern mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
