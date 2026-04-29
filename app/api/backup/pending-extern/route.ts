import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR } from '@/lib/backup';

const PENDING_DIR = path.join(BACKUP_DIR, 'pending-extern');

function lijstPending() {
  if (!fs.existsSync(PENDING_DIR)) return [];
  return fs.readdirSync(PENDING_DIR)
    .filter(f => f.startsWith('backup_'))
    .map(naam => {
      const stat = fs.statSync(path.join(PENDING_DIR, naam));
      return { naam, grootte: stat.size, datum: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.naam.localeCompare(a.naam));
}

export function GET() {
  return NextResponse.json(lijstPending());
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bestand = searchParams.get('bestand');
  const alle    = searchParams.get('alle') === '1';

  if (!alle && !bestand) return NextResponse.json({ error: 'bestand of alle=1 vereist.' }, { status: 400 });

  if (alle) {
    const bestanden = lijstPending();
    for (const b of bestanden) {
      try { fs.unlinkSync(path.join(PENDING_DIR, b.naam)); } catch { /* */ }
    }
    return NextResponse.json({ ok: true, verwijderd: bestanden.length });
  }

  if (!bestand || bestand.includes('/') || bestand.includes('\\') || bestand.includes('..')) {
    return NextResponse.json({ error: 'Ongeldig bestandsnaam.' }, { status: 400 });
  }
  const volledigPad = path.join(PENDING_DIR, bestand);
  if (!volledigPad.startsWith(PENDING_DIR)) {
    return NextResponse.json({ error: 'Ongeldig pad.' }, { status: 400 });
  }
  try {
    fs.unlinkSync(volledigPad);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verwijderen mislukt.' }, { status: 500 });
  }
}
