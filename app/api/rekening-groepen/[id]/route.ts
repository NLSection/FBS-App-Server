import { NextRequest, NextResponse } from 'next/server';
import { updateRekeningGroep, deleteRekeningGroep } from '@/lib/rekeningGroepen';
import { metWijziging } from '@/lib/wijziging';
import getDb from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) return NextResponse.json({ error: 'Ongeldig ID.' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const ids = body.rekening_ids as number[] | undefined;
  const delen = [
    typeof body.naam === 'string' && body.naam ? `naam → ${body.naam}` : null,
    ids ? `${ids.length} rekening${ids.length === 1 ? '' : 'en'} gekoppeld` : null,
  ].filter(Boolean);

  return metWijziging(
    { type: 'rekening', beschrijving: `Rekeninggroep bijgewerkt (#${id})${delen.length ? ': ' + delen.join(', ') : ''}` },
    () => {
      try {
        updateRekeningGroep(
          id,
          body.naam as string | undefined,
          body.rekening_ids as number[] | undefined,
        );
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) return NextResponse.json({ error: 'Ongeldig ID.' }, { status: 400 });

  const oud = getDb().prepare('SELECT naam FROM rekening_groepen WHERE id = ?').get(id) as { naam: string } | undefined;
  return metWijziging(
    { type: 'rekening', beschrijving: `Rekeninggroep verwijderd: ${oud?.naam ?? `#${id}`}` },
    () => {
      try {
        deleteRekeningGroep(id);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}
