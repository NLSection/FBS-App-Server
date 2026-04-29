import { NextRequest, NextResponse } from 'next/server';
import { deleteVastePostDefinitie, updateVastePostDefinitie } from '@/lib/vastePostenConfig';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  let body: { iban?: string; naam?: string; omschrijving?: string | null; label?: string; verwachte_dag?: number | null; verwacht_bedrag?: number | null };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste post-definitie bijgewerkt: ${body.label ?? ''} (${body.naam ?? ''})` },
    () => {
      try {
        updateVastePostDefinitie(
          numId,
          body.iban ?? '',
          body.naam ?? '',
          body.omschrijving ?? null,
          body.label ?? '',
          body.verwachte_dag ?? null,
          body.verwacht_bedrag ?? null
        );
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  }
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste post-definitie verwijderd (#${numId})` },
    () => {
      try {
        deleteVastePostDefinitie(numId);
        return NextResponse.json({ ok: true });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
