import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const datumVanaf = searchParams.get('datumVanaf');
  const datumTm    = searchParams.get('datumTm');
  if (!datumVanaf || !datumTm) return NextResponse.json({ error: 'datumVanaf en datumTm vereist.' }, { status: 400 });

  try {
    const db = getDb();
    const { aantal } = db.prepare(
      `SELECT COUNT(*) AS aantal FROM transacties WHERE datum >= ? AND datum <= ?`
    ).get(datumVanaf, datumTm) as { aantal: number };
    return NextResponse.json({ aantal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { datumVanaf, datumTm } = await req.json() as { datumVanaf: string; datumTm: string };
  if (!datumVanaf || !datumTm) return NextResponse.json({ error: 'datumVanaf en datumTm vereist.' }, { status: 400 });

  try {
    const db = getDb();
    const { changes } = db.prepare(
      `DELETE FROM transacties WHERE datum >= ? AND datum <= ?`
    ).run(datumVanaf, datumTm);

    // Verwijder imports zonder resterende transacties
    db.prepare(`DELETE FROM imports WHERE id NOT IN (SELECT DISTINCT import_id FROM transacties)`).run();

    return NextResponse.json({ verwijderd: changes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}
