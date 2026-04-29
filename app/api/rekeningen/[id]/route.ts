import { NextRequest, NextResponse } from 'next/server';
import { deleteRekening, updateRekening } from '@/lib/rekeningen';
import { herclassificeerTypes } from '@/lib/herclassificeer';
import { metWijziging } from '@/lib/wijziging';
import getDb from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  let body: { iban?: string; naam?: string; type?: string; kleur?: string | null; kleur_auto?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  if (body.type !== 'betaal' && body.type !== 'spaar') {
    return NextResponse.json({ error: 'Type moet "betaal" of "spaar" zijn.' }, { status: 400 });
  }
  const rType: 'betaal' | 'spaar' = body.type;

  return metWijziging(
    { type: 'rekening', beschrijving: `Rekening bijgewerkt: ${body.naam ?? ''} (${body.iban ?? ''})` },
    () => {
      try {
        updateRekening(numId, body.iban ?? '', body.naam ?? '', rType, body.kleur, body.kleur_auto);
        herclassificeerTypes();
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
  const oud = getDb().prepare('SELECT iban, naam FROM rekeningen WHERE id = ?').get(numId) as { iban: string; naam: string } | undefined;
  return metWijziging(
    { type: 'rekening', beschrijving: `Rekening verwijderd: ${oud ? `${oud.naam} (${oud.iban})` : `#${numId}`}` },
    () => {
      try {
        deleteRekening(numId);
        herclassificeerTypes();
        return NextResponse.json({ ok: true });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
