// FILE: route.ts (api/categorieen/uniek)
// AANGEMAAKT: 29-03-2026 07:00
// VERSIE: 1
// GEWIJZIGD: 31-03-2026 22:30
//
// WIJZIGINGEN (29-03-2026 07:00):
// - Initieel: GET distinct categorienamen uit transacties (niet-null)
// WIJZIGINGEN (31-03-2026 22:30):
// - Bronnen uitgebreid: categorieregels (categorieen) + handmatige aanpassingen (transactie_aanpassingen)

import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export function GET() {
  try {
    const rows = getDb().prepare(`
      SELECT DISTINCT categorie FROM categorieen WHERE categorie IS NOT NULL
      UNION
      SELECT DISTINCT COALESCE(c.categorie, a.categorie) AS categorie
      FROM transactie_aanpassingen a
      LEFT JOIN categorieen c ON a.categorie_id = c.id
      WHERE COALESCE(c.categorie, a.categorie) IS NOT NULL
      ORDER BY categorie
    `).all() as { categorie: string }[];
    return NextResponse.json(rows.map(r => r.categorie));
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
