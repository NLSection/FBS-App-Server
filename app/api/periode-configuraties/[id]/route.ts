import { NextRequest, NextResponse } from 'next/server';
import { deletePeriodeConfig } from '@/lib/periodeConfigs';
import { metWijziging } from '@/lib/wijziging';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (isNaN(id)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  return metWijziging(
    { type: 'periode', beschrijving: `Periode-configuratie verwijderd (#${id})` },
    () => {
      try {
        deletePeriodeConfig(id);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 400 });
      }
    },
  );
}
