// FILE: herclassificeer.ts
// AANGEMAAKT: 26-03-2026 21:30
// VERSIE: 1
// GEWIJZIGD: 26-03-2026 22:00
//
// WIJZIGINGEN (26-03-2026 21:30):
// - Initiële aanmaak: herclassificeerTypes() — herbepaalt type van alle transacties na rekening-wijziging
// WIJZIGINGEN (26-03-2026 22:00):
// - bepaalType: drie condities (beide IBANs eigen, tegenrekening spaar, anders normaal)
// - herclassificeerTypes: categoriseerTransacties() bij elke typewijziging

import getDb from '@/lib/db';
import { getMatchConfig } from '@/lib/configStore';
import { categoriseerTransacties } from '@/lib/categorisatie';
import type { Transactie, TransactieType } from '@/lib/schema';

function bepaalType(t: Transactie, eigenIbans: string[], spaarIbans: string[]): TransactieType {
  const eigenIban    = t.iban_bban?.trim() ?? '';
  const tegenrekening = t.tegenrekening_iban_bban?.trim() ?? '';
  const isAf = (t.bedrag ?? 0) < 0;

  // Beide IBANs zijn eigen rekeningen → omboeking tussen eigen rekeningen
  if (eigenIban && tegenrekening && eigenIbans.includes(eigenIban) && eigenIbans.includes(tegenrekening)) {
    return isAf ? 'omboeking-af' : 'omboeking-bij';
  }
  // Tegenrekening is spaarrekening → omboeking
  if (tegenrekening && spaarIbans.includes(tegenrekening)) {
    return isAf ? 'omboeking-af' : 'omboeking-bij';
  }
  return isAf ? 'normaal-af' : 'normaal-bij';
}

export function herclassificeerTypes(): void {
  const db = getDb();
  const { eigenIbans, spaarIbans } = getMatchConfig();
  const transacties = db.prepare('SELECT * FROM transacties').all() as Transactie[];
  const updType = db.prepare('UPDATE transacties SET type = ? WHERE id = ?');

  let gewijzigd = false;

  db.transaction(() => {
    for (const t of transacties) {
      const nieuwType = bepaalType(t, eigenIbans, spaarIbans);
      if (nieuwType !== t.type) {
        updType.run(nieuwType, t.id);
        gewijzigd = true;
      }
    }
  })();

  if (gewijzigd) {
    categoriseerTransacties();
  }
}
