// Server-side helper voor het wijziging_log-systeem.
//
// Wikkelt een API-route-handler in een actie-context zodat de capture-triggers
// op gemonitorde tabellen (zie lib/migrations.ts → herbouwWijzigingTriggers)
// elke INSERT/UPDATE/DELETE automatisch loggen met actie_id, type en
// beschrijving van de huidige request.
//
// Gebruik:
//   export async function POST(req: NextRequest) {
//     return metWijziging({ type: 'transactie', beschrijving: 'Bedrag aangepast' }, () => {
//       // ... db.prepare(...).run(...) calls hier — triggers loggen automatisch ...
//       return NextResponse.json({ success: true });
//     });
//   }
//
// De x-actie-id header (gezet door de client-side metActie() wrapper in
// lib/actie.ts) wordt gelezen om opvolgende API-calls binnen één user-actie
// te groeperen onder hetzelfde actie_id — handig voor "deze hele actie ongedaan"
// in het herstel-UI.

import { headers as nextHeaders } from 'next/headers';
import { metActieContext } from './wijzigingContext';
import { triggerDiffDump } from './diff';

type WijzigingMeta = { type: string; beschrijving: string };

export async function metWijziging<T>(
  meta: WijzigingMeta,
  fn: () => T | Promise<T>,
): Promise<T> {
  let actieId = 'systeem';
  try {
    const h = await nextHeaders();
    actieId = h.get('x-actie-id') ?? actieId;
  } catch { /* niet in request-context (bv. CLI-script) */ }
  const resultaat = await (metActieContext(
    { actieId, type: meta.type, beschrijving: meta.beschrijving },
    fn,
  ) as T | Promise<T>);
  // Differential dump (F5): schrijft `wlog_<vandaag>.ndjson.gz` met de
  // entries van vandaag. triggerDiffDump zorgt ook voor het anker van
  // vandaag — vangt middernacht-rollover binnen lopende sessie.
  triggerDiffDump();
  return resultaat;
}
