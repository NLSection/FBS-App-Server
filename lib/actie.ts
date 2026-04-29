// Action-group coalescing: wikkelt een user-actie (bv. categorisatie) in een
// unieke actie-id die via X-Actie-Id header aan alle fetch-calls binnen die
// actie wordt meegegeven. Server-side coalesceert backups + wijziging_log
// entries onder die id (zie lib/backup.ts en lib/wijziging.ts).
//
// Gebruik:
//   metActie(async () => {
//     await fetch('/api/x', {...});
//     await fetch('/api/y', {...});
//   }, { beschrijving: 'Transactie gecategoriseerd' });
//
// Met een beschrijving toont de UndoSnackbar na succesvolle afronding kort
// een "Ongedaan maken" knop voor deze actie.

let huidigeActieId: string | null = null;
let fetchGepatched = false;

// crypto.randomUUID is pas vanaf Safari 15.4 ondersteund — Big Sur heeft Safari
// 14. Fallback via crypto.getRandomValues (Safari 11+) zodat de actie-ID-flow
// blijft werken op oudere WebKit.
function genereerActieId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40; // versie 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function patchFetch(): void {
  if (fetchGepatched || typeof window === 'undefined') return;
  fetchGepatched = true;
  const origineel = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!huidigeActieId) return origineel(input, init);
    const headers = new Headers(init?.headers);
    if (!headers.has('x-actie-id')) headers.set('x-actie-id', huidigeActieId);
    return origineel(input, { ...init, headers });
  };
}

export type ActieKlaarEvent = { actieId: string; beschrijving: string };
type Listener = (e: ActieKlaarEvent) => void;
const listeners = new Set<Listener>();

export function onActieKlaar(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitActieKlaar(e: ActieKlaarEvent): void {
  for (const fn of listeners) {
    try { fn(e); } catch { /* listener-fouten mogen de actie niet breken */ }
  }
}

export async function metActie<T>(
  fn: () => Promise<T>,
  opts?: { beschrijving?: string },
): Promise<T> {
  patchFetch();
  const vorige = huidigeActieId;
  const id = genereerActieId();
  huidigeActieId = id;
  try {
    const resultaat = await fn();
    if (opts?.beschrijving) {
      emitActieKlaar({ actieId: id, beschrijving: opts.beschrijving });
    }
    return resultaat;
  } finally {
    huidigeActieId = vorige;
  }
}
