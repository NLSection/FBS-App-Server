// FILE: imports.ts
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 15:30
//
// WIJZIGINGEN (25-03-2026 15:30):
// - Initiële aanmaak: DB-queries voor imports en transacties (DIR-9)
// - INSERT OR IGNORE + return opgeslagen-telling voor duplicaatdetectie

import getDb from '@/lib/db';
import type { TransactieType } from '@/lib/schema';
import type { RuweTransactie } from '@/features/import/utils/parseCSV';

export interface TransactieMetType extends RuweTransactie {
  type: TransactieType;
}

export function insertImport(bestandsnaam: string, aantalTransacties: number): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO imports (bestandsnaam, geimporteerd_op, aantal_transacties)
       VALUES (?, datetime('now'), ?)`
    )
    .run(bestandsnaam, aantalTransacties);
  return result.lastInsertRowid as number;
}

export function insertTransacties(importId: number, transacties: TransactieMetType[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transacties (
      import_id, iban_bban, munt, bic, volgnummer, datum, rentedatum,
      bedrag, saldo_na_trn, tegenrekening_iban_bban, naam_tegenpartij,
      naam_uiteindelijke_partij, naam_initierende_partij, bic_tegenpartij,
      code, batch_id, transactiereferentie, machtigingskenmerk, incassant_id,
      betalingskenmerk, omschrijving_1, omschrijving_2, omschrijving_3,
      reden_retour, oorspr_bedrag, oorspr_munt, koers, type, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nieuw'
    )
  `);

  let opgeslagen = 0;
  const insertAlles = db.transaction((rijen: TransactieMetType[]) => {
    for (const t of rijen) {
      const result = stmt.run(
        importId,
        t.iban_bban, t.munt, t.bic, t.volgnummer, t.datum, t.rentedatum,
        t.bedrag, t.saldo_na_trn, t.tegenrekening_iban_bban, t.naam_tegenpartij,
        t.naam_uiteindelijke_partij, t.naam_initierende_partij, t.bic_tegenpartij,
        t.code, t.batch_id, t.transactiereferentie, t.machtigingskenmerk, t.incassant_id,
        t.betalingskenmerk, t.omschrijving_1, t.omschrijving_2, t.omschrijving_3,
        t.reden_retour, t.oorspr_bedrag, t.oorspr_munt, t.koers,
        t.type
      );
      opgeslagen += result.changes;
    }
  });

  insertAlles(transacties);

  // Bewaar het aantal daadwerkelijk toegevoegde transacties
  db.prepare('UPDATE imports SET aantal_nieuw = ? WHERE id = ?').run(opgeslagen, importId);

  return opgeslagen;
}
