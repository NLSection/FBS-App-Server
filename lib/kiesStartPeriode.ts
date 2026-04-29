// Client-safe helper: kiest de standaard-periode bij paginastart.
// Apart bestand zodat client components 'm kunnen importeren zonder
// lib/maandperiodes.ts (= server-only door getDb-import) mee te trekken.

import type { Periode } from './maandperiodes';

/**
 * Kiest de standaard-periode bij paginastart:
 *   1. actuele periode mét data (= vandaag valt erin én er zijn transacties)
 *   2. anders: laatste periode met data (meest recente met transacties)
 *   3. anders: laatste periode in de array (sterk fallback)
 *   4. null als de array leeg is
 *
 * Voorkomt dat een verse maand zonder data automatisch geselecteerd wordt
 * waardoor de pagina leeg lijkt terwijl er elders wél data is.
 */
export function kiesStartPeriode(periodes: Periode[]): Periode | null {
  if (periodes.length === 0) return null;
  const actueelMetData = periodes.find(p => p.status === 'actueel' && p.heeftData);
  if (actueelMetData) return actueelMetData;
  for (let i = periodes.length - 1; i >= 0; i--) {
    if (periodes[i].heeftData) return periodes[i];
  }
  return periodes[periodes.length - 1];
}
