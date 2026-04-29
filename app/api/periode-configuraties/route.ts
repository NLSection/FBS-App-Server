import { NextRequest, NextResponse } from 'next/server';
import { getPeriodeConfigs, addPeriodeConfig } from '@/lib/periodeConfigs';
import { updateInstellingen } from '@/lib/instellingen';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getPeriodeConfigs());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const maandStartDag = body.maandStartDag as number;
  const geldigVanaf   = body.geldigVanaf   as string;

  if (!Number.isInteger(maandStartDag) || maandStartDag < 1 || maandStartDag > 28) {
    return NextResponse.json({ error: 'maandStartDag moet een geheel getal zijn tussen 1 en 28.' }, { status: 400 });
  }
  if (!geldigVanaf || (geldigVanaf !== '0000-01' && !/^\d{4}-\d{2}$/.test(geldigVanaf))) {
    return NextResponse.json({ error: 'geldigVanaf moet een geldige YYYY-MM zijn.' }, { status: 400 });
  }

  return metWijziging(
    { type: 'periode', beschrijving: `Periode-configuratie toegevoegd: startdag ${maandStartDag} geldig vanaf ${geldigVanaf}` },
    () => {
      try {
        addPeriodeConfig(maandStartDag, geldigVanaf);
        updateInstellingen({ maandStartDag });
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
