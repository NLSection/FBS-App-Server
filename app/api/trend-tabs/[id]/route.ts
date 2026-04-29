import { NextRequest, NextResponse } from 'next/server';
import { updateTrendTab, deleteTrendTab } from '@/lib/trendTabs';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { naam?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  const naam = (body.naam ?? '').toString().trim();
  if (!naam) return NextResponse.json({ error: 'Naam is verplicht.' }, { status: 400 });

  return metWijziging(
    { type: 'trend', beschrijving: `Trend-tabblad hernoemd (#${id}) → ${naam}` },
    () => {
      try {
        const ok = updateTrendTab(parseInt(id), naam);
        if (!ok) return NextResponse.json({ error: 'Tab niet gevonden.' }, { status: 404 });
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metWijziging(
    { type: 'trend', beschrijving: `Trend-tabblad verwijderd (#${id})` },
    () => {
      try {
        const ok = deleteTrendTab(parseInt(id));
        if (!ok) return NextResponse.json({ error: 'Kan niet verwijderen — dit is de laatste tab.' }, { status: 400 });
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
