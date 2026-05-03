// POST /api/backup/opslaan — schrijft een volledige binary backup direct naar
// een door de gebruiker (via Tauri save-dialog) gekozen pad. Bedoeld voor de
// productie-WebView (WebView2/WKWebView) waar `<a download>` niet betrouwbaar
// werkt. Body: { pad: string }.

import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import getDb from '@/lib/db';
import { BACKUP_DIR } from '@/lib/backup';

const gzipAsync = promisify(zlib.gzip);

export async function POST(req: Request) {
  let tmpPad: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { pad?: unknown };
    const pad = typeof body.pad === 'string' ? body.pad.trim() : '';
    if (!pad) return NextResponse.json({ error: 'Pad ontbreekt.' }, { status: 400 });

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const db = getDb();
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* */ }

    tmpPad = path.join(BACKUP_DIR, `.download-${process.pid}-${Date.now()}.sqlite`);
    await db.backup(tmpPad);
    const dbBuffer = await fsp.readFile(tmpPad);
    const compressed = await gzipAsync(dbBuffer);

    await fsp.writeFile(pad, compressed);
    return NextResponse.json({ ok: true, pad });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Backup-opslaan mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  } finally {
    if (tmpPad) { try { fs.unlinkSync(tmpPad); } catch { /* */ } }
  }
}
