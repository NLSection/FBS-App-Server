import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb from '@/lib/db';

interface ExternConfig {
  salt: string;
  hash: string;
  hint: string;
}

/** GET: controleer of de externe backup locatie al een gedeelde encryptie-configuratie heeft */
export function GET() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null } | undefined;

    const externPad = row?.backup_extern_pad;
    if (!externPad) return NextResponse.json({ exists: false, hint: null });

    const configPad = path.join(externPad, 'backup-config.json');
    if (!fs.existsSync(configPad)) return NextResponse.json({ exists: false, hint: null });

    const config = JSON.parse(fs.readFileSync(configPad, 'utf-8')) as ExternConfig;
    return NextResponse.json({ exists: true, hint: config.hint ?? null });
  } catch {
    return NextResponse.json({ exists: false, hint: null });
  }
}
