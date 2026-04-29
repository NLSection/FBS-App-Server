// GET /api/sync-state — split-brain detectie via diff-meta vergelijking.
//
// Vergelijk drie cursors:
//   - lokaal_hoogste_id  = max(wijziging_log.id)
//   - extern_hoogste_id  = wlog.meta.json.hoogste_id (op externe locatie)
//   - gezien_extern_id   = instellingen.gezien_extern_hoogste_id (laatste sync-cursor)
//
// Status:
//   "in_sync"           — extern == gezien, lokaal == gezien (alles gelijk)
//   "lokaal_voor"       — lokaal > gezien, extern == gezien (wij hebben gepushed of nog te pushen)
//   "extern_voor"       — extern > gezien, lokaal == gezien (ander apparaat heeft geschreven, wij nog niets)
//   "split_brain"       — extern > gezien EN lokaal > gezien EN externe schrijver != eigen UUID
//
// Schrijver-info komt uit wlog.meta.json zelf (schrijver_apparaat_id).

import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { isExternPadBereikbaar } from '@/lib/backup';
import { leesDiffMeta, lijstDiffDatums, type DiffMeta } from '@/lib/diff';

export async function GET() {
  try {
    const db = getDb();
    const inst = db.prepare(`
      SELECT apparaat_id, apparaat_naam, backup_extern_pad, gezien_extern_hoogste_id
      FROM instellingen WHERE id = 1
    `).get() as {
      apparaat_id: string | null; apparaat_naam: string | null;
      backup_extern_pad: string | null; gezien_extern_hoogste_id: number;
    } | undefined;

    if (!inst?.backup_extern_pad) {
      return NextResponse.json({ status: 'geen_extern' });
    }

    const externPad = inst.backup_extern_pad;
    const eigenId = inst.apparaat_id;
    const gezien = inst.gezien_extern_hoogste_id ?? 0;

    if (!await isExternPadBereikbaar(externPad)) {
      return NextResponse.json({ status: 'extern_offline' });
    }

    // Per-dag meta's (F5): pak de meta met het hoogste id over alle datums.
    // Dat is de "tip" van extern's wijziging-stream.
    let externMeta: DiffMeta | null = null;
    for (const d of lijstDiffDatums(externPad)) {
      const m = leesDiffMeta(externPad, d);
      if (m && (!externMeta || m.hoogste_id > externMeta.hoogste_id)) externMeta = m;
    }

    const lokaalRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM wijziging_log').get() as { m: number };
    const lokaalHoogste = lokaalRow.m;
    const externHoogste = externMeta?.hoogste_id ?? 0;
    const externSchrijver = externMeta?.schrijver_apparaat_id ?? null;

    const externAnderApparaat = !!externSchrijver && externSchrijver !== eigenId;
    const externIsVoor = externHoogste > gezien && externAnderApparaat;
    const lokaalIsVoor = lokaalHoogste > gezien;

    let status: 'in_sync' | 'lokaal_voor' | 'extern_voor' | 'split_brain' = 'in_sync';
    if (externIsVoor && lokaalIsVoor) status = 'split_brain';
    else if (externIsVoor) status = 'extern_voor';
    else if (lokaalIsVoor) status = 'lokaal_voor';

    return NextResponse.json({
      status,
      eigen_apparaat_id: eigenId,
      eigen_apparaat_naam: inst.apparaat_naam,
      lokaal_hoogste_id: lokaalHoogste,
      extern_hoogste_id: externHoogste,
      gezien_extern_id: gezien,
      extern_schrijver_id: externSchrijver,
      // Aantal wijzigingen per kant sinds laatste gezamenlijke staat
      lokaal_aantal: Math.max(0, lokaalHoogste - gezien),
      extern_aantal: Math.max(0, externHoogste - gezien),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync-state fout.' }, { status: 500 });
  }
}
