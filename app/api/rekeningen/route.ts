import { NextRequest, NextResponse } from 'next/server';
import { getRekeningen, insertRekening } from '@/lib/rekeningen';
import { herclassificeerTypes } from '@/lib/herclassificeer';
import { kiesAutomatischeKleur } from '@/lib/kleuren';
import { getBudgettenPotjes } from '@/lib/budgettenPotjes';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getRekeningen());
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { iban?: string; naam?: string; type?: string; kleur?: string | null; kleur_auto?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const { iban, naam, type } = body;
  if (!iban || !naam || !type) {
    return NextResponse.json({ error: 'iban, naam en type zijn verplicht.' }, { status: 400 });
  }
  if (type !== 'betaal' && type !== 'spaar') {
    return NextResponse.json({ error: 'type moet "betaal" of "spaar" zijn.' }, { status: 400 });
  }

  return metWijziging(
    { type: 'rekening', beschrijving: `Rekening aangemaakt: ${naam} (${iban}, ${type})` },
    () => {
      try {
        let kleur = body.kleur ?? null;
        if (!kleur) {
          const bestaandeRek = getRekeningen().map(r => r.kleur).filter((k): k is string => !!k);
          const catKleuren = getBudgettenPotjes().map(bp => bp.kleur).filter((k): k is string => !!k);
          kleur = kiesAutomatischeKleur([...bestaandeRek, ...catKleuren]);
        }
        const id = insertRekening(iban, naam, type, kleur, body.kleur_auto);
        herclassificeerTypes();
        return NextResponse.json({ id }, { status: 201 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
