import { NextRequest, NextResponse } from 'next/server';
import { getPanel } from '@/lib/trendPanels';
import { getTrendData } from '@/lib/trendData';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Bulk-fetch voor trend-paneel data. Eén roundtrip i.p.v. N parallelle calls
 *  (browser cap = 6 concurrent → queue bij veel panelen). Per-item fout isoleert
 *  zich in `errors`; succesvolle panelen komen door in `data`. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Body moet een array zijn.' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const r = item as { id?: unknown; datum_van?: unknown; datum_tot?: unknown };
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    if (!Number.isFinite(id)) continue;
    const van = typeof r.datum_van === 'string' ? r.datum_van : undefined;
    const tot = typeof r.datum_tot === 'string' ? r.datum_tot : undefined;
    if (van && !ISO_DATE.test(van)) { errors[id] = 'datum_van ongeldig'; continue; }
    if (tot && !ISO_DATE.test(tot)) { errors[id] = 'datum_tot ongeldig'; continue; }
    try {
      const panel = getPanel(id);
      if (!panel) { errors[id] = 'Panel niet gevonden'; continue; }
      data[id] = getTrendData(panel, { datum_van: van, datum_tot: tot });
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : 'Databasefout';
    }
  }

  const heeftErrors = Object.keys(errors).length > 0;
  return NextResponse.json(heeftErrors ? { data, errors } : { data });
}
