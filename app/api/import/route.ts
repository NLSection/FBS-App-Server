// FILE: route.ts
// AANGEMAAKT: 25-03-2026 10:30
// VERSIE: 1
// GEWIJZIGD: 02-04-2026 10:00
//
// WIJZIGINGEN (25-03-2026 17:30):
// - Initiële aanmaak: POST /api/import — multipart CSV ontvangen, parsen, matchen en opslaan
// - overgeslagen-veld toegevoegd aan response (duplicaten op basis van volgnummer)
// - Auto-categorisatie na import: gecategoriseerd + ongecategoriseerd in response
// WIJZIGINGEN (25-03-2026 18:30):
// - telling bijgewerkt naar nieuw type systeem (normaal-af/bij + omboeking-af/bij)
// WIJZIGINGEN (26-03-2026 11:00):
// - categoriseerTransacties aangeroepen zonder importId zodat ALLE transacties herverwerkt worden
// WIJZIGINGEN (30-03-2026):
// - Detectie onbekende rekeningen vóór opslaan; return { onbekendeRekeningen } bij onbekenden
// WIJZIGINGEN (30-03-2026 16:30):
// - categorie_id → categorie_ids (many-to-many via budgetten_potjes_rekeningen)
// - Optionele form-fields: bevestigdeRekeningen, genegeerdeIbans, permanentGenegeerdeIbans
// - Bevestigde rekeningen worden opgeslagen incl. beheerd-vlag en optionele budgetten_potjes koppeling
// - Genegeerde IBans worden gefilterd uit de import
// WIJZIGINGEN (02-04-2026 10:00):
// - triggerBackup() aangeroepen na succesvolle import

import { NextRequest, NextResponse } from 'next/server';
import { parseCSV } from '@/features/import/utils/parseCSV';
import { matchTransactie } from '@/features/import/utils/matchTransactie';
import { getMatchConfig } from '@/lib/configStore';
import { insertImport, insertTransacties } from '@/lib/imports';
import { categoriseerTransacties } from '@/lib/categorisatie';
import { getRekeningen, insertRekening } from '@/lib/rekeningen';
import getDb from '@/lib/db';
import { metWijziging } from '@/lib/wijziging';
import { kiesAutomatischeKleur } from '@/lib/kleuren';
import { getBudgettenPotjes } from '@/lib/budgettenPotjes';

interface BevestigdeRekening {
  iban: string;
  naam: string;
  type: 'betaal' | 'spaar';
  categorie_ids: number[];
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek — multipart/form-data verwacht.' }, { status: 400 });
  }

  const bestanden = formData.getAll('files') as File[];
  if (bestanden.length === 0) {
    return NextResponse.json({ error: 'Geen bestanden ontvangen.' }, { status: 400 });
  }

  const bestandsnamen = bestanden.map(b => b.name).join(', ');
  return metWijziging(
    { type: 'import', beschrijving: `CSV-import: ${bestandsnamen}` },
    () => importLogic(formData, bestanden),
  );
}

async function importLogic(formData: FormData, bestanden: File[]) {

  // Optionele bevestigingsparams (worden meegegeven bij herhaalde aanroep na modal)
  const bevestigdeRekeningen: BevestigdeRekening[] = JSON.parse(
    (formData.get('bevestigdeRekeningen') as string | null) ?? '[]'
  );
  const genegeerdeIbans: string[] = JSON.parse(
    (formData.get('genegeerdeIbans') as string | null) ?? '[]'
  );
  const permanentGenegeerdeIbans: string[] = JSON.parse(
    (formData.get('permanentGenegeerdeIbans') as string | null) ?? '[]'
  );

  let config;
  try {
    config = getMatchConfig();
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Configuratiefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }

  // Fase 1: Alle bestanden parsen
  const geParste: Array<{ bestand: File; ruweTransacties: ReturnType<typeof parseCSV> }> = [];
  for (const bestand of bestanden) {
    let csvTekst: string;
    try {
      csvTekst = await bestand.text();
    } catch {
      return NextResponse.json({ error: `Bestand '${bestand.name}' kon niet worden gelezen.` }, { status: 400 });
    }
    const ruweTransacties = parseCSV(csvTekst);
    if (ruweTransacties.length === 0) {
      return NextResponse.json(
        { error: `Geen transacties gevonden in '${bestand.name}'. Controleer het bestandsformaat.` },
        { status: 400 }
      );
    }
    geParste.push({ bestand, ruweTransacties });
  }

  // Fase 2: Onbekende rekeningen detecteren
  const db = getDb();
  const bekendeIbans = new Set(
    (db.prepare('SELECT iban FROM rekeningen').all() as { iban: string }[]).map(r => r.iban)
  );
  const genegeerdeDbIbans = new Set(
    (db.prepare('SELECT iban FROM genegeerde_rekeningen').all() as { iban: string }[]).map(r => r.iban)
  );
  const bevestigdeSet  = new Set(bevestigdeRekeningen.map(r => r.iban.trim().toUpperCase()));
  const skipSet        = new Set([...genegeerdeIbans, ...permanentGenegeerdeIbans].map(i => i.trim().toUpperCase()));

  const alleIbans = new Set<string>();
  const eersteTransactiePerIban: Record<string, string | null> = {};
  for (const { ruweTransacties } of geParste) {
    for (const t of ruweTransacties) {
      const iban = t.iban_bban?.trim().toUpperCase();
      if (!iban) continue;
      alleIbans.add(iban);
      if (!eersteTransactiePerIban[iban] && t.naam_tegenpartij) {
        eersteTransactiePerIban[iban] = t.naam_tegenpartij;
      } else if (!(iban in eersteTransactiePerIban)) {
        eersteTransactiePerIban[iban] = null;
      }
    }
  }

  const onbekend = Array.from(alleIbans).filter(
    iban => !bekendeIbans.has(iban) && !genegeerdeDbIbans.has(iban) && !bevestigdeSet.has(iban) && !skipSet.has(iban)
  );

  if (onbekend.length > 0) {
    return NextResponse.json({
      onbekendeRekeningen: onbekend.map(iban => ({
        iban,
        eersteTransactie: eersteTransactiePerIban[iban] ?? null,
      })),
    });
  }

  // Fase 3: Bevestigde rekeningen opslaan
  if (process.env.NODE_ENV !== 'production') console.log(`[import] verwerken ${bevestigdeRekeningen.length} bevestigde rekening(en)`);
  for (const r of bevestigdeRekeningen) {
    try {
      const bestaandeRek = getRekeningen().map(rk => rk.kleur).filter((k): k is string => !!k);
      const catKleuren = getBudgettenPotjes().map(bp => bp.kleur).filter((k): k is string => !!k);
      const kleur = kiesAutomatischeKleur([...bestaandeRek, ...catKleuren]);
      try {
        insertRekening(r.iban, r.naam, r.type, kleur);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          if (process.env.NODE_ENV !== 'production') console.log(`[import] rekening ${r.iban} bestond al, koppelingen worden bijgewerkt`);
        } else {
          throw e;
        }
      }
      const rec = db
        .prepare('SELECT id FROM rekeningen WHERE iban = ?')
        .get(r.iban.trim().toUpperCase()) as { id: number } | undefined;
      if (!rec) {
        throw new Error(`rekening niet teruggevonden na insert: ${r.iban}`);
      }
      for (const catId of r.categorie_ids ?? []) {
        db.prepare('INSERT OR IGNORE INTO budgetten_potjes_rekeningen (potje_id, rekening_id) VALUES (?, ?)').run(catId, rec.id);
      }
      if (process.env.NODE_ENV !== 'production') console.log(`[import] rekening opgeslagen: ${r.iban} (id=${rec.id}, ${r.categorie_ids?.length ?? 0} categorie-koppelingen)`);
    } catch (e) {
      // Niet-UNIQUE fouten propageren als 500 — geen stille corruptie meer
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[import] FATALE fout bij rekening ${r.iban}:`, msg);
      return NextResponse.json({ error: `Kon rekening ${r.iban} niet opslaan: ${msg}` }, { status: 500 });
    }
  }

  // Permanent genegeerde rekeningen opslaan
  for (const iban of permanentGenegeerdeIbans) {
    db.prepare('INSERT OR IGNORE INTO genegeerde_rekeningen (iban) VALUES (?)')
      .run(iban.trim().toUpperCase());
  }

  // Tabs aanmaken voor nieuwe rekeningen — voor elke import (eerste of vervolg).
  // Dashboard_tabs heeft geen UNIQUE-constraint, dus filteren we via SELECT.
  if (bevestigdeRekeningen.length > 0) {
    const alleRekeningen = getRekeningen();

    const bestaandeDashIds = new Set(
      (db.prepare("SELECT entiteit_id FROM dashboard_tabs WHERE type = 'rekening'").all() as { entiteit_id: number }[])
        .map(r => r.entiteit_id)
    );
    const dashStmt = db.prepare('INSERT INTO dashboard_tabs (type, entiteit_id, bls_tonen, cat_tonen, volgorde) VALUES (?, ?, 1, 1, ?)');
    let dashVolgorde = (db.prepare('SELECT COALESCE(MAX(volgorde), -1) AS n FROM dashboard_tabs').get() as { n: number }).n + 1;
    for (const r of alleRekeningen) {
      if (!bestaandeDashIds.has(r.id)) dashStmt.run('rekening', r.id, dashVolgorde++);
    }

    const trxStmt = db.prepare('INSERT OR IGNORE INTO transacties_tabs (type, entiteit_id, volgorde) VALUES (?, ?, ?)');
    let trxVolgorde = (db.prepare('SELECT COALESCE(MAX(volgorde), -1) AS n FROM transacties_tabs').get() as { n: number }).n + 1;
    for (const r of alleRekeningen) {
      trxStmt.run('rekening', r.id, trxVolgorde++);
    }
  }

  // Config herladen na toevoegen bevestigde rekeningen (nieuwe eigen IBANs voor omboeking-detectie)
  if (bevestigdeRekeningen.length > 0) {
    config = getMatchConfig();
  }

  // Fase 4: Import uitvoeren — genegeerde IBans overslaan
  const resultaten = [];
  for (const { bestand, ruweTransacties } of geParste) {
    const gefilterd = ruweTransacties.filter(t => !skipSet.has(t.iban_bban?.trim().toUpperCase() ?? ''));

    if (gefilterd.length === 0) {
      resultaten.push({
        importId: 0,
        aantalNormaalAf: 0, aantalNormaalBij: 0, aantalOmboekingAf: 0, aantalOmboekingBij: 0,
        totaal: ruweTransacties.length, overgeslagen: ruweTransacties.length,
        gecategoriseerd: 0, ongecategoriseerd: 0,
      });
      continue;
    }

    const gematcht = gefilterd.map(t => ({ ...t, type: matchTransactie(t, config) }));

    let importId: number;
    let opgeslagen: number;
    let gecategoriseerd = 0;
    let ongecategoriseerd = 0;
    try {
      importId = insertImport(bestand.name, gefilterd.length);
      opgeslagen = insertTransacties(importId, gematcht);
      ({ gecategoriseerd, ongecategoriseerd } = await categoriseerTransacties());
    } catch (err) {
      const bericht = err instanceof Error ? err.message : 'Databasefout.';
      return NextResponse.json({ error: `Opslaan mislukt: ${bericht}` }, { status: 500 });
    }

    const telling = gematcht.reduce(
      (acc, t) => { acc[t.type]++; return acc; },
      { 'normaal-af': 0, 'normaal-bij': 0, 'omboeking-af': 0, 'omboeking-bij': 0 }
    );

    resultaten.push({
      importId,
      aantalNormaalAf:    telling['normaal-af'],
      aantalNormaalBij:   telling['normaal-bij'],
      aantalOmboekingAf:  telling['omboeking-af'],
      aantalOmboekingBij: telling['omboeking-bij'],
      totaal:             ruweTransacties.length,
      overgeslagen:       ruweTransacties.length - opgeslagen,
      gecategoriseerd,
      ongecategoriseerd,
    });
  }

  // Recentste datum bepalen voor redirect
  let recentsteDatum: string | null = null;
  for (const { ruweTransacties } of geParste) {
    for (const t of ruweTransacties) {
      if (t.datum && (!recentsteDatum || t.datum > recentsteDatum)) recentsteDatum = t.datum;
    }
  }

  return NextResponse.json({ resultaten, recentsteDatum });
}
