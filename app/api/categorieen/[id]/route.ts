import { NextRequest, NextResponse } from 'next/server';
import { updateCategorieRegel, deleteCategorieRegel, updateNaamOrigineel } from '@/lib/categorisatie';
import { metWijziging } from '@/lib/wijziging';
import { insertSubcategorie } from '@/lib/subcategorieen';
import getDb from '@/lib/db';

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (typeof body.naam_origineel !== 'string') return NextResponse.json({ error: 'naam_origineel is verplicht.' }, { status: 400 });
  const naamOrigineel = body.naam_origineel;
  return metWijziging(
    { type: 'categorie', beschrijving: `Regel-naam bijgewerkt (regel #${numId}): ${naamOrigineel}` },
    () => {
      try {
        updateNaamOrigineel(numId, naamOrigineel);
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  const db = getDb();
  const regel = db.prepare('SELECT categorie, subcategorie, naam_zoekwoord FROM categorieen WHERE id = ?').get(numId) as { categorie: string | null; subcategorie: string | null; naam_zoekwoord: string | null } | undefined;
  const label = regel ? `${regel.categorie ?? '?'}${regel.subcategorie ? ` › ${regel.subcategorie}` : ''}${regel.naam_zoekwoord ? ` (zoekwoord: ${regel.naam_zoekwoord})` : ''}` : `#${numId}`;
  return metWijziging(
    { type: 'categorie', beschrijving: `Regel verwijderd: ${label}` },
    () => {
      try {
        db.prepare(
          'UPDATE transactie_aanpassingen SET bevroren = 1, categorie_id = NULL WHERE categorie_id = ? AND COALESCE(handmatig_gecategoriseerd, 0) = 0'
        ).run(numId);
        deleteCategorieRegel(numId);
        return NextResponse.json({ ok: true });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const { iban, naam_origineel, naam_zoekwoord_raw, omschrijving_raw, categorie, subcategorie, toelichting, type, bedrag_min, bedrag_max } = body;

  if (!categorie || typeof categorie !== 'string') {
    return NextResponse.json({ error: 'categorie is verplicht.' }, { status: 400 });
  }

  const subLabel = typeof subcategorie === 'string' && subcategorie ? ` › ${subcategorie}` : '';
  const zoekLabel = typeof naam_zoekwoord_raw === 'string' && naam_zoekwoord_raw ? ` (zoekwoord: ${naam_zoekwoord_raw})` : '';

  return metWijziging(
    { type: 'categorie', beschrijving: `Regel bijgewerkt: ${categorie}${subLabel}${zoekLabel}` },
    () => {
      try {
        updateCategorieRegel(numId, {
          iban:              typeof iban === 'string'              ? iban              : null,
          naam_origineel:    typeof naam_origineel === 'string'    ? naam_origineel    : null,
          naam_zoekwoord_raw:'naam_zoekwoord_raw' in body
                              ? (typeof naam_zoekwoord_raw === 'string' ? naam_zoekwoord_raw : null)
                              : undefined,
          omschrijving_raw:  typeof omschrijving_raw === 'string'  ? omschrijving_raw  : null,
          categorie,
          subcategorie:      typeof subcategorie === 'string'      ? subcategorie      : null,
          toelichting:       'toelichting' in body
                              ? (typeof toelichting === 'string' ? toelichting || null : null)
                              : undefined,
          type:              typeof type === 'string'               ? type as never     : 'alle',
          bedrag_min:        'bedrag_min' in body ? (typeof bedrag_min === 'number' ? bedrag_min : null) : undefined,
          bedrag_max:        'bedrag_max' in body ? (typeof bedrag_max === 'number' ? bedrag_max : null) : undefined,
        });
        if (typeof subcategorie === 'string' && subcategorie.trim()) {
          try { insertSubcategorie(categorie as string, subcategorie as string); } catch { /* bestaat al */ }
        }
        return NextResponse.json({ ok: true });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
