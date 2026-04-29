// FILE: matchTransactie.ts
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 18:30
//
// WIJZIGINGEN (25-03-2026 18:30):
// - Initiële aanmaak: score-based type-matching voor Rabobank transacties
// - Type systeem herzien: normaal-af/bij + omboeking-af/bij
//   vast en spaar zijn geen types meer — eigen IBAN → omboeking, anders → normaal

import type { TransactieType } from '@/lib/schema';
import type { MatchConfig } from '@/lib/configStore';
import type { RuweTransactie } from './parseCSV';

export function matchTransactie(trx: RuweTransactie, config: MatchConfig): TransactieType {
  const tegenrekening = trx.tegenrekening_iban_bban?.trim() ?? '';
  const isAf = (trx.bedrag ?? 0) < 0;

  // Omboeking: tegenrekening is een eigen rekening (betaal én spaar)
  if (tegenrekening && config.eigenIbans.includes(tegenrekening)) {
    return isAf ? 'omboeking-af' : 'omboeking-bij';
  }

  // Normaal: alle overige transacties
  return isAf ? 'normaal-af' : 'normaal-bij';
}
