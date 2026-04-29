// FILE: route.ts (api/backup)
// GET /api/backup — download een verse volledige binary backup (.sqlite.gz).
// Partial export per tabel-groep is vervallen: bij Optie A is een backup altijd
// een volledige DB-snapshot. Voor "die ene fout terug" gebruik je in plaats
// daarvan de fine-grained activiteit-backups (één per wijziging).

import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import getDb from '@/lib/db';
import { BACKUP_DIR } from '@/lib/backup';

const gzipAsync = promisify(zlib.gzip);

export async function GET() {
  let tmpPad: string | null = null;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const db = getDb();
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* */ }

    tmpPad = path.join(BACKUP_DIR, `.download-${process.pid}-${Date.now()}.sqlite`);
    await db.backup(tmpPad);
    const dbBuffer = await fsp.readFile(tmpPad);
    const compressed = await gzipAsync(dbBuffer);

    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' })
      .replace(' ', '_').replace(/:/g, '-');
    const naam = `fbs-backup-${stamp}.sqlite.gz`;

    return new NextResponse(new Uint8Array(compressed), {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${naam}"`,
      },
    });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Backup-download mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  } finally {
    if (tmpPad) { try { fs.unlinkSync(tmpPad); } catch { /* */ } }
  }
}
