import { NextRequest, NextResponse } from 'next/server';
import { updateDashboardTab, deleteDashboardTab } from '@/lib/dashboardTabs';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { bls_tonen?: boolean; cat_tonen?: boolean; bls_trx_uitgeklapt?: boolean; cat_uitklappen?: boolean; cat_trx_uitgeklapt?: boolean };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  const velden = Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined);
  return metWijziging(
    { type: 'dashboard', beschrijving: `Dashboard-tab bijgewerkt (#${id})${velden.length ? ': ' + velden.join(', ') : ''}` },
    () => {
      try {
        updateDashboardTab(Number(id), body);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metWijziging(
    { type: 'dashboard', beschrijving: `Dashboard-tab verwijderd (#${id})` },
    () => {
      try {
        deleteDashboardTab(Number(id));
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
