import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export function GET() {
  try {
    const db = getDb();
    const totaal = (db.prepare('SELECT COUNT(*) AS n FROM transacties').get() as { n: number }).n;
    const gecategoriseerd = (db.prepare(`
      SELECT COUNT(*) AS n FROM transacties t
      LEFT JOIN transactie_aanpassingen a ON t.id = a.transactie_id
      LEFT JOIN categorieen c ON a.categorie_id = c.id
      WHERE COALESCE(c.categorie, a.categorie) IS NOT NULL
    `).get() as { n: number }).n;
    const categorieen    = (db.prepare('SELECT COUNT(*) AS n FROM budgetten_potjes').get() as { n: number }).n;
    const subcategorieen = (db.prepare("SELECT COUNT(DISTINCT subcategorie) AS n FROM categorieen WHERE subcategorie IS NOT NULL AND subcategorie != ''").get() as { n: number }).n;
    return NextResponse.json({ totaal, gecategoriseerd, ongecategoriseerd: totaal - gecategoriseerd, categorieen, subcategorieen });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}
