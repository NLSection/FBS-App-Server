import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';
import { ensureBudgetPotje } from '@/lib/budgettenPotjes';
import { insertSubcategorie } from '@/lib/subcategorieen';

export async function POST(request: NextRequest) {
  let body: { ids?: unknown; categorie?: unknown; subcategorie?: unknown; toelichting?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isFinite(n)) : [];
  const categorie = typeof body.categorie === 'string' ? body.categorie.trim() : '';
  const subcategorie = typeof body.subcategorie === 'string' ? body.subcategorie.trim() : '';
  const toelichting = typeof body.toelichting === 'string' && body.toelichting.trim() !== ''
    ? body.toelichting.trim()
    : null;

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Geen transacties geselecteerd.' }, { status: 400 });
  }
  if (!categorie) {
    return NextResponse.json({ error: 'Categorie is verplicht.' }, { status: 400 });
  }
  if (!subcategorie) {
    return NextResponse.json({ error: 'Subcategorie is verplicht.' }, { status: 400 });
  }

  return metWijziging(
    { type: 'transactie', beschrijving: `${ids.length} transactie${ids.length === 1 ? '' : 's'} bulk-gecategoriseerd naar ${categorie} › ${subcategorie}` },
    () => {
      try {
        const db = getDb();
        const regelRow = db
          .prepare('SELECT id FROM categorieen WHERE categorie = ? AND subcategorie IS ? LIMIT 1')
          .get(categorie, subcategorie) as { id: number } | undefined;
        const regelId = regelRow ? regelRow.id : null;

        const tx = db.transaction(() => {
          const insertOrIgnore = db.prepare('INSERT OR IGNORE INTO transactie_aanpassingen (transactie_id) VALUES (?)');
          const update = db.prepare(`
            UPDATE transactie_aanpassingen
            SET categorie = ?, subcategorie = ?, categorie_id = ?, status = 'verwerkt',
                handmatig_gecategoriseerd = 1, bevroren = 0, toelichting = ?
            WHERE transactie_id = ?
          `);
          for (const id of ids) {
            insertOrIgnore.run(id);
            update.run(categorie, subcategorie, regelId, toelichting, id);
          }
        });
        tx();
        ensureBudgetPotje(categorie);
        try { insertSubcategorie(categorie, subcategorie); } catch { /* bestaat al */ }
        return NextResponse.json({ ok: true, aangepast: ids.length });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
