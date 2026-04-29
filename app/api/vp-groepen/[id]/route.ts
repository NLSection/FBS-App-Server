import { NextRequest, NextResponse } from 'next/server';
import { renameVpGroep, deleteVpGroep } from '@/lib/vpGroepen';
import { metWijziging } from '@/lib/wijziging';

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (typeof body.naam !== 'string' || !body.naam.trim()) return NextResponse.json({ error: 'naam is verplicht.' }, { status: 400 });
  const naam = body.naam;
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste Posten-groep hernoemd (#${numId}) → ${naam}` },
    () => {
      try {
        renameVpGroep(numId, naam);
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  return metWijziging(
    { type: 'vaste-post', beschrijving: `Vaste Posten-groep verwijderd (#${numId})` },
    () => {
      try {
        deleteVpGroep(numId);
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
