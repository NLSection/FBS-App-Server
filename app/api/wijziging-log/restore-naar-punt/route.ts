// POST /api/wijziging-log/restore-naar-punt
//
// Body: { ankerId: number }
// Draait alle log-entries met id >= ankerId terug, in reverse-volgorde
// (jongste eerst), binnen één DB-transactie. De terugdraai-operaties zelf
// worden NIET gelogd — ze draaien in zonderLogging-scope.

import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { zonderLogging } from '@/lib/wijzigingContext';
import { draaiTerug, type LogRij } from '@/lib/wijzigingUndo';

export async function POST(request: NextRequest) {
  let body: { ankerId?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  const ankerId = typeof body.ankerId === 'number' ? body.ankerId : NaN;
  if (!Number.isInteger(ankerId) || ankerId < 1) {
    return NextResponse.json({ error: 'ankerId (geheel positief getal) is verplicht.' }, { status: 400 });
  }

  try {
    const db = getDb();
    let aantal = 0;
    zonderLogging(() => {
      const tx = db.transaction(() => {
        const entries = db.prepare(`
          SELECT id, actie_id, tabel, rij_id, operatie, voor_json, na_json
          FROM wijziging_log
          WHERE id >= ? AND teruggedraaid = 0
          ORDER BY id DESC
        `).all(ankerId) as LogRij[];

        for (const e of entries) draaiTerug(db, e);

        db.prepare('UPDATE wijziging_log SET teruggedraaid = 1 WHERE id >= ? AND teruggedraaid = 0').run(ankerId);
        aantal = entries.length;
      });
      tx();
    });
    return NextResponse.json({ success: true, teruggedraaid: aantal });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: `Terugdraaien mislukt: ${bericht}` }, { status: 500 });
  }
}
