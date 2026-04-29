import { NextRequest, NextResponse } from 'next/server';
import { getTransactiesTabs, addTransactiesTab } from '@/lib/transactiesTabs';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getTransactiesTabs());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { type?: string; entiteit_id?: number };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (body.type !== 'groep' && body.type !== 'rekening')
    return NextResponse.json({ error: 'type moet groep of rekening zijn.' }, { status: 400 });
  if (!body.entiteit_id)
    return NextResponse.json({ error: 'entiteit_id is verplicht.' }, { status: 400 });
  const tabType = body.type;
  const entiteitId = body.entiteit_id;
  return metWijziging(
    { type: 'transactie-tab', beschrijving: `Transacties-tabblad toegevoegd: ${tabType} #${entiteitId}` },
    () => {
      try {
        const id = addTransactiesTab(tabType, entiteitId);
        return NextResponse.json({ id }, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
