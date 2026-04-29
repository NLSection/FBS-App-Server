import { NextRequest, NextResponse } from 'next/server';
import { triggerBackup } from '@/lib/backup';

export async function POST(request: NextRequest) {
  try {
    let type = 'handmatig';
    let beschrijving = 'Handmatige backup';
    try {
      const body = await request.json() as { type?: string; beschrijving?: string };
      if (body.type) type = body.type;
      if (body.beschrijving) beschrijving = body.beschrijving;
    } catch { /* geen body is prima */ }
    triggerBackup({ type, beschrijving });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Backup mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
