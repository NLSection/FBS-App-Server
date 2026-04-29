// FILE: route.ts (api/categorieen)
// AANGEMAAKT: 25-03-2026 17:30
// VERSIE: 1
// GEWIJZIGD: 02-04-2026 10:00
//
// WIJZIGINGEN (31-03-2026 11:00):
// - POST toelichting: null in body doorgestuurd als null (was undefined bij typeof-check op null)
// WIJZIGINGEN (30-03-2026 21:00):
// - POST: toelichting doorgestuurd naar insertCategorieRegel
// WIJZIGINGEN (28-03-2026 14:00):
// - POST: naam_zoekwoord_raw doorgestuurd naar insertCategorieRegel
// WIJZIGINGEN (02-04-2026 10:00):
// - triggerBackup({ type: 'categorie', beschrijving: '' }) aangeroepen na succesvolle POST

import { NextRequest, NextResponse } from 'next/server';
import { insertSubcategorie } from '@/lib/subcategorieen';
import { getCategorieRegels, insertCategorieRegel, defrostMatchendeTransacties } from '@/lib/categorisatie';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    return NextResponse.json(getCategorieRegels());
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const { iban, naam_origineel, naam_zoekwoord_raw, omschrijving_raw, categorie, subcategorie, toelichting, type, bedrag_min, bedrag_max, laatste_gebruik } = body;

  if (!categorie || typeof categorie !== 'string') {
    return NextResponse.json({ error: 'categorie is verplicht.' }, { status: 400 });
  }

  const subLabel = typeof subcategorie === 'string' && subcategorie ? ` › ${subcategorie}` : '';
  const zoekLabel = typeof naam_zoekwoord_raw === 'string' && naam_zoekwoord_raw ? ` (zoekwoord: ${naam_zoekwoord_raw})` : '';

  return metWijziging(
    { type: 'categorie', beschrijving: `Regel aangemaakt: ${categorie}${subLabel}${zoekLabel}` },
    () => {
      try {
        const id = insertCategorieRegel({
          iban:              typeof iban === 'string'              ? iban              : null,
          naam_origineel:    typeof naam_origineel === 'string'    ? naam_origineel    : null,
          naam_zoekwoord_raw:typeof naam_zoekwoord_raw === 'string'? naam_zoekwoord_raw: undefined,
          omschrijving_raw:  typeof omschrijving_raw === 'string'  ? omschrijving_raw  : null,
          categorie,
          subcategorie:      typeof subcategorie === 'string'      ? subcategorie      : null,
          toelichting:       'toelichting' in body ? (typeof toelichting === 'string' ? toelichting || null : null) : undefined,
          type:              typeof type === 'string'               ? type as never     : 'alle',
          bedrag_min:        typeof bedrag_min === 'number'         ? bedrag_min        : null,
          bedrag_max:        typeof bedrag_max === 'number'         ? bedrag_max        : null,
          laatste_gebruik:   typeof laatste_gebruik === 'string'    ? laatste_gebruik   : undefined,
        });
        if (typeof subcategorie === 'string' && subcategorie.trim()) {
          try { insertSubcategorie(categorie as string, subcategorie as string); } catch { /* bestaat al */ }
        }
        // Bevroren transacties defrosten als ze tegen de nieuwe regel matchen.
        // Een rule-create is expliciete user-intent — bevriezing (gezet door
        // DELETE op een eerdere regel) mag dan opgeheven worden zodat de
        // volgende hermatch ze kan categoriseren en laatste_gebruik kan zetten.
        try { defrostMatchendeTransacties(id); } catch { /* niet kritiek */ }
        // Geen impliciete categoriseerTransacties hier — callers triggeren hermatch
        // expliciet via /api/categoriseer. Dubbele aanroep veroorzaakt een race via
        // hermatchBezig/hermatchPending waarbij de client-request direct met 0/0
        // terugkeert en de reload de stale staat toont.
        return NextResponse.json({ id }, { status: 201 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
