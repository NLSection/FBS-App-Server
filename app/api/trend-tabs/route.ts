import { NextRequest, NextResponse } from 'next/server';
import { getTrendTabs, createTrendTab, updateTrendTabsVolgorde } from '@/lib/trendTabs';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getTrendTabs());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { volgorde?: unknown; naam?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }

  if (body.volgorde && Array.isArray(body.volgorde)) {
    const volgorde = body.volgorde as number[];
    return metWijziging(
      { type: 'trend', beschrijving: 'Trend-tabbladen herschikt' },
      () => {
        try {
          updateTrendTabsVolgorde(volgorde);
          return NextResponse.json({ ok: true });
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
        }
      },
    );
  }

  const naam = (body.naam ?? '').toString().trim() || 'Nieuw tabblad';
  return metWijziging(
    { type: 'trend', beschrijving: `Trend-tabblad aangemaakt: ${naam}` },
    () => {
      try {
        const tab = createTrendTab(naam);
        return NextResponse.json(tab, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
