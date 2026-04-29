import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';

interface Uitzondering {
  rekening_a_id: number;
  rekening_b_id: number;
}

interface UitzonderingMet {
  rekening_a_id: number;
  rekening_b_id: number;
  naam_a: string;
  naam_b: string;
}

export function GET() {
  try {
    const db = getDb();
    const rijen = db.prepare(`
      SELECT u.rekening_a_id, u.rekening_b_id, ra.naam AS naam_a, rb.naam AS naam_b
      FROM omboeking_uitzonderingen u
      JOIN rekeningen ra ON ra.id = u.rekening_a_id
      JOIN rekeningen rb ON rb.id = u.rekening_b_id
      ORDER BY ra.naam, rb.naam
    `).all() as UitzonderingMet[];
    return NextResponse.json(rijen);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { rekening_a_id?: number; rekening_b_id?: number } | null;
  if (!body?.rekening_a_id || !body?.rekening_b_id) {
    return NextResponse.json({ error: 'rekening_a_id en rekening_b_id zijn verplicht.' }, { status: 400 });
  }
  const a = Math.min(body.rekening_a_id, body.rekening_b_id);
  const b = Math.max(body.rekening_a_id, body.rekening_b_id);
  if (a === b) return NextResponse.json({ error: 'Dezelfde rekening kan niet met zichzelf worden gepaard.' }, { status: 400 });
  const namen = getDb().prepare('SELECT naam FROM rekeningen WHERE id IN (?, ?) ORDER BY id').all(a, b) as { naam: string }[];
  const label = namen.length === 2 ? `${namen[0].naam} ↔ ${namen[1].naam}` : `#${a} ↔ #${b}`;
  return metWijziging(
    { type: 'omboeking', beschrijving: `Omboeking-uitzondering toegevoegd: ${label}` },
    () => {
      try {
        getDb().prepare('INSERT OR IGNORE INTO omboeking_uitzonderingen (rekening_a_id, rekening_b_id) VALUES (?, ?)').run(a, b);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Uitzondering | null;
  if (!body?.rekening_a_id || !body?.rekening_b_id) {
    return NextResponse.json({ error: 'rekening_a_id en rekening_b_id zijn verplicht.' }, { status: 400 });
  }
  const a = Math.min(body.rekening_a_id, body.rekening_b_id);
  const b = Math.max(body.rekening_a_id, body.rekening_b_id);
  const namen = getDb().prepare('SELECT naam FROM rekeningen WHERE id IN (?, ?) ORDER BY id').all(a, b) as { naam: string }[];
  const label = namen.length === 2 ? `${namen[0].naam} ↔ ${namen[1].naam}` : `#${a} ↔ #${b}`;
  return metWijziging(
    { type: 'omboeking', beschrijving: `Omboeking-uitzondering verwijderd: ${label}` },
    () => {
      getDb().prepare('DELETE FROM omboeking_uitzonderingen WHERE rekening_a_id = ? AND rekening_b_id = ?').run(a, b);
      return new NextResponse(null, { status: 204 });
    },
  );
}
