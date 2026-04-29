// FILE: configStore.ts
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 18:30
//
// WIJZIGINGEN (25-03-2026 18:30):
// - Initiële aanmaak: MatchConfig type + loader vanuit config/matchConfig.json
// - Omgebouwd naar SQLite als bron (rekeningen + vaste_posten_config tabellen)
// - vasteLasten verwijderd uit MatchConfig (niet meer nodig voor type-matching)

import getDb from '@/lib/db';

export interface MatchConfig {
  eigenIbans: string[];
  spaarIbans: string[];
}

export function getMatchConfig(): MatchConfig {
  const db = getDb();

  const rekeningen = db
    .prepare('SELECT iban, type FROM rekeningen')
    .all() as { iban: string; type: string }[];

  return {
    eigenIbans: rekeningen.map(r => r.iban),
    spaarIbans: rekeningen.filter(r => r.type === 'spaar').map(r => r.iban),
  };
}
