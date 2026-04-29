import getDb from '@/lib/db';

export interface Subcategorie {
  id: number;
  categorie: string;
  naam: string;
  inGebruik: boolean;
  inActieveRegel: boolean;
}

export function getSubcategorieen(categorie?: string): Subcategorie[] {
  const db = getDb();
  const rijen = categorie
    ? db.prepare('SELECT id, categorie, naam FROM subcategorieen WHERE categorie = ? ORDER BY naam').all(categorie) as Omit<Subcategorie, 'inGebruik' | 'inActieveRegel'>[]
    : db.prepare('SELECT id, categorie, naam FROM subcategorieen ORDER BY categorie, naam').all() as Omit<Subcategorie, 'inGebruik' | 'inActieveRegel'>[];

  if (rijen.length === 0) return [];

  // Batch: haal alle in-gebruik combinaties op in 2 vaste queries i.p.v. N*2
  // inActieveRegel = in minstens één actieve regel OF niet-gearchiveerde aanpassing.
  const inGebruikSet = new Set<string>();
  const inActieveRegelSet = new Set<string>();
  const inRegels = db.prepare(
    "SELECT DISTINCT categorie, subcategorie FROM categorieen WHERE subcategorie IS NOT NULL AND subcategorie != ''"
  ).all() as { categorie: string; subcategorie: string }[];
  for (const r of inRegels) {
    const key = `${r.categorie}::${r.subcategorie}`;
    inGebruikSet.add(key);
    inActieveRegelSet.add(key);
  }
  const inAanpassingen = db.prepare(
    "SELECT DISTINCT categorie, subcategorie, gearchiveerd FROM transactie_aanpassingen WHERE subcategorie IS NOT NULL AND subcategorie != ''"
  ).all() as { categorie: string; subcategorie: string; gearchiveerd: number }[];
  for (const r of inAanpassingen) {
    const key = `${r.categorie}::${r.subcategorie}`;
    inGebruikSet.add(key);
    if (r.gearchiveerd !== 1) inActieveRegelSet.add(key);
  }

  return rijen.map(r => {
    const key = `${r.categorie}::${r.naam}`;
    return {
      ...r,
      inGebruik: inGebruikSet.has(key),
      inActieveRegel: inActieveRegelSet.has(key),
    };
  });
}

function isInGebruik(db: ReturnType<typeof getDb>, categorie: string, naam: string): boolean {
  const inRegels = (db.prepare('SELECT COUNT(*) AS n FROM categorieen WHERE categorie = ? AND subcategorie = ?').get(categorie, naam) as { n: number }).n > 0;
  if (inRegels) return true;
  const inAanpassingen = (db.prepare('SELECT COUNT(*) AS n FROM transactie_aanpassingen WHERE categorie = ? AND subcategorie = ?').get(categorie, naam) as { n: number }).n > 0;
  return inAanpassingen;
}

export function getSubcategorieGebruik(categorie: string, naam: string): number {
  const db = getDb();
  const inRegels = (db.prepare('SELECT COUNT(*) AS n FROM categorieen WHERE categorie = ? AND subcategorie = ?').get(categorie, naam) as { n: number }).n;
  const inAanpassingen = (db.prepare('SELECT COUNT(*) AS n FROM transactie_aanpassingen WHERE categorie = ? AND subcategorie = ?').get(categorie, naam) as { n: number }).n;
  return inRegels + inAanpassingen;
}

export function insertSubcategorie(categorie: string, naam: string): number {
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  if (!categorie.trim()) throw new Error('Categorie mag niet leeg zijn.');
  const result = getDb()
    .prepare('INSERT OR IGNORE INTO subcategorieen (categorie, naam) VALUES (?, ?)')
    .run(categorie.trim(), naam.trim());
  return Number(result.lastInsertRowid);
}

export function updateSubcategorie(id: number, naam: string): void {
  const db = getDb();
  if (!naam.trim()) throw new Error('Naam mag niet leeg zijn.');
  const rij = db.prepare('SELECT categorie, naam FROM subcategorieen WHERE id = ?').get(id) as { categorie: string; naam: string } | undefined;
  if (!rij) throw new Error('Subcategorie niet gevonden.');
  const nieuweNaam = naam.trim();
  if (rij.naam === nieuweNaam) return;
  db.transaction(() => {
    db.prepare('UPDATE subcategorieen SET naam = ? WHERE id = ?').run(nieuweNaam, id);
    db.prepare('UPDATE categorieen SET subcategorie = ? WHERE categorie = ? AND subcategorie = ?').run(nieuweNaam, rij.categorie, rij.naam);
    db.prepare('UPDATE transactie_aanpassingen SET subcategorie = ? WHERE categorie = ? AND subcategorie = ?').run(nieuweNaam, rij.categorie, rij.naam);
  })();
}

export function deleteSubcategorie(id: number): void {
  const db = getDb();
  const rij = db.prepare('SELECT categorie, naam FROM subcategorieen WHERE id = ?').get(id) as { categorie: string; naam: string } | undefined;
  if (!rij) throw new Error('Subcategorie niet gevonden.');
  if (isInGebruik(db, rij.categorie, rij.naam)) {
    throw new Error('Subcategorie is nog in gebruik en kan niet verwijderd worden.');
  }
  db.prepare('DELETE FROM subcategorieen WHERE id = ?').run(id);
}
