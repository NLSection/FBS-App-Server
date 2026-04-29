import { NextRequest, NextResponse } from 'next/server';
import { reorderDashboardTabs } from '@/lib/dashboardTabs';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(request: NextRequest) {
  let body: { id: number; volgorde: number }[];
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  return metWijziging(
    { type: 'dashboard', beschrijving: 'Dashboard-tabbladen herschikt' },
    () => {
      try {
        reorderDashboardTabs(body);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
