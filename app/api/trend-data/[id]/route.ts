import { NextRequest, NextResponse } from 'next/server';
import { getPanel } from '@/lib/trendPanels';
import { getTrendData } from '@/lib/trendData';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const panel = getPanel(parseInt(id));
    if (!panel) return NextResponse.json({ error: 'Panel niet gevonden.' }, { status: 404 });

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const van = req.nextUrl.searchParams.get('datum_van') ?? undefined;
    const tot = req.nextUrl.searchParams.get('datum_tot') ?? undefined;
    if (van && !ISO_DATE.test(van)) return NextResponse.json({ error: 'datum_van moet YYYY-MM-DD zijn.' }, { status: 400 });
    if (tot && !ISO_DATE.test(tot)) return NextResponse.json({ error: 'datum_tot moet YYYY-MM-DD zijn.' }, { status: 400 });

    const data = getTrendData(panel, { datum_van: van, datum_tot: tot });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
