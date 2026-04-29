import { NextResponse } from 'next/server';

// Watchtower's /v1/update endpoint blokkeert tijdens de update (pull +
// recreate). Bij succes wordt de FBS-container zelf vervangen, dus de
// response komt überhaupt niet terug. Daarom: fire-and-forget. We wachten
// 2s om snelle config-fouten (auth/connection-refused) op te vangen, en
// returnen daarna 202. De banner-flow doet de polling op /api/health.version.
export async function POST() {
  const deployment = process.env.FBS_SERVER_DEPLOYMENT ?? null;
  const watchtowerUrl = process.env.FBS_WATCHTOWER_URL;
  const watchtowerToken = process.env.FBS_WATCHTOWER_TOKEN;

  if (deployment !== 'docker') {
    return NextResponse.json({ ok: false, error: 'not_docker_deployment' }, { status: 501 });
  }
  if (!watchtowerUrl || !watchtowerToken) {
    return NextResponse.json({ ok: false, error: 'watchtower_not_configured' }, { status: 500 });
  }

  const fetchPromise = fetch(`${watchtowerUrl.replace(/\/+$/, '')}/v1/update`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchtowerToken}` },
    signal: AbortSignal.timeout(90000),
  });
  fetchPromise.catch(() => {}); // unhandled rejection voorkomen

  type Settled =
    | { kind: 'response'; r: Response }
    | { kind: 'error'; e: unknown }
    | { kind: 'pending' };

  const settled: Settled = await Promise.race<Settled>([
    fetchPromise.then((r): Settled => ({ kind: 'response', r })).catch((e): Settled => ({ kind: 'error', e })),
    new Promise<Settled>(resolve => setTimeout(() => resolve({ kind: 'pending' }), 2000)),
  ]);

  if (settled.kind === 'error') {
    const msg = settled.e instanceof Error ? settled.e.message : String(settled.e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
  if (settled.kind === 'response' && !settled.r.ok) {
    return NextResponse.json({ ok: false, error: `watchtower_${settled.r.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: 'gestart' }, { status: 202 });
}
