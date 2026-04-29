import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  const oud = getDb().prepare('SELECT iban FROM genegeerde_rekeningen WHERE id = ?').get(numId) as { iban: string } | undefined;
  return metWijziging(
    { type: 'rekening', beschrijving: `Rekening niet meer genegeerd: ${oud?.iban ?? `#${numId}`}` },
    () => {
      try {
        getDb().prepare('DELETE FROM genegeerde_rekeningen WHERE id = ?').run(numId);
        return NextResponse.json({ ok: true });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
