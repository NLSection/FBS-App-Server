// FILE: categorisatie.ts
// AANGEMAAKT: 25-03-2026 17:30
// VERSIE: 1
// GEWIJZIGD: 01-04-2026 22:30
//
// WIJZIGINGEN (01-04-2026 22:30):
// - naam_zoekwoord per woord geschoond in insert en update (schoonMakenPerWoord helper)
// - P2 en P3 matching via woordVolgordeMatch regex i.p.v. includes
// WIJZIGINGEN (01-04-2026 21:30):
// - updateCategorieRegel: naam_zoekwoord en omschrijving_zoekwoord behouden bestaande DB-waarde als niet expliciet meegestuurd
// WIJZIGINGEN (01-04-2026 21:00):
// - matchCategorie P2: regels met gevuld omschrijving_zoekwoord uitgesloten van IBAN+naam_zoekwoord match
// WIJZIGINGEN (01-04-2026 20:30):
// - matchCategorie P1: omschrijving_zoekwoord regex-match (woorden in volgorde met willekeurige tekens ertussen)
// WIJZIGINGEN (01-04-2026 14:00):
// - matchCategorie P1: omschrijving_zoekwoord gesplitst op spaties; elk woord afzonderlijk gecheckt in omschrSchoon
// - insertCategorieRegel/updateCategorieRegel: omschrijving_zoekwoord per woord geschoond en joined met spatie
// WIJZIGINGEN (01-04-2026 10:00):
// - matchCategorie: IBAN+naam_zoekwoord nieuw als P2; naam_zoekwoord blijft P3; IBAN-only gedegradeerd naar P4
// WIJZIGINGEN (01-04-2026 00:15):
// - categoriseerOmboeking: vroegste positie in omschrijving bepaalt match ipv volgorde potjes-array
// WIJZIGINGEN (31-03-2026 23:45):
// - deleteCategorieRegel: FK in transactie_aanpassingen genulld voor delete (voorkomt FK constraint fout)
// WIJZIGINGEN (31-03-2026 20:00):
// - categoriseerTransacties: schrijft naar transactie_aanpassingen (UPSERT) i.p.v. transacties
// - handmatig_gecategoriseerd filter via JOIN op transactie_aanpassingen
// WIJZIGINGEN (30-03-2026 21:00):
// - CategorieRegel: toelichting veld toegevoegd
// - categoriseerTransacties: toelichting van matchende regel overnemen naar transactie
// - insertCategorieRegel: toelichting opslaan; bij duplicaat alsnog toelichting updaten
// - updateCategorieRegel: toelichting opslaan
// WIJZIGINGEN (29-03-2026 06:00):
// - insertCategorieRegel: duplicaatcheck uitgebreid met omschrijving_zoekwoord
// WIJZIGINGEN (28-03-2026 23:15):
// - schoonMaken: koppelteken (-) toegevoegd aan toegestane tekens
// - categoriseerTransacties: omboekingen proberen eerst matchCategorie; fallback naar categoriseerOmboeking
// - insertCategorieRegel: validatie verwijderd die omboekingen blokkeerde
// - insertCategorieRegel: duplicaatcheck op iban + naam_zoekwoord + type; bestaande id teruggeven

import getDb from '@/lib/db';
import { getInstellingen } from '@/lib/instellingen';
import { zonderLogging } from '@/lib/wijzigingContext';
import type { Transactie } from '@/lib/schema';

export type CategorieType =
  | 'normaal-af'
  | 'normaal-bij'
  | 'omboeking-af'
  | 'omboeking-bij'
  | 'alle';

export interface CategorieRegel {
  id: number;
  iban: string | null;
  naam_zoekwoord: string | null;
  naam_origineel: string | null;
  omschrijving_zoekwoord: string | null;
  categorie: string;
  subcategorie: string | null;
  toelichting: string | null;
  type: CategorieType;
  laatste_gebruik: string | null;
  bedrag_min: number | null;
  bedrag_max: number | null;
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function schoonMaken(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9&-]/g, '');
}

function schoonMakenPerWoord(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().split(/\s+/).map(w => schoonMaken(w)).filter(Boolean).join(' ');
}

function woordVolgordeMatch(zoekwoord: string, tekst: string): boolean {
  const words = zoekwoord.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const regex = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
  return regex.test(tekst);
}

function typeMatch(t: Transactie, regelType: CategorieType): boolean {
  if (regelType === 'alle') return true;
  return t.type === regelType;
}

function bedragMatch(t: Transactie, regel: CategorieRegel): boolean {
  if (regel.bedrag_min === null && regel.bedrag_max === null) return true;
  const b = t.bedrag ?? 0;
  if (regel.bedrag_min !== null && b < regel.bedrag_min) return false;
  if (regel.bedrag_max !== null && b > regel.bedrag_max) return false;
  return true;
}

function heeftBedragFilter(r: CategorieRegel): boolean {
  return r.bedrag_min !== null || r.bedrag_max !== null;
}

// Sortering binnen een prioriteitsklasse: rules met bedrag-filter eerst (specifieker),
// daarbinnen smalste bereik eerst (een exacte match wint van een breed bereik),
// daarbinnen langste zoekwoord eerst (huidig gedrag).
function regelSortKey(zoekwoordVeld: 'omschrijving_zoekwoord' | 'naam_zoekwoord') {
  return (a: CategorieRegel, b: CategorieRegel): number => {
    const aHeeftFilter = heeftBedragFilter(a);
    const bHeeftFilter = heeftBedragFilter(b);
    if (aHeeftFilter !== bHeeftFilter) return aHeeftFilter ? -1 : 1;
    if (aHeeftFilter && bHeeftFilter) {
      const aBreedte = (a.bedrag_max ?? Number.POSITIVE_INFINITY) - (a.bedrag_min ?? Number.NEGATIVE_INFINITY);
      const bBreedte = (b.bedrag_max ?? Number.POSITIVE_INFINITY) - (b.bedrag_min ?? Number.NEGATIVE_INFINITY);
      if (aBreedte !== bBreedte) return aBreedte - bBreedte;
    }
    return (b[zoekwoordVeld]?.length ?? 0) - (a[zoekwoordVeld]?.length ?? 0);
  };
}

// ── Matchlogica ───────────────────────────────────────────────────────────────

export function matchCategorie(
  t: Transactie,
  regels: CategorieRegel[]
): CategorieRegel | null {
  const tegenIban   = t.tegenrekening_iban_bban?.trim() ?? null;
  const naamSchoon  = schoonMaken(t.naam_tegenpartij);
  const omschrRaw   = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3]
    .filter(Boolean).join(' ');
  const omschrSchoon = schoonMaken(omschrRaw);

  const van = regels.filter(r => typeMatch(t, r.type) && bedragMatch(t, r));

  // Prioriteit 1: IBAN + omschrijving_zoekwoord (woorden in volgorde, willekeurige tekens ertussen)
  const p1 = van.filter(r =>
    r.iban && r.omschrijving_zoekwoord &&
    r.iban === tegenIban &&
    woordVolgordeMatch(r.omschrijving_zoekwoord, omschrSchoon)
  );
  if (p1.length > 0) return p1.sort(regelSortKey('omschrijving_zoekwoord'))[0];

  // Prioriteit 2: IBAN + naam_zoekwoord (beide matchen, woorden in volgorde)
  const p2 = van.filter(r =>
    r.iban && r.naam_zoekwoord && !r.omschrijving_zoekwoord &&
    r.iban === tegenIban &&
    woordVolgordeMatch(r.naam_zoekwoord, naamSchoon)
  );
  if (p2.length > 0) return p2.sort(regelSortKey('naam_zoekwoord'))[0];

  // Prioriteit 3: naam_zoekwoord (geen iban in de regel, woorden in volgorde) — langste match wint
  const p3 = van.filter(r =>
    r.naam_zoekwoord && !r.iban &&
    woordVolgordeMatch(r.naam_zoekwoord, naamSchoon)
  );
  if (p3.length > 0) return p3.sort(regelSortKey('naam_zoekwoord'))[0];

  // Prioriteit 4: IBAN alleen — laatste redmiddel
  const p4 = van.filter(r =>
    r.iban && !r.naam_zoekwoord && !r.omschrijving_zoekwoord && r.iban === tegenIban
  );
  if (p4.length > 0) return p4.sort(regelSortKey('omschrijving_zoekwoord'))[0];

  // Prioriteit 5: alleen bedrag-filter (geen iban, geen naam, geen omschrijving) — meest generieke fallback
  const p5 = van.filter(r =>
    !r.iban && !r.naam_zoekwoord && !r.omschrijving_zoekwoord && heeftBedragFilter(r)
  );
  if (p5.length > 0) return p5.sort(regelSortKey('omschrijving_zoekwoord'))[0];

  return null;
}

// ── Omboeking-categorisatie ───────────────────────────────────────────────────

export function categoriseerOmboeking(
  t: Transactie,
  budgettenPotjes: { naam: string }[]
): { categorie: string; subcategorie: string } {
  const omschr = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3]
    .filter(Boolean).join(' ').toLowerCase();

  let gevonden: { naam: string } | undefined;
  let vroegstePositie = Infinity;
  for (const bp of budgettenPotjes) {
    const pos = omschr.indexOf(bp.naam.toLowerCase());
    if (pos !== -1 && pos < vroegstePositie) {
      vroegstePositie = pos;
      gevonden = bp;
    }
  }

  return {
    categorie:    'Omboekingen',
    subcategorie: gevonden ? gevonden.naam : 'Overige Posten',
  };
}

// ── Batch-categorisatie ───────────────────────────────────────────────────────

let hermatchBezig = false;
let hermatchPending = false;

export async function categoriseerTransacties(
  importId?: number
): Promise<{ gecategoriseerd: number; ongecategoriseerd: number }> {
  if (hermatchBezig) { hermatchPending = true; return { gecategoriseerd: 0, ongecategoriseerd: 0 }; }
  // Hermatch is afgeleide bulk-state: niet loggen. Bij undo van de bron-wijziging
  // (regel aangemaakt/gewijzigd/verwijderd) wordt categoriseerTransacties opnieuw
  // aangeroepen om de afgeleide staat te herberekenen.
  return zonderLogging(() => doeHermatch(importId));
}

async function doeHermatch(
  importId?: number
): Promise<{ gecategoriseerd: number; ongecategoriseerd: number }> {
  const db = getDb();
  const regels          = db.prepare('SELECT * FROM categorieen').all() as CategorieRegel[];
  const budgettenPotjes = db.prepare('SELECT naam FROM budgetten_potjes').all() as { naam: string }[];
  const instelling      = getInstellingen();
  const omboekingenAuto = instelling.omboekingenAuto;
  const uitzonderingen  = db.prepare('SELECT rekening_a_id, rekening_b_id FROM omboeking_uitzonderingen').all() as { rekening_a_id: number; rekening_b_id: number }[];
  const rekeningenRijen = db.prepare('SELECT id, iban FROM rekeningen').all() as { id: number; iban: string }[];
  const ibanNaarId      = new Map<string, number>(rekeningenRijen.map(r => [r.iban, r.id]));

  function isUitzondering(t: Transactie): boolean {
    const vanId  = ibanNaarId.get(t.iban_bban ?? '');
    const naarId = ibanNaarId.get(t.tegenrekening_iban_bban ?? '');
    if (!vanId || !naarId) return false;
    const a = Math.min(vanId, naarId);
    const b = Math.max(vanId, naarId);
    return uitzonderingen.some(u => u.rekening_a_id === a && u.rekening_b_id === b);
  }

  const transacties     = importId !== undefined
    ? db.prepare(`
        SELECT t.* FROM transacties t
        LEFT JOIN transactie_aanpassingen a ON t.id = a.transactie_id
        WHERE t.import_id = ? AND COALESCE(a.handmatig_gecategoriseerd, 0) = 0 AND COALESCE(a.bevroren, 0) = 0
      `).all(importId) as Transactie[]
    : db.prepare(`
        SELECT t.* FROM transacties t
        LEFT JOIN transactie_aanpassingen a ON t.id = a.transactie_id
        WHERE COALESCE(a.handmatig_gecategoriseerd, 0) = 0 AND COALESCE(a.bevroren, 0) = 0
      `).all() as Transactie[];

  const zorgDatRijBestaat = db.prepare(
    "INSERT OR IGNORE INTO transactie_aanpassingen (transactie_id) VALUES (?)"
  );
  const updTransactie = db.prepare(
    'UPDATE transactie_aanpassingen SET categorie_id = ?, categorie = NULL, subcategorie = NULL, status = ?, toelichting = ? WHERE transactie_id = ? AND COALESCE(handmatig_gecategoriseerd, 0) = 0'
  );
  const updOmboeking = db.prepare(
    'UPDATE transactie_aanpassingen SET categorie_id = NULL, categorie = ?, subcategorie = ?, status = ? WHERE transactie_id = ? AND COALESCE(handmatig_gecategoriseerd, 0) = 0'
  );
  const updLaatsteGebruik = db.prepare(
    "UPDATE categorieen SET laatste_gebruik = date('now') WHERE id = ?"
  );

  let gecategoriseerd = 0;
  let ongecategoriseerd = 0;

  const verwerkChunk = db.transaction((chunk: Transactie[]) => {
    for (const t of chunk) {
      zorgDatRijBestaat.run(t.id);
      if (t.type === 'omboeking-af' || t.type === 'omboeking-bij') {
        const uitzondering        = isUitzondering(t);
        const behandelAlsOmboeking = omboekingenAuto ? !uitzondering : uitzondering;
        if (behandelAlsOmboeking) {
          const match = matchCategorie(t, regels);
          if (match) {
            updTransactie.run(match.id, 'verwerkt', match.toelichting ?? null, t.id);
            updLaatsteGebruik.run(match.id);
          } else {
            const { categorie, subcategorie } = categoriseerOmboeking(t, budgettenPotjes);
            updOmboeking.run(categorie, subcategorie, 'verwerkt', t.id);
          }
          gecategoriseerd++;
        } else {
          const match = matchCategorie(t, regels);
          if (match) {
            updTransactie.run(match.id, 'verwerkt', match.toelichting ?? null, t.id);
            updLaatsteGebruik.run(match.id);
            gecategoriseerd++;
          } else {
            updTransactie.run(null, 'nieuw', null, t.id);
            ongecategoriseerd++;
          }
        }
      } else {
        const match = matchCategorie(t, regels);
        if (match) {
          updTransactie.run(match.id, 'verwerkt', match.toelichting ?? null, t.id);
          updLaatsteGebruik.run(match.id);
          gecategoriseerd++;
        } else {
          updTransactie.run(null, 'nieuw', null, t.id);
          ongecategoriseerd++;
        }
      }
    }
  });

  hermatchBezig = true;
  try {
    const CHUNK = 50;
    for (let i = 0; i < transacties.length; i += CHUNK) {
      verwerkChunk(transacties.slice(i, i + CHUNK));
      if (i + CHUNK < transacties.length) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
  } finally {
    hermatchBezig = false;
  }

  if (hermatchPending) {
    hermatchPending = false;
    return categoriseerTransacties();
  }

  return { gecategoriseerd, ongecategoriseerd };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getCategorieRegels(): CategorieRegel[] {
  return getDb()
    .prepare('SELECT * FROM categorieen ORDER BY categorie, subcategorie, id')
    .all() as CategorieRegel[];
}

/** Distinct categorienamen uit categorie-regels + handmatige aanpassingen. */
export function getUniekeCategorieen(): string[] {
  const rows = getDb().prepare(`
    SELECT DISTINCT categorie FROM categorieen WHERE categorie IS NOT NULL
    UNION
    SELECT DISTINCT COALESCE(c.categorie, a.categorie) AS categorie
    FROM transactie_aanpassingen a
    LEFT JOIN categorieen c ON a.categorie_id = c.id
    WHERE COALESCE(c.categorie, a.categorie) IS NOT NULL
    ORDER BY categorie
  `).all() as { categorie: string }[];
  return rows.map(r => r.categorie);
}

/**
 * Defrost: zet `bevroren = 0` op alle transactie_aanpassingen wier transactie
 * tegen de meegegeven nieuwe regel zou matchen. Bevriezing wordt door de DELETE-
 * route gezet als veiligheidsnet (voorkomt re-categorisatie door stale rules).
 * Een nieuwe regel = expliciete user-intent dat ze opnieuw mogen matchen.
 *
 * Wordt door POST /api/categorieen aangeroepen ná insertCategorieRegel zodat de
 * volgende hermatch (zonderLogging) de nu-toegestane transacties werkelijk
 * categoriseert en `laatste_gebruik` op de regel zet.
 */
export function defrostMatchendeTransacties(regelId: number): number {
  const db = getDb();
  const regel = db.prepare('SELECT * FROM categorieen WHERE id = ?').get(regelId) as CategorieRegel | undefined;
  if (!regel) return 0;
  const bevrorenTrans = db.prepare(`
    SELECT t.* FROM transacties t
    JOIN transactie_aanpassingen a ON t.id = a.transactie_id
    WHERE COALESCE(a.bevroren, 0) = 1 AND COALESCE(a.handmatig_gecategoriseerd, 0) = 0
  `).all() as Transactie[];
  if (bevrorenTrans.length === 0) return 0;
  const upd = db.prepare('UPDATE transactie_aanpassingen SET bevroren = 0 WHERE transactie_id = ?');
  let aantal = 0;
  const tx = db.transaction(() => {
    for (const t of bevrorenTrans) {
      if (matchCategorie(t, [regel])) {
        upd.run(t.id);
        aantal++;
      }
    }
  });
  tx();
  return aantal;
}

export function insertCategorieRegel(data: {
  iban?: string | null;
  naam_origineel?: string | null;
  naam_zoekwoord_raw?: string | null;
  omschrijving_raw?: string | null;
  categorie: string;
  subcategorie?: string | null;
  toelichting?: string | null;
  type?: CategorieType;
  bedrag_min?: number | null;
  bedrag_max?: number | null;
  laatste_gebruik?: string | null;
}): number {
  const naam_zoekwoord         = data.naam_zoekwoord_raw !== undefined
    ? (schoonMakenPerWoord(data.naam_zoekwoord_raw) || null)
    : (schoonMakenPerWoord(data.naam_origineel) || null);
  const omschrijving_zoekwoord = data.omschrijving_raw
    ? (schoonMakenPerWoord(data.omschrijving_raw) || null)
    : null;
  const bedragMin = data.bedrag_min ?? null;
  const bedragMax = data.bedrag_max ?? null;
  if (bedragMin !== null && bedragMax !== null && bedragMin > bedragMax) {
    throw new Error('bedrag_min mag niet groter zijn dan bedrag_max.');
  }

  const db = getDb();
  const type = data.type ?? 'alle';

  const bestaand = db
    .prepare('SELECT id FROM categorieen WHERE iban IS ? AND naam_zoekwoord IS ? AND omschrijving_zoekwoord IS ? AND type = ? AND bedrag_min IS ? AND bedrag_max IS ? LIMIT 1')
    .get(data.iban ?? null, naam_zoekwoord, omschrijving_zoekwoord, type, bedragMin, bedragMax) as { id: number } | undefined;
  if (bestaand) {
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (data.toelichting !== undefined) { updates.push('toelichting = ?'); vals.push(data.toelichting ?? null); }
    if (data.laatste_gebruik !== undefined) { updates.push('laatste_gebruik = ?'); vals.push(data.laatste_gebruik ?? null); }
    if (updates.length > 0) db.prepare(`UPDATE categorieen SET ${updates.join(', ')} WHERE id = ?`).run(...vals, bestaand.id);
    return bestaand.id;
  }

  const result = db
    .prepare(`
      INSERT INTO categorieen
        (iban, naam_zoekwoord, naam_origineel, omschrijving_zoekwoord,
         categorie, subcategorie, toelichting, type, bedrag_min, bedrag_max, laatste_gebruik)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.iban ?? null,
      naam_zoekwoord,
      data.naam_origineel ?? null,
      omschrijving_zoekwoord,
      data.categorie,
      data.subcategorie ?? null,
      data.toelichting ?? null,
      type,
      bedragMin,
      bedragMax,
      data.laatste_gebruik ?? null
    );

  return result.lastInsertRowid as number;
}

export function updateCategorieRegel(
  id: number,
  data: {
    iban?: string | null;
    naam_origineel?: string | null;
    naam_zoekwoord_raw?: string | null;
    omschrijving_raw?: string | null;
    categorie?: string;
    subcategorie?: string | null;
    toelichting?: string | null;
    type?: CategorieType;
    bedrag_min?: number | null;
    bedrag_max?: number | null;
  }
): void {
  const db = getDb();
  const bestaand = db.prepare('SELECT naam_zoekwoord, omschrijving_zoekwoord, bedrag_min, bedrag_max FROM categorieen WHERE id = ?').get(id) as
    { naam_zoekwoord: string | null; omschrijving_zoekwoord: string | null; bedrag_min: number | null; bedrag_max: number | null } | undefined;

  const naam_zoekwoord = data.naam_zoekwoord_raw !== undefined
    ? (schoonMakenPerWoord(data.naam_zoekwoord_raw) || schoonMakenPerWoord(data.naam_origineel) || null)
    : data.naam_origineel !== undefined
      ? (schoonMakenPerWoord(data.naam_origineel) || null)
      : (bestaand?.naam_zoekwoord ?? null);

  const omschrijving_zoekwoord = data.omschrijving_raw !== undefined
    ? (data.omschrijving_raw
        ? (schoonMakenPerWoord(data.omschrijving_raw) || null)
        : null)
    : (bestaand?.omschrijving_zoekwoord ?? null);

  const bedragMin = data.bedrag_min !== undefined ? data.bedrag_min : (bestaand?.bedrag_min ?? null);
  const bedragMax = data.bedrag_max !== undefined ? data.bedrag_max : (bestaand?.bedrag_max ?? null);
  if (bedragMin !== null && bedragMax !== null && bedragMin > bedragMax) {
    throw new Error('bedrag_min mag niet groter zijn dan bedrag_max.');
  }

  db.prepare(`
      UPDATE categorieen SET
        iban = ?, naam_zoekwoord = ?, naam_origineel = ?,
        omschrijving_zoekwoord = ?, categorie = ?, subcategorie = ?,
        toelichting = ?, type = ?, bedrag_min = ?, bedrag_max = ?
      WHERE id = ?
    `)
    .run(
      data.iban ?? null,
      naam_zoekwoord,
      data.naam_origineel ?? null,
      omschrijving_zoekwoord,
      data.categorie,
      data.subcategorie ?? null,
      data.toelichting !== undefined ? (data.toelichting ?? null) : null,
      data.type ?? 'alle',
      bedragMin,
      bedragMax,
      id
    );
}

export function updateNaamOrigineel(id: number, naam: string): void {
  const db = getDb();
  const schoon = schoonMakenPerWoord(naam) || null;
  db.prepare('UPDATE categorieen SET naam_origineel = ?, naam_zoekwoord = COALESCE(naam_zoekwoord, ?) WHERE id = ?')
    .run(naam.trim() || null, schoon, id);
}

export function deleteCategorieRegel(id: number): void {
  const db = getDb();
  db.prepare('UPDATE transactie_aanpassingen SET categorie_id = NULL WHERE categorie_id = ?').run(id);
  db.prepare('DELETE FROM categorieen WHERE id = ?').run(id);
}

/**
 * Auto-archiveer aangepaste categorisaties waarvan de transactiedatum ouder is
 * dan `maanden` maanden. `handmatig_gecategoriseerd=1` + niet al gearchiveerd.
 * Gebruikt datum_aanpassing als die gezet is, anders de originele transactiedatum.
 */
export function autoArchiveerOudeAangepast(maanden: number): number {
  if (maanden <= 0) return 0;
  const db = getDb();
  const grens = new Date();
  grens.setMonth(grens.getMonth() - maanden);
  const grensISO = grens.toISOString().slice(0, 10);
  const info = db.prepare(`
    UPDATE transactie_aanpassingen
    SET gearchiveerd = 1
    WHERE gearchiveerd = 0
      AND handmatig_gecategoriseerd = 1
      AND transactie_id IN (
        SELECT t.id FROM transacties t
        LEFT JOIN transactie_aanpassingen a ON a.transactie_id = t.id
        WHERE COALESCE(a.datum_aanpassing, t.datum) < ?
      )
  `).run(grensISO);
  return info.changes;
}

/**
 * Verwijder regels die sinds `maanden` niet gebruikt zijn en bevries hun auto-gematchte
 * transacties (bevroren=1, categorie_id=NULL, tekst behouden).
 * Returnt het aantal verwijderde regels.
 */
export function autoVerwijderVervaldeRegels(maanden: number): number {
  if (maanden <= 0) return 0;
  const db = getDb();
  const grens = new Date();
  grens.setMonth(grens.getMonth() - maanden);
  const grensISO = grens.toISOString().slice(0, 10);
  const teVerwijderen = db.prepare(`
    SELECT id FROM categorieen
    WHERE (laatste_gebruik IS NULL OR laatste_gebruik < ?)
  `).all(grensISO) as { id: number }[];
  if (teVerwijderen.length === 0) return 0;
  const ids = teVerwijderen.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE transactie_aanpassingen SET bevroren = 1, categorie_id = NULL WHERE categorie_id IN (${placeholders}) AND COALESCE(handmatig_gecategoriseerd, 0) = 0`).run(...ids);
  db.prepare(`UPDATE transactie_aanpassingen SET categorie_id = NULL WHERE categorie_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM categorieen WHERE id IN (${placeholders})`).run(...ids);
  return ids.length;
}
