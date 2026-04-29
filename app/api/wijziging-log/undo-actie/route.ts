// POST /api/wijziging-log/undo-actie
//
// Body: { actieId: string, forceer?: boolean }
// Draait alleen de entries van één specifieke actie_id terug. Conflict-detectie
// waarschuwt als een latere actie dezelfde rij heeft aangeraakt — in dat geval
// returnt de route 409 met de conflict-info, tenzij de client `forceer=true`
// meestuurt om door te gaan zonder die latere wijzigingen mee terug te draaien.

import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { zonderLogging } from '@/lib/wijzigingContext';
import { draaiTerug, vindLatereConflicten, type LogRij } from '@/lib/wijzigingUndo';
import { categoriseerTransacties } from '@/lib/categorisatie';

export async function POST(request: NextRequest) {
  let body: { actieId?: unknown; forceer?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  const actieId = typeof body.actieId === 'string' ? body.actieId : '';
  const forceer = body.forceer === true;
  if (!actieId) {
    return NextResponse.json({ error: 'actieId is verplicht.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const entries = db.prepare(`
      SELECT id, actie_id, tabel, rij_id, operatie, voor_json, na_json
      FROM wijziging_log
      WHERE actie_id = ? AND teruggedraaid = 0
      ORDER BY id DESC
    `).all(actieId) as LogRij[];

    if (entries.length === 0) {
      return NextResponse.json({ error: 'Geen actieve wijzigingen voor deze actie.' }, { status: 404 });
    }

    if (!forceer) {
      const conflicten = vindLatereConflicten(db, entries);
      if (conflicten.length > 0) {
        return NextResponse.json({
          error: 'Latere actie heeft dezelfde rij(en) aangeraakt — undo zou die wijzigingen overschrijven.',
          conflicten,
        }, { status: 409 });
      }
    }

    // FK-cleanup voor categorieen-INSERTs: hermatch-updates op
    // transactie_aanpassingen.categorie_id zijn niet gelogd (zonderLogging in
    // categoriseerTransacties), dus draaiTerug's raw DELETE op categorieen
    // zou een FK-violation geven. Zelfde aanpak als deleteCategorieRegel
    // in lib/categorisatie.ts:475-477. Na de undo herstellen we de afgeleide
    // staat met categoriseerTransacties() (comment-belofte r206-208).
    const heeftCategorieInsert = entries.some(e => e.tabel === 'categorieen' && e.operatie === 'insert' && e.rij_id !== null);

    let aantal = 0;
    zonderLogging(() => {
      const tx = db.transaction(() => {
        for (const e of entries) {
          if (e.tabel === 'categorieen' && e.operatie === 'insert' && e.rij_id !== null) {
            db.prepare('UPDATE transactie_aanpassingen SET categorie_id = NULL WHERE categorie_id = ?').run(e.rij_id);
          }
          draaiTerug(db, e);
        }
        const ids = entries.map(e => e.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE wijziging_log SET teruggedraaid = 1 WHERE id IN (${placeholders})`).run(...ids);
        aantal = entries.length;
      });
      tx();
    });

    if (heeftCategorieInsert) {
      await categoriseerTransacties();
    }

    return NextResponse.json({ success: true, teruggedraaid: aantal });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: `Undo mislukt: ${bericht}` }, { status: 500 });
  }
}
