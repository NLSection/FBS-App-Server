import { NextResponse } from 'next/server';

type Health = { ok?: boolean; app?: string; schemaVersion?: number };

export async function POST(req: Request) {
  let url: string | undefined;
  try {
    const body = (await req.json()) as { url?: string };
    url = body.url?.trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ ok: false, error: 'url_required' }, { status: 400 });
  }
  const base = url.replace(/\/+$/, '');
  const target = `${base}/api/health`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(target, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `http_${r.status}` }, { status: 200 });
    }
    const data = (await r.json()) as Health;
    if (data.app !== 'fbs') {
      return NextResponse.json({ ok: false, error: 'not_fbs_server' }, { status: 200 });
    }
    return NextResponse.json({ ok: true, app: data.app, schemaVersion: data.schemaVersion ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  } finally {
    clearTimeout(t);
  }
}
