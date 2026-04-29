import { NextRequest, NextResponse } from 'next/server';
import { updateConsolidatie, deleteConsolidatie, type ConsolidatieBronType } from '@/lib/trendConsolidaties';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { naam?: unknown; bron_type?: unknown; leden?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }

  const data: { naam?: string; bron_type?: ConsolidatieBronType; leden?: number[] } = {};
  if (body.naam !== undefined) {
    const naam = (body.naam ?? '').toString().trim();
    if (!naam) return NextResponse.json({ error: 'Naam is verplicht.' }, { status: 400 });
    data.naam = naam;
  }
  if (body.bron_type !== undefined) {
    const bt = (body.bron_type ?? '').toString();
    if (!['rekening', 'categorie', 'subcategorie'].includes(bt)) {
      return NextResponse.json({ error: 'Ongeldig bron-type.' }, { status: 400 });
    }
    data.bron_type = bt as ConsolidatieBronType;
  }
  if (body.leden !== undefined) {
    if (!Array.isArray(body.leden)) return NextResponse.json({ error: 'Leden moet een array zijn.' }, { status: 400 });
    data.leden = (body.leden as number[]).filter(n => Number.isFinite(n));
  }

  return metWijziging(
    { type: 'trend', beschrijving: `Consolidatie bijgewerkt (#${id})` },
    () => {
      try {
        const c = updateConsolidatie(parseInt(id), data);
        if (!c) return NextResponse.json({ error: 'Consolidatie niet gevonden.' }, { status: 404 });
        return NextResponse.json(c);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metWijziging(
    { type: 'trend', beschrijving: `Consolidatie verwijderd (#${id})` },
    () => {
      try {
        const ok = deleteConsolidatie(parseInt(id));
        if (!ok) return NextResponse.json({ error: 'Consolidatie niet gevonden.' }, { status: 404 });
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
