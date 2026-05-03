// FILE: route.ts (api/dashboard/cat/transacties)
// AANGEMAAKT: 03-04-2026 22:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 18:00
//
// WIJZIGINGEN (03-04-2026 18:00):
// - Extra velden voor CategoriePopup en contextmenu (categorie_id, toelichting, omschrijving_1/2/3, etc.)

import { NextRequest, NextResponse } from 'next/server';
import { getTransacties } from '@/lib/transacties';
import { getRekeningGroep } from '@/lib/rekeningGroepen';
import { getRekeningen } from '@/lib/rekeningen';

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const categorie   = params.get('categorie');
  const subcategorie = params.get('subcategorie') ?? '';
  const van = params.get('van') ?? undefined;
  const tot = params.get('tot') ?? undefined;
  const groepIdStr    = params.get('groep_id');
  const rekeningIdStr = params.get('rekening_id');

  if (!categorie) return NextResponse.json({ error: 'categorie is verplicht.' }, { status: 400 });

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (van && !ISO_DATE.test(van)) return NextResponse.json({ error: 'van moet YYYY-MM-DD formaat hebben.' }, { status: 400 });
  if (tot && !ISO_DATE.test(tot)) return NextResponse.json({ error: 'tot moet YYYY-MM-DD formaat hebben.' }, { status: 400 });

  try {
    const transacties = getTransacties({ datum_van: van, datum_tot: tot, categorie });

    let groepIbans: Set<string> | null = null;
    if (groepIdStr) {
      const groep = getRekeningGroep(Number(groepIdStr));
      groepIbans = groep
        ? new Set(getRekeningen().filter(r => groep.rekening_ids.includes(r.id)).map(r => r.iban))
        : null;
    } else if (rekeningIdStr) {
      const rek = getRekeningen().find(r => r.id === Number(rekeningIdStr));
      groepIbans = rek ? new Set([rek.iban]) : null;
    }

    const gefilterd = transacties.filter(t => {
      // Omboekingen alleen skippen als ze de default 'Omboekingen'-categorie hebben.
      if ((t.type === 'omboeking-af' || t.type === 'omboeking-bij') && t.categorie === 'Omboekingen') return false;
      if (groepIbans && (!t.iban_bban || !groepIbans.has(t.iban_bban))) return false;
      if (subcategorie !== '') return (t.subcategorie ?? '') === subcategorie;
      return true;
    });

    // Sorteer: datum DESC (nieuwste eerst), dan volgnummer ASC binnen dezelfde datum
    gefilterd.sort((a, b) => {
      const ad = a.datum_aanpassing ?? a.datum ?? '';
      const bd = b.datum_aanpassing ?? b.datum ?? '';
      if (ad !== bd) return bd.localeCompare(ad);
      return (parseInt(a.volgnummer ?? '0', 10) || 0) - (parseInt(b.volgnummer ?? '0', 10) || 0);
    });

    return NextResponse.json(gefilterd.map(t => ({
      id:              t.id,
      datum:           t.datum_aanpassing ?? t.datum,
      originele_datum: t.datum_aanpassing ? (t.datum ?? null) : null,
      naam_tegenpartij: t.naam_tegenpartij,
      omschrijving:    [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' '),
      bedrag:          t.bedrag,
      rekening_naam:   t.rekening_naam,
      categorie_id:    t.categorie_id,
      categorie:       t.categorie,
      subcategorie:    t.subcategorie,
      toelichting:     t.toelichting,
      type:            t.type,
      tegenrekening_iban_bban: t.tegenrekening_iban_bban,
      omschrijving_1:  t.omschrijving_1,
      omschrijving_2:  t.omschrijving_2,
      omschrijving_3:  t.omschrijving_3,
      handmatig_gecategoriseerd: t.handmatig_gecategoriseerd,
    })));
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
