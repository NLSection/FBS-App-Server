import { NextResponse } from 'next/server';
import { getBudgettenPotjes } from '@/lib/budgettenPotjes';
import { getRekeningen } from '@/lib/rekeningen';
import { getRekeningGroepen } from '@/lib/rekeningGroepen';
import { getTransactiesTabs } from '@/lib/transactiesTabs';
import { getSubcategorieen } from '@/lib/subcategorieen';
import { getUniekeCategorieen } from '@/lib/categorisatie';
import { getTrendTabs } from '@/lib/trendTabs';
import { getAllPanels } from '@/lib/trendPanels';
import { getAllConsolidaties } from '@/lib/trendConsolidaties';
import { getAllePeriodes } from '@/lib/maandperiodes';
import { getInstellingen } from '@/lib/instellingen';

export const dynamic = 'force-dynamic';

/** Eén roundtrip voor de Trends-pagina mount. Vervangt 5 losse fetches:
 *  /api/lookup-data, /api/trend-tabs, /api/periodes, /api/instellingen, /api/trend-panels.
 *  Per resource partial-OK: bij fout `null` + entry in `errors`. */
export function GET() {
  const taken = [
    ['lookupData', () => ({
      budgettenPotjes:   getBudgettenPotjes(),
      rekeningen:        getRekeningen(),
      rekeningGroepen:   getRekeningGroepen(),
      transactieTabs:    getTransactiesTabs(),
      uniekeCategorieen: getUniekeCategorieen(),
      subcategorieen:    getSubcategorieen(),
    })],
    ['tabs',         () => getTrendTabs()],
    ['periodes',     () => getAllePeriodes()],
    ['instellingen', () => getInstellingen()],
    ['panels',       () => getAllPanels()],
    ['consolidaties', () => getAllConsolidaties()],
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
