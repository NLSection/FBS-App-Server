import { NextResponse } from 'next/server';

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

  try {
    const r = await fetch(`${watchtowerUrl.replace(/\/+$/, '')}/v1/update`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${watchtowerToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `watchtower_${r.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
