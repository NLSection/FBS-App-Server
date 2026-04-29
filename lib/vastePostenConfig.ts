import getDb from '@/lib/db';

export interface VastePostDefinitie {
  id: number;
  iban: string;
  naam: string;
  omschrijving: string | null;
  label: string;
  verwachte_dag: number | null;
  verwacht_bedrag: number | null;
}

export function getVastePostenConfig(): VastePostDefinitie[] {
  return getDb()
    .prepare('SELECT id, iban, naam, omschrijving, label, verwachte_dag, verwacht_bedrag FROM vaste_posten_config ORDER BY label')
    .all() as VastePostDefinitie[];
}

export function insertVastePostDefinitie(
  iban: string,
  naam: string,
  omschrijving: string | null,
  label: string
): void {
  getDb()
    .prepare(
      'INSERT INTO vaste_posten_config (iban, naam, omschrijving, label) VALUES (?, ?, ?, ?)'
    )
    .run(iban.trim().toUpperCase(), naam.trim(), omschrijving?.trim() || null, label.trim());
}

export function updateVastePostDefinitie(
  id: number,
  iban: string,
  naam: string,
  omschrijving: string | null,
  label: string,
  verwachte_dag: number | null,
  verwacht_bedrag: number | null
): void {
  if (!iban.trim()) throw new Error('IBAN mag niet leeg zijn.');
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  if (!label.trim()) throw new Error('Label mag niet leeg zijn.');
  getDb()
    .prepare(`UPDATE vaste_posten_config
              SET iban = ?, naam = ?, omschrijving = ?, label = ?,
                  verwachte_dag = ?, verwacht_bedrag = ?
              WHERE id = ?`)
    .run(iban.trim().toUpperCase(), naam.trim(), omschrijving?.trim() || null,
         label.trim(), verwachte_dag, verwacht_bedrag, id);
}

export function deleteVastePostDefinitie(id: number): void {
  getDb()
    .prepare('DELETE FROM vaste_posten_config WHERE id = ?')
    .run(id);
}
