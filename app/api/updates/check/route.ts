// FILE: route.ts (updates/check)
// AANGEMAAKT: 05-04-2026 01:15
// VERSIE: 2
// GEWIJZIGD: 18-04-2026
//
// WIJZIGINGEN (18-04-2026):
// - Update-kanaal uit instellingen lezen en als ?channel= query meesturen naar Worker.
//   channel=test leest releases uit FBS-App-Test, anders FBS-App-Main.
// WIJZIGINGEN (04-04-2026 22:00):
// - changelog veld doorgeven vanuit Worker response
// WIJZIGINGEN (04-04-2026 21:30):
// - Omgebouwd naar Cloudflare Worker endpoint i.p.v. directe GitHub API

import { NextResponse } from 'next/server';
import { getInstellingen } from '@/lib/instellingen';

const WORKER_BASE = 'https://fbs-update-worker.section-labs.workers.dev/latest';

export async function GET(request: Request) {
  const huidig = process.env.NEXT_PUBLIC_APP_VERSION ?? 'onbekend';
  const url = new URL(request.url);
  const forceer = url.searchParams.get('forceer') === '1';

  let kanaal: 'main' | 'test' | 'uit' = 'main';
  try { kanaal = getInstellingen().updateKanaal; } catch {}

  if (kanaal === 'uit' && !forceer) {
    return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, kanaal });
  }

  // Bij handmatige controle met uit-kanaal → gebruik main endpoint
  const effectief = kanaal === 'uit' ? 'main' : kanaal;
  const workerUrl = effectief === 'test' ? `${WORKER_BASE}?channel=test` : WORKER_BASE;

  try {
    const res = await fetch(workerUrl, { cache: 'no-store', signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, kanaal });
    }

    const data: { versie: string | null; url: string | null; changelog: string | null } = await res.json();

    if (!data.versie) {
      return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, kanaal });
    }

    const nieuwste = data.versie.replace(/^v/, '');
    const huidige = huidig.replace(/^v/, '');
    // Semver-vergelijking: alleen update beschikbaar als nieuwste > huidige (geen downgrade voorstellen).
    const isNieuwer = (a: string, b: string): boolean => {
      const pa = a.split('.').map(n => parseInt(n, 10) || 0);
      const pb = b.split('.').map(n => parseInt(n, 10) || 0);
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const x = pa[i] ?? 0; const y = pb[i] ?? 0;
        if (x > y) return true;
        if (x < y) return false;
      }
      return false;
    };
    const updateBeschikbaar = nieuwste !== '' && isNieuwer(nieuwste, huidige);

    return NextResponse.json({
      huidig: `v${huidige}`,
      nieuwste: `v${nieuwste}`,
      updateBeschikbaar,
      releaseUrl: data.url ?? null,
      changelog: data.changelog ?? null,
      kanaal,
    });
  } catch {
    return NextResponse.json({ huidig, nieuwste: huidig, updateBeschikbaar: false, kanaal });
  }
}
