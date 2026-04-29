import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

// Leest een willekeurig bestand vanaf een absoluut pad en geeft de raw bytes terug.
// Bedoeld voor de "Ander bestand kiezen…" flow in Tauri: de native bestandsdialog
// levert een absoluut pad, dat we hier ophalen om vervolgens client-side te
// verwerken via dezelfde flow als een browser-file-upload.
export function GET(request: NextRequest) {
  const pad = request.nextUrl.searchParams.get('pad');
  if (!pad) return NextResponse.json({ error: 'Pad is verplicht.' }, { status: 400 });

  try {
    const stat = fs.statSync(pad);
    if (!stat.isFile()) return NextResponse.json({ error: 'Pad is geen bestand.' }, { status: 400 });
    const bytes = fs.readFileSync(pad);
    return new NextResponse(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Fout bij lezen bestand.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
