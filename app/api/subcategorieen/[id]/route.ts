import { NextRequest, NextResponse } from 'next/server';
import { updateSubcategorie, deleteSubcategorie } from '@/lib/subcategorieen';
import { metWijziging } from '@/lib/wijziging';
import getDb from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) return NextResponse.json({ error: 'Ongeldig ID.' }, { status: 400 });

  let body: { naam?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  if (!body.naam?.trim()) return NextResponse.json({ error: 'Naam is verplicht.' }, { status: 400 });
  const nieuweNaam = body.naam;

  const oud = getDb().prepare('SELECT categorie, naam FROM subcategorieen WHERE id = ?').get(id) as { categorie: string; naam: string } | undefined;
  const oudLabel = oud ? `${oud.categorie} › ${oud.naam}` : `#${id}`;

  return metWijziging(
    { type: 'categorie', beschrijving: `Subcategorie hernoemd: ${oudLabel} → ${nieuweNaam}` },
    () => {
      try {
        updateSubcategorie(id, nieuweNaam);
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

  const oud = getDb().prepare('SELECT categorie, naam FROM subcategorieen WHERE id = ?').get(id) as { categorie: string; naam: string } | undefined;
  return metWijziging(
    { type: 'categorie', beschrijving: `Subcategorie verwijderd: ${oud ? `${oud.categorie} › ${oud.naam}` : `#${id}`}` },
    () => {
      try {
        deleteSubcategorie(id);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}
