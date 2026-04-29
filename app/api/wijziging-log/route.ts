// GET /api/wijziging-log — lijst van wijziging_log entries voor de activiteit-view.
//
// Entries komen gegroepeerd terug: alle log-rijen met dezelfde actie_id zijn
// onderdeel van één user-actie en worden bij undo als geheel teruggedraaid.
// Per groep tonen we de eerst/laatst-geraakte tabellen, het aantal rij-mutaties
// en de meest recente timestamp + beschrijving voor weergave.

import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

type LogRij = {
  id: number;
  actie_id: string;
  timestamp_ms: number;
  type: string;
  beschrijving: string;
  tabel: string;
  rij_id: number | null;
  operatie: 'insert' | 'update' | 'delete';
  teruggedraaid: number;
};

type Groep = {
  // De hoogste id binnen een groep wordt gebruikt als "ankerpunt" voor restore-naar-punt:
  // alle entries met id >= dit ankerpunt worden teruggedraaid.
  ankerId: number;
  actie_id: string;
  timestamp_ms: number;
  type: string;
  beschrijving: string;
  tabellen: string[];
  aantal_mutaties: number;
  teruggedraaid: boolean;
};

export async function GET(request: NextRequest) {
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const inclTeruggedraaid = request.nextUrl.searchParams.get('teruggedraaid') === '1';

  try {
    const db = getDb();
    const where = inclTeruggedraaid ? '' : 'WHERE teruggedraaid = 0';
    const rijen = db.prepare(`
      SELECT id, actie_id, timestamp_ms, type, beschrijving, tabel, rij_id, operatie, teruggedraaid
      FROM wijziging_log
      ${where}
      ORDER BY id DESC
      LIMIT ?
    `).all(limit * 10) as LogRij[];

    // Groepeer per actie_id; behoud volgorde (jongste eerst). Entries met
    // actie_id='systeem' komen elk in een eigen groep — die zijn niet onder
    // één user-actie geclusterd en worden individueel weergegeven.
    const groepen: Groep[] = [];
    const indexPerActie = new Map<string, number>();

    for (const r of rijen) {
      const sleutel = r.actie_id === 'systeem' ? `__systeem_${r.id}` : r.actie_id;
      let idx = indexPerActie.get(sleutel);
      if (idx === undefined) {
        idx = groepen.length;
        indexPerActie.set(sleutel, idx);
        groepen.push({
          ankerId: r.id,
          actie_id: r.actie_id,
          timestamp_ms: r.timestamp_ms,
          type: r.type,
          beschrijving: r.beschrijving,
          tabellen: [],
          aantal_mutaties: 0,
          teruggedraaid: r.teruggedraaid === 1,
        });
      }
      const g = groepen[idx];
      // ankerId = laagste id van groep (voor restore-naar-punt: revert alles met id >= ankerId)
      if (r.id < g.ankerId) g.ankerId = r.id;
      g.aantal_mutaties += 1;
      if (!g.tabellen.includes(r.tabel)) g.tabellen.push(r.tabel);
    }

    return NextResponse.json({ groepen: groepen.slice(0, limit) });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
