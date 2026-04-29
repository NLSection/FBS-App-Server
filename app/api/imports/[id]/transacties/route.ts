import { NextRequest, NextResponse } from 'next/server';
import { getTransacties } from '@/lib/transacties';

type Params = Promise<{ id: string }>;

export function GET(_request: NextRequest, { params }: { params: Params }) {
  return params.then(({ id }) => {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
    try {
      const trx = getTransacties({ import_id: numId });
      return NextResponse.json(trx);
    } catch (err) {
      const bericht = err instanceof Error ? err.message : 'Databasefout.';
      return NextResponse.json({ error: bericht }, { status: 500 });
    }
  });
}
