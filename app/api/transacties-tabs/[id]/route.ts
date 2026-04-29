import { NextRequest, NextResponse } from 'next/server';
import { deleteTransactiesTab } from '@/lib/transactiesTabs';
import { metWijziging } from '@/lib/wijziging';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metWijziging(
    { type: 'transactie-tab', beschrijving: `Transacties-tab verwijderd (#${id})` },
    () => {
      try {
        deleteTransactiesTab(Number(id));
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
