import { NextRequest, NextResponse } from 'next/server';
import { getAllConsolidaties, createConsolidatie, type ConsolidatieBronType } from '@/lib/trendConsolidaties';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getAllConsolidaties());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { naam?: unknown; bron_type?: unknown; leden?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }

  const naam = (body.naam ?? '').toString().trim();
  const bron_type = (body.bron_type ?? '').toString() as ConsolidatieBronType;
  if (!naam) return NextResponse.json({ error: 'Naam is verplicht.' }, { status: 400 });
  if (!['rekening', 'categorie', 'subcategorie'].includes(bron_type)) {
    return NextResponse.json({ error: 'Ongeldig bron-type.' }, { status: 400 });
  }
  const leden = Array.isArray(body.leden) ? (body.leden as number[]).filter(n => Number.isFinite(n)) : [];

  return metWijziging(
    { type: 'trend', beschrijving: `Consolidatie aangemaakt: ${naam}` },
    () => {
      try {
        const c = createConsolidatie({ naam, bron_type, leden });
        return NextResponse.json(c, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
