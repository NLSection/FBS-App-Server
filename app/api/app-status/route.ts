import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export function GET() {
  try {
    const db = getDb();
    const aantalImports = (db.prepare('SELECT COUNT(*) AS n FROM imports').get() as { n: number }).n;
    const aantalGecategoriseerd = (db.prepare('SELECT COUNT(*) AS n FROM transactie_aanpassingen WHERE categorie_id IS NOT NULL OR categorie IS NOT NULL').get() as { n: number }).n;
    const heeftImports = aantalImports > 0;
    const heeftGecategoriseerd = heeftImports && aantalGecategoriseerd > 0;
    // Vroegste transactiedatum van de meest recente import met transacties (voor onboarding navigatie)
    const laatsteImportDatum = heeftImports
      ? (db.prepare('SELECT MIN(t.datum) AS d FROM transacties t WHERE t.import_id = (SELECT MAX(i.id) FROM imports i WHERE EXISTS (SELECT 1 FROM transacties t2 WHERE t2.import_id = i.id))').get() as { d: string | null })?.d ?? null
      : null;
    return NextResponse.json({ heeftImports, heeftGecategoriseerd, aantalImports, aantalGecategoriseerd, laatsteImportDatum });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
