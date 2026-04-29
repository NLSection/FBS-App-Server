import { NextResponse } from 'next/server';
import { getBudgettenPotjes } from '@/lib/budgettenPotjes';

// Lookup-data is metadata die door user-acties verandert (rekening toevoegen,
// categorie hernoemen) — Next.js caching zou stale data tonen. Force-dynamic
// zodat elke request opnieuw uit DB komt. Caller hoeft dan geen `cache: 'no-store'`.
export const dynamic = 'force-dynamic';

import { getRekeningen } from '@/lib/rekeningen';
import { getRekeningGroepen } from '@/lib/rekeningGroepen';
import { getTransactiesTabs } from '@/lib/transactiesTabs';
import { getSubcategorieen } from '@/lib/subcategorieen';
import { getUniekeCategorieen } from '@/lib/categorisatie';

/** Gebundelde lookup/metadata-fetch voor pagina's met meerdere dropdowns en
 *  badges. Vervangt 6 losse client-fetches door één response. Per resource
 *  partial-OK: bij een fout krijgt het veld `null` en komt er een entry in
 *  `errors`. Frontend kan per dropdown graceful fallback doen.
 */
export function GET() {
  const taken = [
    ['budgettenPotjes',     () => getBudgettenPotjes()],
    ['rekeningen',          () => getRekeningen()],
    ['rekeningGroepen',     () => getRekeningGroepen()],
    ['transactieTabs',      () => getTransactiesTabs()],
    ['uniekeCategorieen',   () => getUniekeCategorieen()],
    ['subcategorieen',      () => getSubcategorieen()],
  ] as const;

  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, fn] of taken) {
    try {
      data[key] = fn();
    } catch (err) {
      data[key] = null;
      errors[key] = err instanceof Error ? err.message : 'Onbekende fout';
    }
  }

  const heeftErrors = Object.keys(errors).length > 0;
  return NextResponse.json(heeftErrors ? { ...data, errors } : data);
}
