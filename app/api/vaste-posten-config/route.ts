import { NextRequest, NextResponse } from 'next/server';
import { getVastePostenConfig, insertVastePostDefinitie } from '@/lib/vastePostenConfig';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getVastePostenConfig());
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { iban?: string; naam?: string; omschrijving?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const { iban, naam, omschrijving, label } = body;
  if (!iban || !naam || !label) {
    return NextResponse.json({ error: 'iban, naam en label zijn verplicht.' }, { status: 400 });
  }

  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste post-definitie aangemaakt: ${label} (${naam})` },
    () => {
      try {
        insertVastePostDefinitie(iban, naam, omschrijving ?? null, label);
        return NextResponse.json({ ok: true }, { status: 201 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
