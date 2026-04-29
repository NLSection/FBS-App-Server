import { NextRequest, NextResponse } from 'next/server';
import { categoriseerTransacties } from '@/lib/categorisatie';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const importIdRaw = body.importId;
  const importId = importIdRaw !== undefined && importIdRaw !== null
    ? (typeof importIdRaw === 'number' ? importIdRaw : parseInt(String(importIdRaw), 10))
    : undefined;

  if (importId !== undefined && isNaN(importId)) {
    return NextResponse.json({ error: 'importId moet een getal zijn.' }, { status: 400 });
  }

  const toelichting = typeof body.toelichting === 'string' && body.toelichting ? body.toelichting : null;
  const categorieId = typeof body.categorie_id === 'number' ? body.categorie_id : null;

  return metWijziging(
    {
      type: 'categorisatie',
      beschrijving: importId !== undefined ? `Hermatch van import ${importId}` : 'Volledige hermatch',
    },
    async () => {
      try {
        const resultaat = await categoriseerTransacties(importId);
        if (categorieId !== null) {
          getDb().prepare('UPDATE transactie_aanpassingen SET toelichting = ? WHERE categorie_id = ?').run(toelichting, categorieId);
        }
        return NextResponse.json(resultaat);
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
