import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    const rows = getDb()
      .prepare('SELECT id, iban, datum_toegevoegd FROM genegeerde_rekeningen ORDER BY datum_toegevoegd DESC')
      .all();
    return NextResponse.json(rows);
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { iban?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  const iban = body.iban?.trim().toUpperCase();
  if (!iban) return NextResponse.json({ error: 'IBAN verplicht.' }, { status: 400 });

  return metWijziging(
    { type: 'rekening', beschrijving: `Rekening genegeerd: ${iban}` },
    () => {
      try {
        getDb()
          .prepare('INSERT OR IGNORE INTO genegeerde_rekeningen (iban) VALUES (?)')
          .run(iban);
        return NextResponse.json({ ok: true }, { status: 201 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
