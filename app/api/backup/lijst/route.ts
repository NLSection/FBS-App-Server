import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { BACKUP_DIR, isExternPadBereikbaar, leesSidecar } from '@/lib/backup';
import { leesDiffMeta, lijstDiffDatums, type DiffMeta } from '@/lib/diff';
import getDb from '@/lib/db';
import { SCHEMA_VERSION } from '@/lib/migrations';

export async function GET(request: NextRequest) {
  const bron = request.nextUrl.searchParams.get('bron') ?? 'lokaal';

  try {
    let dir: string;
    if (bron === 'extern') {
      const row = getDb().prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1').get() as { backup_extern_pad: string | null } | undefined;
      if (!row?.backup_extern_pad) return NextResponse.json({ error: 'Geen externe locatie ingesteld.' }, { status: 400 });
      dir = row.backup_extern_pad;
      // TCP-check voorkomt main-thread blokkade bij onbereikbaar UNC-pad
      if (!await isExternPadBereikbaar(dir)) return NextResponse.json({ error: 'Externe locatie niet bereikbaar.' }, { status: 503 });
      if (!fs.existsSync(dir)) return NextResponse.json({ error: 'Externe locatie niet bereikbaar.' }, { status: 503 });
    } else {
      dir = BACKUP_DIR;
    }

    // Log-entries ophalen (alleen voor lokale bron — extern bevat logs van andere apparaten)
    const logByNaam = new Map<string, { type: string; beschrijving: string }>();
    if (bron === 'lokaal') {
      try {
        const rijen = getDb().prepare('SELECT bestandsnaam, type, beschrijving FROM backup_log').all() as { bestandsnaam: string; type: string; beschrijving: string }[];
        for (const r of rijen) logByNaam.set(r.bestandsnaam, { type: r.type, beschrijving: r.beschrijving });
      } catch { /* tabel mogelijk nog niet aanwezig */ }
    }

    // Per-dag diff-meta's: per anker (gematcht via voor_anker) tonen we het
    // bijbehorende aantal wijzigingen. "Huidige staat" boven de lijst pakt
    // de meta met het hoogste id (= meest recente dag waarop iets veranderd is).
    const diffMetas: DiffMeta[] = [];
    for (const d of lijstDiffDatums(dir)) {
      const m = leesDiffMeta(dir, d);
      if (m) diffMetas.push(m);
    }
    const metaByAnker = new Map<string, DiffMeta>();
    for (const m of diffMetas) {
      if (m.voor_anker) metaByAnker.set(m.voor_anker, m);
    }
    const huidige = diffMetas.reduce<DiffMeta | null>(
      (top, m) => (!top || m.hoogste_id > top.hoogste_id) ? m : top,
      null,
    );

    const bestanden = fs.readdirSync(dir)
      .filter(f => f.startsWith('backup_') && (f.endsWith('.sqlite.gz') || f.endsWith('.sqlite.enc.gz')))
      .sort()
      .reverse()
      .map(f => {
        const stat = fs.statSync(path.join(dir, f));
        const log = logByNaam.get(f);
        // Sidecar altijd lezen voor schema_versie (log-tabel cachet die niet)
        const sc = leesSidecar(dir, f);
        const dm = metaByAnker.get(f);
        const heeftDiff = !!dm && dm.aantal_entries > 0;
        return {
          naam: f,
          grootte: stat.size,
          datum: stat.mtime.toISOString(),
          versleuteld: f.endsWith('.sqlite.enc.gz'),
          type: log?.type ?? sc?.type ?? 'onbekend',
          beschrijving: log?.beschrijving ?? sc?.beschrijving ?? '',
          schema_versie: sc?.schema_versie ?? null,
          diff_aantal: heeftDiff ? dm!.aantal_entries : 0,
          diff_laatste_timestamp_ms: heeftDiff ? dm!.laatste_timestamp_ms : null,
        };
      });

    return NextResponse.json({
      bron,
      bestanden,
      huidige_schema_versie: SCHEMA_VERSION,
      huidige_diff: huidige && huidige.aantal_entries > 0
        ? { aantal: huidige.aantal_entries, laatste_timestamp_ms: huidige.laatste_timestamp_ms }
        : null,
    });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Fout bij laden backup lijst.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
