// POST /api/sync-state/resolve
//
// Body: { keuze: 'mijne' | 'andere' }
//
// "mijne"   — eigen versie wint. Externe wlog wordt gearchiveerd als
//             verloren-tak (lokaal opgeslagen) en daarna overschreven door
//             onze wlog. Extern's lokale staat is daarna gelijk aan onze.
// "andere"  — externe versie wint. Huidige lokale DB wordt eerst als
//             interne pre-restore-backup vastgelegd, daarna laden we het
//             externe anker + replay het externe wlog.
//
// In beide gevallen wordt `gezien_extern_hoogste_id` bijgewerkt zodat de
// detectie de conflict-staat ziet als opgelost.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import getDb from '@/lib/db';
import { BACKUP_DIR, isExternPadBereikbaar, triggerGatekeeperTick } from '@/lib/backup';
import { leesDiffMeta, lijstDiffDatums } from '@/lib/diff';
import { zonderLogging } from '@/lib/wijzigingContext';

const VERLOREN_DIR = 'verloren-takken';

export async function POST(req: NextRequest) {
  let body: { keuze?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  const keuze = body.keuze === 'mijne' || body.keuze === 'andere' ? body.keuze : null;
  if (!keuze) return NextResponse.json({ error: 'keuze moet "mijne" of "andere" zijn.' }, { status: 400 });

  try {
    const db = getDb();
    const inst = db.prepare('SELECT backup_extern_pad FROM instellingen WHERE id = 1').get() as { backup_extern_pad: string | null } | undefined;
    if (!inst?.backup_extern_pad) return NextResponse.json({ error: 'Geen externe locatie ingesteld.' }, { status: 400 });

    const externPad = inst.backup_extern_pad;
    if (!await isExternPadBereikbaar(externPad)) {
      return NextResponse.json({ error: 'Externe locatie niet bereikbaar.' }, { status: 503 });
    }

    if (keuze === 'mijne') {
      // 1. Archiveer extern wlog-files (alle dagen) + meta's in verloren-takken-map (lokaal)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const verlorenDir = path.join(BACKUP_DIR, VERLOREN_DIR);
      await fsp.mkdir(verlorenDir, { recursive: true });

      // Pak schrijver-id uit de meta met de hoogste id (tip van extern's stream)
      let schrijverId: string = 'onbekend';
      let topId = 0;
      for (const d of lijstDiffDatums(externPad)) {
        const m = leesDiffMeta(externPad, d);
        if (m && m.hoogste_id > topId) {
          topId = m.hoogste_id;
          schrijverId = m.schrijver_apparaat_id ?? 'onbekend';
        }
      }

      // Kopieer alle wlog_<datum>.ndjson(.enc).gz + meta files naar verloren-takken
      const externEntries = fs.readdirSync(externPad);
      for (const f of externEntries) {
        if (/^wlog_\d{4}-\d{2}-\d{2}\.(ndjson(?:\.enc)?\.gz|meta\.json)$/.test(f)) {
          const naam = `verloren_${schrijverId}_${stamp}_${f}`;
          await fsp.copyFile(path.join(externPad, f), path.join(verlorenDir, naam));
        }
      }

      // 2. Trigger sync — gatekeeper schrijft onze wlog over extern heen
      triggerGatekeeperTick();

      // 3. Cursor bijwerken naar MAX(lokaal, extern) — alle gearchiveerde
      //    extern-wlogs zijn nu "gezien" (kopie staat in verloren-takken).
      //    Lokaal alleen zou te laag zijn als extern oude dagen hoger heeft
      //    dan onze stream → die zouden bij volgende check opnieuw als fork
      //    gedetecteerd worden. zonderLogging: cursor is per-apparaat, hoort
      //    niet via wijziging_log naar andere devices te repliceren (en zou
      //    bovendien lokaal_voor triggeren zodra hij zelf gelogd wordt).
      const lokaalRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM wijziging_log').get() as { m: number };
      let externMax = 0;
      for (const d of lijstDiffDatums(externPad)) {
        const m = leesDiffMeta(externPad, d);
        if (m && m.hoogste_id > externMax) externMax = m.hoogste_id;
      }
      const nieuweCursor = Math.max(lokaalRow.m, externMax);
      zonderLogging(() => {
        db.prepare('UPDATE instellingen SET gezien_extern_hoogste_id = ? WHERE id = 1').run(nieuweCursor);
      });

      return NextResponse.json({ success: true, keuze: 'mijne', gearchiveerd: 'extern stream', cursor: nieuweCursor });
    }

    // keuze === 'andere'
    // De UI dient zelf POST /api/restore aan te roepen met het externe anker;
    // dit endpoint kan dat niet zelf goed afhandelen omdat restore de huidige
    // connection sluit en de DB-file vervangt. We doen alleen de pre-actie:
    // markeer dat de gebruiker bewust voor "andere" kiest en zet de cursor
    // naar de externe hoogste_id zodat de subsequent restore de cursor in
    // lijn houdt. We pakken de meta met het hoogste id (= tip van extern's
    // stream) om het bijbehorende anker te kiezen.
    let topMeta: ReturnType<typeof leesDiffMeta> = null;
    for (const d of lijstDiffDatums(externPad)) {
      const m = leesDiffMeta(externPad, d);
      if (m && (!topMeta || m.hoogste_id > topMeta.hoogste_id)) topMeta = m;
    }
    if (!topMeta) return NextResponse.json({ error: 'Externe diff-meta niet gevonden.' }, { status: 404 });

    zonderLogging(() => {
      db.prepare('UPDATE instellingen SET gezien_extern_hoogste_id = ? WHERE id = 1').run(topMeta!.hoogste_id);
    });

    // Geef anker-naam terug zodat de UI direct /api/restore kan aanroepen
    return NextResponse.json({
      success: true,
      keuze: 'andere',
      anker_naam: topMeta.voor_anker,
      bron: 'extern',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Resolve mislukt.' }, { status: 500 });
  }
}
