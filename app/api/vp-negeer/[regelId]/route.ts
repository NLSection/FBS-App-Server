import { NextRequest, NextResponse } from 'next/server';
import { removeVpNegeer } from '@/lib/vpNegeer';
import { metWijziging } from '@/lib/wijziging';

type Params = Promise<{ regelId: string }>;

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { regelId } = await params;
  const numId = parseInt(regelId, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig regelId.' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (typeof body.periode !== 'string') return NextResponse.json({ error: 'periode is verplicht.' }, { status: 400 });
  const periode = body.periode;
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste post niet meer genegeerd: regel #${numId} voor periode ${periode}` },
    () => {
      try {
        removeVpNegeer(numId, periode);
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
