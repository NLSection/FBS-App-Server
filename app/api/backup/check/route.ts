import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import getDb from '@/lib/db';
import { BACKUP_DIR, isExternPadBereikbaar, leesSidecar } from '@/lib/backup';
import { lijstDiffDatums, leesDiffMeta } from '@/lib/diff';
import { ankerNaamVoor } from '@/lib/anchor';
import { zonderLogging } from '@/lib/wijzigingContext';

export async function GET() {
  let backupIsNieuwer = false;
  let backupDatum: string | null = null;
  let backupBestand: string | null = null;
  let bron: 'lokaal' | 'extern' | null = null;
  let forkDetected = false;
  let pendingExtern = 0;
  let encryptieConfigMismatch = false;
  let encryptieConfigOntbreekt = false;

  try {
    const db = getDb();
    const row = db.prepare('SELECT apparaat_id, backup_extern_pad, gezien_extern_hoogste_id, backup_encryptie_hash FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; backup_extern_pad: string | null; gezien_extern_hoogste_id: number; backup_encryptie_hash: string | null } | undefined;

    const eigenApparaatId = row?.apparaat_id ?? null;
    const externPad = row?.backup_extern_pad ?? null;
    const gezienExtern = row?.gezien_extern_hoogste_id ?? 0;

    // Externe bereikbaarheidscheck (TCP:445) vóór file-operaties — voorkomt libuv-threadpool blokkade
    const externBereikbaar = externPad ? await isExternPadBereikbaar(externPad) : false;

    if (externBereikbaar && externPad) {
      // Bron-of-truth: per-dag wlog meta-files. Vind de meest recente datum
      // waarvoor extern een wlog-meta heeft van een ánder apparaat én met
      // hoogste_id voorbij onze cursor — dat is een externe set die we nog
      // niet hebben opgehaald.
      const externDatums = lijstDiffDatums(externPad);
      let kandidaatDatum: string | null = null;
      let kandidaatHoogste = 0;
      let kandidaatTimestamp: number | null = null;
      for (const datum of externDatums) {
        const meta = leesDiffMeta(externPad, datum);
        if (!meta) continue;
        const schrijver = meta.schrijver_apparaat_id ?? null;
        if (!schrijver || !eigenApparaatId || schrijver === eigenApparaatId) continue;
        if (meta.hoogste_id <= gezienExtern) continue;
        // Pak de set met hoogste id (= meest recente extern-write).
        if (meta.hoogste_id > kandidaatHoogste) {
          kandidaatDatum = datum;
          kandidaatHoogste = meta.hoogste_id;
          kandidaatTimestamp = meta.laatste_timestamp_ms;
        }
      }

      if (kandidaatDatum) {
        // Anker-bestandsnaam bepalen — versleuteld of plain afhankelijk van
        // wat er extern staat. Restore-route zoekt het bestand zelf op.
        const ankerPlain = ankerNaamVoor(kandidaatDatum);
        const ankerEnc = ankerPlain.replace('.sqlite.gz', '.sqlite.enc.gz');
        const heeftEnc = fs.existsSync(path.join(externPad, ankerEnc));
        const heeftPlain = fs.existsSync(path.join(externPad, ankerPlain));
        if (heeftEnc || heeftPlain) {
          backupIsNieuwer = true;
          backupBestand = heeftEnc ? ankerEnc : ankerPlain;
          backupDatum = kandidaatTimestamp ? new Date(kandidaatTimestamp).toISOString() : `${kandidaatDatum}T00:00:00.000Z`;
          bron = 'extern';
        }

        // Fork = extern is vooruit én wij hebben ook lokale ongepushte
        // wijzigingen voorbij dezelfde cursor. Dat is een echte split-brain
        // situatie — gebruiker moet kiezen welke kant wint.
        try {
          const lokaalHoogste = (db.prepare('SELECT MAX(id) AS m FROM wijziging_log').get() as { m: number | null } | undefined)?.m ?? 0;
          if (lokaalHoogste > gezienExtern) forkDetected = true;
        } catch { /* */ }
      }
    }

    // Encryptie-configuratie mismatch (alleen als extern pad ingesteld én bereikbaar is)
    if (externBereikbaar && externPad && row?.backup_encryptie_hash) {
      try {
        const configPad = path.join(externPad, 'backup-config.json');
        const configInhoud = await fsp.readFile(configPad, 'utf-8');
        const config = JSON.parse(configInhoud) as { hash?: string };
        if (config.hash && config.hash !== row.backup_encryptie_hash) {
          encryptieConfigMismatch = true;
        }
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          encryptieConfigOntbreekt = true;
        }
      }
    }

    // Verplaats pending-extern bestanden asynchroon (alleen als bereikbaar).
    // Guard: bestaand extern bestand van een ander apparaat niet overschrijven.
    const pendingDir = path.join(BACKUP_DIR, 'pending-extern');
    if (externBereikbaar && externPad) {
      try {
        const bestanden = (await fsp.readdir(pendingDir)).filter(f => f.startsWith('backup_') && !f.endsWith('.meta.json'));
        if (bestanden.length > 0) {
          await fsp.mkdir(externPad!, { recursive: true });
          await Promise.all(bestanden.map(async f => {
            const externDoel = path.join(externPad!, f);
            if (fs.existsSync(externDoel) && eigenApparaatId) {
              const sc = leesSidecar(externPad!, f);
              if (sc?.apparaat_id && sc.apparaat_id !== eigenApparaatId) {
                console.warn(`[check] Skip overwrite ${f}: extern is van ${sc.apparaat_id}`);
                return;
              }
            }
            await fsp.copyFile(path.join(pendingDir, f), externDoel);
            await fsp.unlink(path.join(pendingDir, f));
          }));
          const resterend = await fsp.readdir(pendingDir);
          if (resterend.length === 0) await fsp.rmdir(pendingDir);
        }
      } catch { /* extern niet bereikbaar of pending-dir bestaat niet */ }
    }

    try {
      const resterend = await fsp.readdir(pendingDir);
      pendingExtern = resterend.filter(f => f.startsWith('backup_')).length;
    } catch { /* */ }

  } catch {
    // Geen backup of geen db — geen melding tonen
  }

  return NextResponse.json({ backupIsNieuwer, backupDatum, backupBestand, bron, forkDetected, pendingExtern, encryptieConfigMismatch, encryptieConfigOntbreekt });
}

/** POST: bevestig "lokale versie behouden" — bump `gezien_extern_hoogste_id`
 *  naar het maximum dat nu op extern staat zodat de melding "Nieuwe backup
 *  beschikbaar" verdwijnt. De daadwerkelijke push van onze staat over extern
 *  blijft door de push-guard geblokkeerd tenzij de gebruiker via de
 *  SplitBrainModal expliciet "mijne" kiest (die doet ook archief naar
 *  verloren-takken). */
export async function POST() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_pad, gezien_extern_hoogste_id FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null; gezien_extern_hoogste_id: number } | undefined;

    let maxId = row?.gezien_extern_hoogste_id ?? 0;
    const externPad = row?.backup_extern_pad ?? null;
    if (externPad) {
      try {
        for (const datum of lijstDiffDatums(externPad)) {
          const meta = leesDiffMeta(externPad, datum);
          if (meta && meta.hoogste_id > maxId) maxId = meta.hoogste_id;
        }
      } catch { /* extern onbereikbaar */ }
    }

    zonderLogging(() => {
      db.prepare('UPDATE instellingen SET gezien_extern_hoogste_id = ? WHERE id = 1').run(maxId);
    });
    return NextResponse.json({ ok: true, gezien_extern_hoogste_id: maxId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}

