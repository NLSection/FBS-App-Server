import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTabs, addDashboardTab } from '@/lib/dashboardTabs';
import { getInstellingen } from '@/lib/instellingen';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getDashboardTabs());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { type?: string; entiteit_id?: number };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (body.type !== 'groep' && body.type !== 'rekening')
    return NextResponse.json({ error: 'type moet groep of rekening zijn.' }, { status: 400 });
  if (!body.entiteit_id)
    return NextResponse.json({ error: 'entiteit_id is verplicht.' }, { status: 400 });
  const dashType = body.type;
  const entiteitId = body.entiteit_id;
  return metWijziging(
    { type: 'dashboard', beschrijving: `Dashboard-tabblad toegevoegd: ${dashType} #${entiteitId}` },
    () => {
      try {
        const profiel = getInstellingen().gebruikersProfiel;
        const blsTonen = profiel !== 'uitgavenbeheer';
        const catTonen = true;
        const id = addDashboardTab(dashType, entiteitId, blsTonen, catTonen);
        return NextResponse.json({ id }, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
