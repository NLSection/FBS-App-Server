// FILE: budgettenPotjes.ts
// AANGEMAAKT: 25-03-2026 19:30
// VERSIE: 1
// GEWIJZIGD: 30-03-2026 16:00
//
// WIJZIGINGEN (30-03-2026 00:00):
// - Zacht kleurenpalet met 12 kleuren; auto-kleur kiest maximale hue-afstand t.o.v. bestaande kleuren
//
// WIJZIGINGEN (28-03-2026 00:00):
// - type veld verwijderd uit interface, insertBudgetPotje en updateBudgetPotje
// WIJZIGINGEN (30-03-2026 16:00):
// - rekening_id (single) vervangen door rekening_ids (many-to-many via koppeltabel)
// - getBudgettenPotjes: joins met budgetten_potjes_rekeningen
// - updateBudgetPotje/insertBudgetPotje: beheren koppeltabel

import getDb from '@/lib/db';

export interface BudgetPotje {
  id: number;
  naam: string;
  rekening_ids: number[];
  beschermd: number;
  kleur: string | null;
  kleur_auto: number;
}

// Zacht palette met goed verspreide hue-waarden (HSL ~60-70% sat, ~72% light)
const KLEUR_PALETTE = [
  '#7ca0f4', // blauw
  '#a78bfa', // lavendel
  '#f4a7b9', // roze
  '#f4b77c', // warm oranje
  '#7cdba8', // mint
  '#e4a0f4', // lila
  '#8bd4f4', // hemelsblauw
  '#f4d87c', // zachtgeel
  '#a7f4cb', // lichtgroen
  '#f49dad', // koraal
  '#b8a7f4', // violet
  '#7cf4e4', // turquoise
];

function hexNaarHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function kleurAfstand(hex1: string, hex2: string): number {
  const [h1] = hexNaarHsl(hex1);
  const [h2] = hexNaarHsl(hex2);
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

function volgendePaletKleur(db: ReturnType<typeof getDb>): string {
  const bestaand = (db.prepare('SELECT kleur FROM budgetten_potjes WHERE kleur IS NOT NULL').all() as { kleur: string }[])
    .map(r => r.kleur);
  if (bestaand.length === 0) return KLEUR_PALETTE[0];
  let besteKleur = KLEUR_PALETTE[0];
  let besteAfstand = 0;
  for (const kandidaat of KLEUR_PALETTE) {
    const minAfstand = Math.min(...bestaand.map(b => kleurAfstand(kandidaat, b)));
    if (minAfstand > besteAfstand) {
      besteAfstand = minAfstand;
      besteKleur = kandidaat;
    }
  }
  return besteKleur;
}

export function getBudgettenPotjes(): BudgetPotje[] {
  const db = getDb();
  const items = db.prepare(
    'SELECT id, naam, beschermd, kleur, kleur_auto FROM budgetten_potjes ORDER BY beschermd DESC, id ASC'
  ).all() as Omit<BudgetPotje, 'rekening_ids'>[];

  const koppelingen = db.prepare(
    'SELECT potje_id, rekening_id FROM budgetten_potjes_rekeningen'
  ).all() as { potje_id: number; rekening_id: number }[];

  const koppelingMap = new Map<number, number[]>();
  for (const k of koppelingen) {
    if (!koppelingMap.has(k.potje_id)) koppelingMap.set(k.potje_id, []);
    koppelingMap.get(k.potje_id)!.push(k.rekening_id);
  }

  return items.map(item => ({
    ...item,
    rekening_ids: koppelingMap.get(item.id) ?? [],
  }));
}

function setRekeningKoppelingen(db: ReturnType<typeof getDb>, potjeId: number, rekeningIds: number[]): void {
  db.prepare('DELETE FROM budgetten_potjes_rekeningen WHERE potje_id = ?').run(potjeId);
  const ins = db.prepare('INSERT OR IGNORE INTO budgetten_potjes_rekeningen (potje_id, rekening_id) VALUES (?, ?)');
  for (const rId of rekeningIds) {
    ins.run(potjeId, rId);
  }
}

export function ensureBudgetPotje(naam: string): void {
  const trimmed = naam.trim();
  if (!trimmed) return;
  const db = getDb();
  const bestaat = db.prepare('SELECT 1 FROM budgetten_potjes WHERE naam = ?').get(trimmed);
  if (bestaat) return;
  insertBudgetPotje(trimmed, [], null);
}

export function insertBudgetPotje(naam: string, rekening_ids: number[], kleur?: string | null, kleurAuto?: number): number {
  const db = getDb();
  const k = kleur ?? volgendePaletKleur(db);
  const result = db.prepare("INSERT INTO budgetten_potjes (naam, type, kleur, kleur_auto) VALUES (?, 'potje', ?, ?)").run(naam, k, kleurAuto ?? 1);
  const id = result.lastInsertRowid as number;
  db.transaction(() => setRekeningKoppelingen(db, id, rekening_ids))();
  return id;
}

export function getBudgetPotje(id: number): BudgetPotje | undefined {
  return getBudgettenPotjes().find(p => p.id === id);
}

export function updateBudgetPotje(
  id: number,
  naam: string | null,
  rekening_ids: number[],
  kleur: string | null,
  kleurAuto?: number,
): void {
  const db = getDb();
  const rij = db
    .prepare('SELECT beschermd FROM budgetten_potjes WHERE id = ?')
    .get(id) as { beschermd: number } | undefined;
  if (!rij) throw new Error('Categorie niet gevonden.');

  db.transaction(() => {
    const ka = kleurAuto ?? 1;
    if (rij.beschermd) {
      db.prepare('UPDATE budgetten_potjes SET kleur = ?, kleur_auto = ? WHERE id = ?').run(kleur, ka, id);
    } else {
      if (!naam?.trim()) throw new Error('Naam mag niet leeg zijn.');
      const oudeNaam = (db.prepare('SELECT naam FROM budgetten_potjes WHERE id = ?').get(id) as { naam: string }).naam;
      const nieuweNaam = naam.trim();
      db.prepare('UPDATE budgetten_potjes SET naam = ?, kleur = ?, kleur_auto = ? WHERE id = ?').run(nieuweNaam, kleur, ka, id);
      if (oudeNaam !== nieuweNaam) {
        db.prepare('UPDATE categorieen SET categorie = ? WHERE categorie = ?').run(nieuweNaam, oudeNaam);
        db.prepare('UPDATE transactie_aanpassingen SET categorie = ? WHERE categorie = ?').run(nieuweNaam, oudeNaam);
      }
    }
    setRekeningKoppelingen(db, id, rekening_ids);
  })();
}

export function getCategorieGebruik(naam: string): { regels: number; aanpassingen: number; subcategorieen: number } {
  const db = getDb();
  const regels       = (db.prepare('SELECT COUNT(*) AS n FROM categorieen WHERE categorie = ?').get(naam) as { n: number }).n;
  const aanpassingen = (db.prepare('SELECT COUNT(*) AS n FROM transactie_aanpassingen WHERE categorie = ?').get(naam) as { n: number }).n;
  const subcategorieen = (db.prepare('SELECT COUNT(*) AS n FROM subcategorieen WHERE categorie = ?').get(naam) as { n: number }).n;
  return { regels, aanpassingen, subcategorieen };
}

export function deleteBudgetPotje(id: number): void {
  const db = getDb();
  const rij = db
    .prepare('SELECT beschermd, naam FROM budgetten_potjes WHERE id = ?')
    .get(id) as { beschermd: number; naam: string } | undefined;
  if (!rij) throw new Error('Categorie niet gevonden.');
  if (rij.beschermd) throw new Error('Dit item is beschermd en kan niet worden verwijderd.');
  const gebruik = getCategorieGebruik(rij.naam);
  if (gebruik.regels > 0 || gebruik.aanpassingen > 0 || gebruik.subcategorieen > 0) {
    const err = new Error('Categorie wordt nog gebruikt.') as Error & { code?: string; gebruik?: typeof gebruik };
    err.code = 'IN_USE';
    err.gebruik = gebruik;
    throw err;
  }
  db.prepare('DELETE FROM budgetten_potjes WHERE id = ?').run(id);
}
