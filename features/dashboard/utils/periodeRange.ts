import type { Periode } from '@/lib/maandperiodes';

/** Bepaal het datumbereik voor een dashboard-fetch. Twee modi:
 *  - Specifieke periode geselecteerd → gebruik die start/eind
 *  - "Alle maanden" → som over alle niet-toekomstige periodes van het jaar
 *
 *  Retourneert `null` als er geen periodes beschikbaar zijn (bv. verse install
 *  of toekomstig jaar). Caller hoort dan early te returnen i.p.v. een fetch
 *  zonder filter te doen — anders krijg je inconsistente data tussen de
 *  hoofdtabel (BLS) en uitgeklapte sub-rijen (CatSubTrx).
 */
export function bepaalDashboardPeriode(
  periode: Periode | null,
  jaar: number,
  allesPeriodes: Periode[],
): { datumVan: string; datumTot: string } | null {
  if (periode) {
    return { datumVan: periode.start, datumTot: periode.eind };
  }
  const jaarPeriodes = allesPeriodes.filter(p => p.jaar === jaar && p.status !== 'toekomstig');
  if (jaarPeriodes.length === 0) return null;
  return {
    datumVan: jaarPeriodes[0].start,
    datumTot: jaarPeriodes[jaarPeriodes.length - 1].eind,
  };
}
