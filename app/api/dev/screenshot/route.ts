import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Dev-only: lijst van PNG-bestanden in public/.
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Alleen beschikbaar in development.' }, { status: 403 });
  }
  try {
    const dir = path.join(process.cwd(), 'public');
    const bestanden = fs.readdirSync(dir)
      .filter(n => /\.png$/i.test(n))
      .map(n => ({ naam: n, grootte: fs.statSync(path.join(dir, n)).size }))
      .sort((a, b) => a.naam.localeCompare(b.naam));
    return NextResponse.json(bestanden);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lijst mislukt.' }, { status: 500 });
  }
}

// Dev-only: slaat een screenshot op in public/. Alleen beschikbaar in development.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Alleen beschikbaar in development.' }, { status: 403 });
  }
  let body: { filename?: string; dataBase64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }
  const { filename, dataBase64 } = body;
  if (!filename || !dataBase64) {
    return NextResponse.json({ error: 'filename en dataBase64 zijn verplicht.' }, { status: 400 });
  }
  // Pad-traversal beschermen + alleen PNG
  const veiligeNaam = path.basename(filename);
  if (veiligeNaam !== filename || !/^[\w\-. ]+\.png$/i.test(veiligeNaam)) {
    return NextResponse.json({ error: 'Ongeldige bestandsnaam. Alleen letters/cijfers/liggend streepje/punt/spatie, moet eindigen op .png.' }, { status: 400 });
  }
  const doel = path.join(process.cwd(), 'public', veiligeNaam);
  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    // Als bestand bestaat en read-only is: maak writeable voordat we overschrijven
    if (fs.existsSync(doel)) {
      try { fs.chmodSync(doel, 0o666); } catch { /* negeer: misschien al writable */ }
    }
    fs.writeFileSync(doel, buffer);
    return NextResponse.json({ pad: `/${veiligeNaam}`, bytes: buffer.length });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const bericht = `${e.code ?? ''} ${e.message ?? 'Schrijven mislukt.'} (pad: ${doel})`.trim();
    console.error('[dev/screenshot] Schrijven mislukt:', doel, err);
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
