// FILE: transacties.ts
// AANGEMAAKT: 25-03-2026 12:00
// VERSIE: 1
// GEWIJZIGD: 31-03-2026 20:00
//
// WIJZIGINGEN (31-03-2026 20:00):
// - Alle aanpassingsvelden via LEFT JOIN transactie_aanpassingen (datum_aanpassing, categorie_id, status, etc.)
// - Datumfilter en ORDER BY op COALESCE(a.datum_aanpassing, t.datum)
// - TransactieMetCategorie: originele_datum vervangen door datum_aanpassing

import getDb from '@/lib/db';
import type { Transactie, TransactieType, TransactieStatus } from '@/lib/schema';

export interface TransactieFilters {
  type?: TransactieType;
  import_id?: number;
  status?: TransactieStatus;
  datum_van?: string;
  datum_tot?: string;
  maand_nr?: number;
  naam_tegenpartij?: string;
  categorie?: string;
  handmatig_gecategoriseerd?: boolean;
}

export interface TransactieMetCategorie extends Transactie {
  // Aanpassingen (via transactie_aanpassingen JOIN)
  datum_aanpassing: string | null;
  categorie_id: number | null;
  status: TransactieStatus;
  handmatig_gecategoriseerd: number;
  bevroren: number;
  fout_geboekt: number;
  toelichting: string | null;
  gearchiveerd_aangepast?: number;
  // Categorie-tekst (via categorieen JOIN of directe tekst voor omboekingen)
  categorie: string | null;
  subcategorie: string | null;
  // Bedrag-bereik van de gematchte regel (voor prefill in CategoriePopup)
  regel_bedrag_min: number | null;
  regel_bedrag_max: number | null;
  // Rekeningen (via rekeningen JOIN)
  rekening_naam: string | null;
  tegenrekening_naam: string | null;
  // Import metadata
  is_nieuw: number;
}

const IMPORT_KOLOMMEN = `
  t.id, t.import_id, t.iban_bban, t.munt, t.bic, t.volgnummer, t.datum, t.rentedatum,
  t.bedrag, t.saldo_na_trn, t.tegenrekening_iban_bban, t.naam_tegenpartij,
  t.naam_uiteindelijke_partij, t.naam_initierende_partij, t.bic_tegenpartij,
  t.code, t.batch_id, t.transactiereferentie, t.machtigingskenmerk, t.incassant_id,
  t.betalingskenmerk, t.omschrijving_1, t.omschrijving_2, t.omschrijving_3,
  t.reden_retour, t.oorspr_bedrag, t.oorspr_munt, t.koers, t.type
`;

export function getTransacties(filters?: TransactieFilters): TransactieMetCategorie[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.type) {
    conditions.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters?.import_id !== undefined) {
    conditions.push('t.import_id = ?');
    params.push(filters.import_id);
  }
  if (filters?.status) {
    conditions.push("COALESCE(a.status, 'nieuw') = ?");
    params.push(filters.status);
  }
  if (filters?.datum_van) {
    conditions.push('COALESCE(a.datum_aanpassing, t.datum) >= ?');
    params.push(filters.datum_van);
  }
  if (filters?.datum_tot) {
    conditions.push('COALESCE(a.datum_aanpassing, t.datum) <= ?');
    params.push(filters.datum_tot);
  }
  if (filters?.maand_nr !== undefined) {
    conditions.push("strftime('%m', COALESCE(a.datum_aanpassing, t.datum)) = ?");
    params.push(String(filters.maand_nr).padStart(2, '0'));
  }
  if (filters?.naam_tegenpartij) {
    conditions.push('t.naam_tegenpartij = ?');
    params.push(filters.naam_tegenpartij);
  }
  if (filters?.categorie) {
    conditions.push("COALESCE(c.categorie, a.categorie) = ?");
    params.push(filters.categorie);
  }
  if (filters?.handmatig_gecategoriseerd) {
    conditions.push('COALESCE(a.handmatig_gecategoriseerd, 0) = 1');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      ${IMPORT_KOLOMMEN},
      a.datum_aanpassing,
      a.categorie_id,
      COALESCE(a.status, 'nieuw')                    AS status,
      COALESCE(a.handmatig_gecategoriseerd, 0)        AS handmatig_gecategoriseerd,
      COALESCE(a.bevroren, 0)                        AS bevroren,
      COALESCE(a.fout_geboekt, 0)                    AS fout_geboekt,
      a.toelichting,
      COALESCE(a.gearchiveerd, 0)                    AS gearchiveerd_aangepast,
      COALESCE(c.categorie, a.categorie)              AS categorie,
      COALESCE(c.subcategorie, a.subcategorie)        AS subcategorie,
      c.bedrag_min                                    AS regel_bedrag_min,
      c.bedrag_max                                    AS regel_bedrag_max,
      r1.naam                                         AS rekening_naam,
      r2.naam                                         AS tegenrekening_naam,
      CASE WHEN date(i.geimporteerd_op) = date('now') THEN 1 ELSE 0 END AS is_nieuw
    FROM transacties t
    LEFT JOIN transactie_aanpassingen a ON t.id = a.transactie_id
    LEFT JOIN categorieen c ON a.categorie_id = c.id
    LEFT JOIN rekeningen r1 ON t.iban_bban = r1.iban
    LEFT JOIN rekeningen r2 ON t.tegenrekening_iban_bban = r2.iban
    LEFT JOIN imports i ON t.import_id = i.id
    ${where}
    ORDER BY COALESCE(a.datum_aanpassing, t.datum) DESC, t.id DESC
  `;

  return getDb().prepare(sql).all(params) as TransactieMetCategorie[];
}

