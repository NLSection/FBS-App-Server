export type NaamChip = { label: string; waarde: string };

const SPLITTER = /[\s.,/()\[\]{}'"!?:;]+/;
const NORM     = /[^a-z0-9&-]/g;

export function maakNaamChips(naam: string | null): NaamChip[] {
  if (!naam) return [];
  return naam.split(SPLITTER)
    .filter(w => w.length >= 1)
    .map(w => ({ label: w, waarde: w.toLowerCase().replace(NORM, '') }))
    .filter(c => c.waarde.length > 0);
}

export function analyseerOmschrijvingen(t: {
  omschrijving_1?: string | null;
  omschrijving_2?: string | null;
  omschrijving_3?: string | null;
}): NaamChip[] {
  const omschr = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' ');
  if (!omschr) return [];
  return omschr.split(SPLITTER)
    .filter(w => w.length >= 1)
    .map(w => ({ label: w, waarde: w.toLowerCase().replace(NORM, '') }))
    .filter(c => c.waarde.length > 0);
}
