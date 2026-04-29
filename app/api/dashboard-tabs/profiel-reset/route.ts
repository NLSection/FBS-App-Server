import { NextRequest, NextResponse } from 'next/server';
import { resetDashboardTabsProfiel } from '@/lib/dashboardTabs';
import { metWijziging } from '@/lib/wijziging';

export async function POST(request: NextRequest) {
  let body: { blsTonen?: unknown; catTonen?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  const blsTonen = Boolean(body.blsTonen);
  const catTonen = body.catTonen !== undefined ? Boolean(body.catTonen) : true;
  return metWijziging(
    { type: 'dashboard', beschrijving: `Dashboard-tabs profiel reset (BLS ${blsTonen ? 'aan' : 'uit'}, Cat ${catTonen ? 'aan' : 'uit'})` },
    () => {
      try {
        resetDashboardTabsProfiel(blsTonen, catTonen);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
