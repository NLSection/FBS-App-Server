import { NextResponse } from 'next/server';
import pkg from '../../../package.json';

const RELEASES_URL = 'https://api.github.com/repos/NLSection/FBS-App-Server/releases/latest';

function isNieuwer(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0; const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function GET() {
  const huidig = (pkg as { version?: string }).version ?? '0.0.0';
  const deployment = process.env.FBS_SERVER_DEPLOYMENT ?? null;

  if (deployment !== 'docker') {
    return NextResponse.json({
      huidig,
      nieuwste: huidig,
      updateBeschikbaar: false,
      ondersteund: false,
      reden: 'not_docker_deployment',
    });
  }

  try {
    const res = await fetch(RELEASES_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, ondersteund: true, reden: `gh_${res.status}` });
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string; body?: string };
    const tag = (data.tag_name ?? '').replace(/^v/, '');
    if (!tag) {
      return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, ondersteund: true, reden: 'no_tag' });
    }
    const updateBeschikbaar = isNieuwer(tag, huidig);
    return NextResponse.json({
      huidig: `v${huidig}`,
      nieuwste: `v${tag}`,
      updateBeschikbaar,
      ondersteund: true,
      releaseUrl: data.html_url ?? null,
      changelog: data.body ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, ondersteund: true, reden: msg });
  }
}
