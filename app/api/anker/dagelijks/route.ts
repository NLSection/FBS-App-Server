// POST /api/anker/dagelijks
// Garandeert dat het anker voor vandaag bestaat. Idempotent — bestaat het al,
// dan no-op. Wordt door <DagelijksAnker> aangeroepen bij page-load zodat de
// I/O van db.backup() achter de pagina-laad valt i.p.v. zichtbaar te zijn
// bij de eerstvolgende user-actie.

import { NextResponse } from 'next/server';
import { zorgVoorAnkerVandaag, vandaagISO, ankerNaamVoor } from '@/lib/anchor';
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR } from '@/lib/backup';
import { cleanupAll } from '@/lib/retention';
import getDb from '@/lib/db';

export async function POST() {
  try {
    const datum = vandaagISO();
    const verwacht = ankerNaamVoor(datum);
    const alAanwezig = fs.existsSync(path.join(BACKUP_DIR, verwacht));
    const naam = await zorgVoorAnkerVandaag(datum);

    // Retention: oude sets opruimen nu het anker van vandaag bestaat.
    // Lokaal direct; extern volgt via gatekeeper-tick (die roept zelf
    // cleanupAll aan op de externe map).
    try {
      const inst = getDb().prepare('SELECT backup_bewaar_dagen FROM instellingen WHERE id = 1')
        .get() as { backup_bewaar_dagen: number } | undefined;
      const bewaarDagen = inst?.backup_bewaar_dagen ?? 7;
      cleanupAll(BACKUP_DIR, bewaarDagen);
    } catch { /* niet-kritiek */ }

    return NextResponse.json({ success: true, datum, ankerNaam: naam, alAanwezig });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Anker-aanmaak mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
