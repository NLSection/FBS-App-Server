// FILE: route.ts (api/imports)
// AANGEMAAKT: 03-04-2026 02:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 02:30
//
// WIJZIGINGEN (03-04-2026 02:30):
// - Filter: alleen imports met minstens 1 daadwerkelijk opgeslagen transactie
// WIJZIGINGEN (03-04-2026 02:00):
// - Initiële aanmaak: GET retourneert 10 meest recente imports

import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export function GET() {
  try {
    const db = getDb();
    const imports = db.prepare(
      `SELECT i.id, i.bestandsnaam, i.geimporteerd_op, i.aantal_transacties,
              (SELECT COUNT(*) FROM transacties t WHERE t.import_id = i.id) AS aantal_nieuw
       FROM imports i
       WHERE (SELECT COUNT(*) FROM transacties t WHERE t.import_id = i.id) > 0
       ORDER BY i.id DESC LIMIT 10`
    ).all() as { id: number; bestandsnaam: string; geimporteerd_op: string; aantal_transacties: number; aantal_nieuw: number }[];
    // SQLite datetime('now') = 'YYYY-MM-DD HH:MM:SS' (UTC, spatie). Safari/WebKit weigert dit
    // als Invalid Date; Chromium accepteert maar interpreteert als LOCAL → 1-2u offset op
    // Windows. Normaliseer naar ISO 8601 met 'T' + 'Z' zodat beide platforms UTC parsen.
    const genormaliseerd = imports.map(i => ({
      ...i,
      geimporteerd_op: i.geimporteerd_op.includes('T') ? i.geimporteerd_op : i.geimporteerd_op.replace(' ', 'T') + 'Z',
    }));
    return NextResponse.json(genormaliseerd);
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
