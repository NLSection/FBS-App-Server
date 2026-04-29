import { NextRequest, NextResponse } from 'next/server';
import { addVpNegeer } from '@/lib/vpNegeer';
import { metWijziging } from '@/lib/wijziging';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  const { regelId, periode } = body;
  if (typeof regelId !== 'number' || typeof periode !== 'string' || !periode) {
    return NextResponse.json({ error: 'regelId en periode zijn verplicht.' }, { status: 400 });
  }
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste post genegeerd: regel #${regelId} voor periode ${periode}` },
    () => {
      try {
        addVpNegeer(regelId, periode);
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
