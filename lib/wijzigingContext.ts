// Server-side actie-context voor het wijziging_log systeem.
//
// Elke API-request die de DB muteert hoort een context te zetten met:
// - actieId:     uniek per user-actie (gegroepeerd door X-Actie-Id header)
// - type:        korte categorie ('transactie', 'categorisatie', 'instelling', ...)
// - beschrijving: één regel die de gebruiker terugziet in het activiteitenlog
//
// De SQL-triggers op gemonitorde tabellen lezen deze waarden via UDFs
// (huidige_actie_id() etc., geregistreerd in lib/db.ts) en kopiëren ze naar
// elke wijziging_log entry.
//
// AsyncLocalStorage zorgt voor per-request isolatie: tussen await-punten kan
// een andere request actief worden zonder onze context te overschrijven.

import { AsyncLocalStorage } from 'node:async_hooks';

export type ActieContext = {
  actieId: string;
  type: string;
  beschrijving: string;
  /**
   * Wanneer false, controleren de capture-triggers via log_actief() en slaan
   * elke INSERT/UPDATE/DELETE over. Bedoeld voor afgeleide bulk-operaties
   * (zoals hermatch in lib/categorisatie.ts) waarvan de uitkomst altijd opnieuw
   * berekend kan worden uit de bron-wijziging — geen waarde om die fallout
   * individueel te kunnen herstellen.
   */
  loggingActief: boolean;
};

const FALLBACK: ActieContext = {
  actieId: 'systeem', type: 'systeem', beschrijving: '', loggingActief: true,
};

// Singleton via globalThis: voorkomt dat Next.js dev (HMR / dual compilation)
// twee verschillende AsyncLocalStorage-instances aanmaakt. Context gezet in
// instance A zou anders niet zichtbaar zijn voor de UDFs die in instance B
// gelezen worden — dezelfde reden waarom getDb() via globalThis._db loopt.
declare global {
  // eslint-disable-next-line no-var
  var _wijzigingAls: AsyncLocalStorage<ActieContext> | undefined;
}
const als: AsyncLocalStorage<ActieContext> =
  globalThis._wijzigingAls ?? (globalThis._wijzigingAls = new AsyncLocalStorage<ActieContext>());

/** Run fn within a context. Triggers tijdens fn zien die context via de UDFs. */
export function metActieContext<T>(meta: Partial<ActieContext>, fn: () => T): T {
  const huidig = leesActieContext();
  const ctx: ActieContext = {
    actieId: meta.actieId ?? huidig.actieId,
    type: meta.type ?? huidig.type,
    beschrijving: meta.beschrijving ?? huidig.beschrijving,
    loggingActief: meta.loggingActief ?? huidig.loggingActief,
  };
  return als.run(ctx, fn);
}

/**
 * Schakelt logging uit binnen fn. Geneste calls erven dezelfde uitschakeling.
 * Gebruik voor afgeleide bulk-flows (hermatch, automatische herberekening) die
 * triggerd worden door een eerdere echte wijziging — die enkele bron-wijziging
 * blijft loggen, de fallout niet.
 */
export function zonderLogging<T>(fn: () => T): T {
  const huidig = leesActieContext();
  return als.run({ ...huidig, loggingActief: false }, fn);
}

/** Lees de huidige context — gebruikt door de UDFs in lib/db.ts. */
export function leesActieContext(): ActieContext {
  return als.getStore() ?? FALLBACK;
}
