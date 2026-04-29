// FILE: parseCSV.ts
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 26-03-2026 18:00
//
// WIJZIGINGEN (25-03-2026 10:30):
// - Initiële aanmaak: Rabobank CSV parser met decimaal-normalisatie en BOM-strip
// WIJZIGINGEN (26-03-2026 18:00):
// - Kolomnaam 'Volgnummer' gecorrigeerd naar 'Volgnr' (Rabobank CSV-header)

import type { Transactie } from '@/lib/schema';

export type RuweTransactie = Omit<Transactie, 'id' | 'import_id' | 'type' | 'status' | 'categorie_id'>;

// Map van Rabobank kolomnaam → Transactie veldnaam
const KOLOM_MAP: Record<string, keyof RuweTransactie> = {
  'IBAN/BBAN':                    'iban_bban',
  'Munt':                         'munt',
  'BIC':                          'bic',
  'Volgnr':                       'volgnummer',
  'Datum':                        'datum',
  'Rentedatum':                   'rentedatum',
  'Bedrag':                       'bedrag',
  'Saldo na trn':                 'saldo_na_trn',
  'Tegenrekening IBAN/BBAN':      'tegenrekening_iban_bban',
  'Naam tegenpartij':             'naam_tegenpartij',
  'Naam uiteindelijke partij':    'naam_uiteindelijke_partij',
  'Naam initierende partij':      'naam_initierende_partij',
  'BIC tegenpartij':              'bic_tegenpartij',
  'Code':                         'code',
  'Batch ID':                     'batch_id',
  'Transactiereferentie':         'transactiereferentie',
  'Machtigingskenmerk':           'machtigingskenmerk',
  'Incassant ID':                 'incassant_id',
  'Betalingskenmerk':             'betalingskenmerk',
  'Omschrijving-1':               'omschrijving_1',
  'Omschrijving-2':               'omschrijving_2',
  'Omschrijving-3':               'omschrijving_3',
  'Reden retour':                 'reden_retour',
  'Oorspr bedrag':                'oorspr_bedrag',
  'Oorspr munt':                  'oorspr_munt',
  'Koers':                        'koers',
};

const NUMERIEKE_VELDEN = new Set<keyof RuweTransactie>([
  'bedrag', 'saldo_na_trn', 'oorspr_bedrag', 'koers',
]);

// Rabobank gebruikt komma als decimaalteken en punt als duizendtal-separator
function parseBedrag(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(normalized);
  return isNaN(val) ? null : val;
}

// CSV-parser die geciteerde velden respecteert (inclusief "" escaping)
function splitRij(rij: string): string[] {
  const velden: string[] = [];
  let huidig = '';
  let inCitaat = false;
  let i = 0;

  while (i < rij.length) {
    const char = rij[i];
    if (char === '"') {
      if (inCitaat && rij[i + 1] === '"') {
        huidig += '"';
        i += 2;
        continue;
      }
      inCitaat = !inCitaat;
    } else if (char === ',' && !inCitaat) {
      velden.push(huidig);
      huidig = '';
    } else {
      huidig += char;
    }
    i++;
  }
  velden.push(huidig);
  return velden;
}

export function parseCSV(csvTekst: string): RuweTransactie[] {
  // BOM verwijderen indien aanwezig
  const tekst = csvTekst.startsWith('\uFEFF') ? csvTekst.slice(1) : csvTekst;
  const regels = tekst.split('\n').map(r => r.trimEnd()).filter(r => r.length > 0);

  if (regels.length < 2) return [];

  const headers = splitRij(regels[0]);
  const resultaten: RuweTransactie[] = [];

  for (let i = 1; i < regels.length; i++) {
    const waarden = splitRij(regels[i]);
    const rij: Partial<RuweTransactie> = {};

    headers.forEach((header, idx) => {
      const veld = KOLOM_MAP[header];
      if (!veld) return;
      const raw = waarden[idx] ?? '';
      if (NUMERIEKE_VELDEN.has(veld)) {
        (rij as Record<string, unknown>)[veld] = parseBedrag(raw);
      } else {
        (rij as Record<string, unknown>)[veld] = raw === '' ? null : raw;
      }
    });

    resultaten.push(rij as RuweTransactie);
  }

  return resultaten;
}
