import { NextRequest, NextResponse } from 'next/server';
import { getDashboardOverzicht } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Eén roundtrip voor BLS + CAT. Vervangt /api/dashboard/bls + /api/dashboard/cat:
 *  deelt de getTransacties-call binnen lib/dashboard.ts. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const datumVan = params.get('datum_van') ?? undefined;
  const datumTot = params.get('datum_tot') ?? undefined;
  if (datumVan && !ISO_DATE.test(datumVan)) {
    return NextResponse.json({ error: 'datum_van moet YYYY-MM-DD formaat hebben.' }, { status: 400 });
  }
  if (datumTot && !ISO_DATE.test(datumTot)) {
    return NextResponse.json({ error: 'datum_tot moet YYYY-MM-DD formaat hebben.' }, { status: 400 });
  }

  const groepIdStr = params.get('groep_id');
  const rekeningIdStr = params.get('rekening_id');
  const groepId = groepIdStr ? Number(groepIdStr) : undefined;
  const rekeningId = rekeningIdStr ? Number(rekeningIdStr) : undefined;

  try {
    const data = getDashboardOverzicht({ datumVan, datumTot, groepId, rekeningId });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
  }
}
