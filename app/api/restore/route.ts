// FILE: route.ts (api/restore)
// Binary restore: vervangt fbs.db file door uitgepakte SQLite-snapshot.
// JSON-payload flow vervallen — partial restore wordt afgedekt door
// fine-grained backup-triggers (één backup per wijziging) i.p.v.
// tabel-selectie binnen één backup.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import getDb, { DB_PATH, initFallbackSchema } from '@/lib/db';
import { leesBackupNaarTmp, maakInterneBackup, BACKUP_DIR } from '@/lib/backup';
import { runMigrations, SCHEMA_VERSION } from '@/lib/migrations';
import { verifieerWachtwoord } from '@/lib/backupEncryptie';
import { leesDiffFile, leesDiffMeta } from '@/lib/diff';
import { pasToe, wisSchemaCache, type LogRij } from '@/lib/wijzigingUndo';
import { zonderLogging } from '@/lib/wijzigingContext';

declare global {
  // eslint-disable-next-line no-var
  var _db: Database.Database | undefined;
}

const BESTANDS_REGEX = /^backup_(anker_)?[\d_-]+\.sqlite(\.enc)?\.gz$/;
const ANKER_DATUM_REGEX = /^backup_anker_(\d{4}-\d{2}-\d{2})\.sqlite(\.enc)?\.gz$/;

type DeviceVelden = {
  apparaat_id: string | null;
  apparaat_naam: string | null;
  backup_extern_pad: string | null;
  backup_versie: number;
  backup_encryptie_hash: string | null;
  backup_encryptie_hint: string | null;
  backup_encryptie_salt: string | null;
  backup_herstelsleutel_hash: string | null;
  update_kanaal: string | null;
};

export async function POST(req: NextRequest) {
  let bestandsnaam: string | undefined;
  let bron: string | undefined;
  let tmpDbPad: string | null = null;
  let uploadTmpPad: string | null = null;
  // Directory waar het anker-bestand vandaan komt — gebruikt om het diff-file
  // (wlog.ndjson.gz) ernaast te zoeken voor forward replay. null bij upload-
  // flow omdat we daar geen begeleidende diff-file hebben.
  let diffSourceDir: string | null = null;
  // Encryptie-info voor diff-replay vanuit een versleutelde locatie.
  let diffEncHash: string | null = null;
  let diffEncSalt: string | null = null;

  const contentType = req.headers.get('content-type') ?? '';
  const isMultipart = contentType.startsWith('multipart/form-data');

  try {
    if (isMultipart) {
      // File-upload flow: gebruiker kiest een backup-bestand handmatig.
      // Werkt voor zowel onversleutelde (.sqlite.gz) als versleutelde (.sqlite.enc.gz) backups.
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const wachtwoord = (formData.get('wachtwoord') as string | null)?.trim() ?? '';
      const externPadInput = (formData.get('extern_pad') as string | null)?.trim() ?? '';
      if (!file) return NextResponse.json({ error: 'Geen bestand ontvangen.' }, { status: 400 });

      const isEncrypted = file.name.endsWith('.sqlite.enc.gz') || file.name.endsWith('.enc.gz');
      let hash: string | null = null;
      let salt: string | null = null;

      if (isEncrypted) {
        if (!wachtwoord) return NextResponse.json({ error: 'Wachtwoord is verplicht voor versleutelde backups.' }, { status: 400 });
        const db = getDb();
        const inst = db.prepare('SELECT backup_extern_pad, backup_encryptie_hash, backup_encryptie_salt, backup_encryptie_hint FROM instellingen WHERE id = 1')
          .get() as { backup_extern_pad: string | null; backup_encryptie_hash: string | null; backup_encryptie_salt: string | null; backup_encryptie_hint: string | null } | undefined;
        salt = inst?.backup_encryptie_salt ?? null;
        hash = inst?.backup_encryptie_hash ?? null;

        if (!salt || !hash) {
          // Probeer backup-config.json te laden uit opgegeven extern_pad
          const padOmTeProberen = externPadInput || inst?.backup_extern_pad || '';
          if (!padOmTeProberen) {
            return NextResponse.json({ error: 'Geen externe locatie bekend en geen pad opgegeven. Selecteer de map waar deze versleutelde backup uit komt.' }, { status: 400 });
          }
          const cfgPath = path.join(padOmTeProberen, 'backup-config.json');
          if (!fs.existsSync(cfgPath)) {
            return NextResponse.json({ error: `Geen backup-config.json gevonden in ${padOmTeProberen}.` }, { status: 404 });
          }
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { salt: string; hash: string; hint: string; herstelsleutelHash?: string };
          const wwKlopt = verifieerWachtwoord(wachtwoord, cfg.salt, cfg.hash);
          const herstelKlopt = cfg.herstelsleutelHash ? verifieerWachtwoord(wachtwoord, cfg.salt, cfg.herstelsleutelHash) : false;
          if (!wwKlopt && !herstelKlopt) {
            return NextResponse.json({ error: 'Wachtwoord of herstelsleutel is onjuist.' }, { status: 403 });
          }
          salt = cfg.salt;
          hash = cfg.hash;
          db.prepare('UPDATE instellingen SET backup_encryptie_hash = ?, backup_encryptie_salt = ?, backup_encryptie_hint = ?, backup_extern_pad = COALESCE(backup_extern_pad, ?) WHERE id = 1')
            .run(cfg.hash, cfg.salt, cfg.hint, padOmTeProberen);
        } else {
          if (!verifieerWachtwoord(wachtwoord, salt, hash)) {
            return NextResponse.json({ error: 'Wachtwoord is onjuist.' }, { status: 403 });
          }
        }
      }

      // Schrijf upload naar tmp en pak uit naar tmp-DB
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      uploadTmpPad = path.join(BACKUP_DIR, `.upload-${process.pid}-${Date.now()}.bin`);
      await fsp.writeFile(uploadTmpPad, Buffer.from(await file.arrayBuffer()));
      try {
        tmpDbPad = await leesBackupNaarTmp(uploadTmpPad, hash ?? undefined, salt ?? undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Backup uitpakken mislukt.';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      bestandsnaam = `(upload:${file.name})`;
    } else {
      // Reguliere flow: bestandsnaam + bron uit JSON body
      try {
        const body = await req.json() as Record<string, unknown>;
        if (typeof body.bestandsnaam === 'string') bestandsnaam = body.bestandsnaam;
        if (typeof body.bron === 'string') bron = body.bron;
      } catch { /* lege body — meest recente backup */ }

      // Extern pad + encryptie ophalen uit instellingen
      const db0 = getDb();
      const inst0 = db0.prepare('SELECT backup_extern_pad, backup_encryptie_hash, backup_encryptie_salt FROM instellingen WHERE id = 1')
        .get() as { backup_extern_pad: string | null; backup_encryptie_hash: string | null; backup_encryptie_salt: string | null } | undefined;
      const externPad = inst0?.backup_extern_pad ?? null;
      const encryptieHash = inst0?.backup_encryptie_hash ?? null;
      const encryptieSalt = inst0?.backup_encryptie_salt ?? null;

      // Bepaal bestandsnaam: expliciet, of meest recente uit backup-meta.json
      if (!bestandsnaam) {
        const metaDir = bron === 'extern' && externPad ? externPad : BACKUP_DIR;
        const metaPath = path.join(metaDir, 'backup-meta.json');
        if (!fs.existsSync(metaPath)) {
          return NextResponse.json({ error: 'Geen backup beschikbaar.' }, { status: 404 });
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { latestBackup: string };
        bestandsnaam = meta.latestBackup;
      }

      if (!BESTANDS_REGEX.test(bestandsnaam)) {
        return NextResponse.json({ error: 'Ongeldige backup-bestandsnaam.' }, { status: 400 });
      }

      // Lokaal eerst, dan extern als fallback
      let bestandsPad = path.join(BACKUP_DIR, bestandsnaam);
      if (!fs.existsSync(bestandsPad) && externPad) {
        const externBestandsPad = path.join(externPad, bestandsnaam);
        if (fs.existsSync(externBestandsPad)) bestandsPad = externBestandsPad;
      }
      if (!fs.existsSync(bestandsPad)) {
        return NextResponse.json({ error: `Backup-bestand niet gevonden: ${bestandsnaam}` }, { status: 404 });
      }
      diffSourceDir = path.dirname(bestandsPad);
      diffEncHash = encryptieHash;
      diffEncSalt = encryptieSalt;

      try {
        tmpDbPad = await leesBackupNaarTmp(bestandsPad, encryptieHash ?? undefined, encryptieSalt ?? undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Backup uitpakken mislukt.';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Lees user_version uit de tmp-DB om schema-versie te valideren
    let backupSchemaVersion = 0;
    try {
      const inspectDb = new Database(tmpDbPad!, { readonly: true });
      backupSchemaVersion = inspectDb.pragma('user_version', { simple: true }) as number;
      inspectDb.close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Backup-bestand is geen geldige SQLite-DB.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (backupSchemaVersion > SCHEMA_VERSION) {
      return NextResponse.json({
        error: `Deze backup is gemaakt met een nieuwere appversie (schema ${backupSchemaVersion}). Werk de app eerst bij naar minimaal schema ${backupSchemaVersion} voordat je deze backup herstelt.`
      }, { status: 409 });
    }

    // Bewaar device-specifieke velden uit huidige instellingen vóór de DB wordt vervangen
    let deviceVelden: DeviceVelden | undefined;
    try {
      const db = getDb();
      deviceVelden = db.prepare(`SELECT apparaat_id, apparaat_naam, backup_extern_pad, backup_versie,
          backup_encryptie_hash, backup_encryptie_hint, backup_encryptie_salt,
          backup_herstelsleutel_hash, update_kanaal FROM instellingen WHERE id = 1`)
        .get() as DeviceVelden | undefined;
    } catch { /* eerste run — geen rij */ }

    // Pre-restore safety backup (gebruikt huidige connection — moet vóór close)
    await maakInterneBackup();

    // Sluit huidige connection en gooi WAL/SHM weg vóór file-replace
    try {
      if (global._db) {
        try { global._db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* */ }
        global._db.close();
      }
    } catch { /* */ }
    global._db = undefined;

    for (const ext of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + ext); } catch { /* bestaat mogelijk niet */ }
    }

    // Vervang DB-file
    await fsp.copyFile(tmpDbPad!, DB_PATH);

    // Heropen via getDb (lazy init met pragmas + fallback schema)
    const db = getDb();
    initFallbackSchema(db);

    // Migreer van backup user_version naar huidig SCHEMA_VERSION.
    // user_version van de tmp-DB is overgenomen door file-copy, dus migrations.runMigrations()
    // begint vanaf het punt waar de backup zat.
    runMigrations();
    // Schema kan zijn veranderd door migraties — gooi de kolomcache van
    // pasToe() weg zodat de replay tegen de actuele schema-staat werkt.
    wisSchemaCache();

    // backup_versie syncen naar max van bewaarde, lokale meta en externe meta
    try {
      let maxVersie = deviceVelden?.backup_versie ?? 0;
      const metaPath = path.join(BACKUP_DIR, 'backup-meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { versie?: number };
        if ((meta.versie ?? 0) > maxVersie) maxVersie = meta.versie!;
      }
      const externPad = deviceVelden?.backup_extern_pad ?? null;
      if (externPad) {
        try {
          const externMetaPath = path.join(externPad, 'backup-meta.json');
          if (fs.existsSync(externMetaPath)) {
            const externMeta = JSON.parse(fs.readFileSync(externMetaPath, 'utf-8')) as { versie?: number };
            if ((externMeta.versie ?? 0) > maxVersie) maxVersie = externMeta.versie!;
          }
        } catch { /* extern niet bereikbaar */ }
      }
      db.prepare('UPDATE instellingen SET laatst_herstelde_backup = ?, backup_versie = ? WHERE id = 1')
        .run(bestandsnaam, maxVersie);
    } catch {
      try { db.prepare('UPDATE instellingen SET laatst_herstelde_backup = ? WHERE id = 1').run(bestandsnaam); } catch { /* */ }
    }

    // Forward replay van diff-file (F5: per-dag): speelt de log-entries van
    // de dag die bij het anker hoort opnieuw af op de net-geladen DB.
    // Datum wordt uit de ankernaam gehaald (`backup_anker_<YYYY-MM-DD>.sqlite.gz`).
    // Zonder logging-scope zodat de capture-triggers niet dubbel registreren.
    //
    // Defensief: per entry een eigen try/catch + savepoint. Een failing
    // entry (bijv. door schema-evolutie sinds de entry werd opgeslagen)
    // breekt niet de hele restore — die ene wijziging is "verloren", de
    // rest van de replay én de basisstaat van het anker blijven intact.
    // Aantallen worden teruggegeven aan de UI als waarschuwing.
    let replayed = 0;
    const replayWaarschuwingen: { entryId: number; tabel: string; reden: string }[] = [];
    let diffMetaVoorCursor: ReturnType<typeof leesDiffMeta> = null;
    if (diffSourceDir) {
      try {
        const datumMatch = bestandsnaam!.match(ANKER_DATUM_REGEX);
        const datum = datumMatch ? datumMatch[1] : null;
        const diffMeta = datum ? leesDiffMeta(diffSourceDir, datum) : null;
        diffMetaVoorCursor = diffMeta;
        const enc = diffEncHash && diffEncSalt ? { hash: diffEncHash, salt: diffEncSalt } : undefined;
        const diffEntries = datum ? await leesDiffFile(diffSourceDir, datum, enc) : [];
        if (diffEntries.length > 0) {
          const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM wijziging_log').get() as { m: number };
          const maxId = maxRow.m;
          const teReplayen = diffEntries.filter(e => e.id > maxId);
          if (teReplayen.length > 0) {
            zonderLogging(() => {
              const insertStmt = db.prepare(`
                INSERT OR IGNORE INTO wijziging_log
                  (id, actie_id, timestamp_ms, type, beschrijving, tabel, rij_id, operatie, voor_json, na_json, teruggedraaid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              for (const e of teReplayen) {
                // Per-entry savepoint: bij fout rolt alleen deze entry
                // terug, de rest van de replay gaat door.
                db.exec('SAVEPOINT replay_entry');
                try {
                  if (e.teruggedraaid !== 1) pasToe(db, e as LogRij);
                  insertStmt.run(e.id, e.actie_id, e.timestamp_ms, e.type, e.beschrijving, e.tabel, e.rij_id, e.operatie, e.voor_json, e.na_json, e.teruggedraaid);
                  db.exec('RELEASE replay_entry');
                  replayed++;
                } catch (err) {
                  db.exec('ROLLBACK TO replay_entry');
                  db.exec('RELEASE replay_entry');
                  const reden = err instanceof Error ? err.message : String(err);
                  replayWaarschuwingen.push({ entryId: e.id, tabel: e.tabel, reden });
                  console.warn(`[restore] Replay-entry ${e.id} (${e.tabel}/${e.operatie}) overgeslagen: ${reden}`);
                }
              }
            });
          }
        }
      } catch (err) {
        console.error('[restore] Diff-replay mislukt:', err);
      }
    }

    // Zet device-specifieke velden terug (apparaat_id, apparaat_naam, encryptie,
    // extern-pad, kanaal). MOET na de diff-replay gebeuren — entries op de
    // `instellingen`-tabel in de wlog kunnen anders deze velden terugzetten
    // op de waarden van het bron-apparaat. Geen logging-scope: dit is een
    // herstel-actie die niet in de wlog moet komen.
    if (deviceVelden) {
      zonderLogging(() => {
        db.prepare(`UPDATE instellingen SET
          apparaat_id = ?, apparaat_naam = COALESCE(?, apparaat_naam),
          backup_extern_pad = ?, backup_encryptie_hash = ?,
          backup_encryptie_hint = ?, backup_encryptie_salt = ?, backup_herstelsleutel_hash = ?,
          update_kanaal = COALESCE(?, update_kanaal)
          WHERE id = 1`).run(
          deviceVelden!.apparaat_id, deviceVelden!.apparaat_naam,
          deviceVelden!.backup_extern_pad, deviceVelden!.backup_encryptie_hash,
          deviceVelden!.backup_encryptie_hint, deviceVelden!.backup_encryptie_salt, deviceVelden!.backup_herstelsleutel_hash,
          deviceVelden!.update_kanaal
        );
      });
    }

    // Sync-cursor bijwerken zodat split-brain detectie de externe staat nu
    // als "gezien" markeert. We gebruiken de meta die bij het gerestore'de
    // anker hoort.
    if (diffMetaVoorCursor && typeof diffMetaVoorCursor.hoogste_id === 'number') {
      try {
        db.prepare('UPDATE instellingen SET gezien_extern_hoogste_id = ? WHERE id = 1').run(diffMetaVoorCursor.hoogste_id);
      } catch { /* */ }
    }

    return NextResponse.json({
      success: true,
      hersteld: bestandsnaam,
      diffReplayed: replayed,
      diffOvergeslagen: replayWaarschuwingen.length,
      diffWaarschuwingen: replayWaarschuwingen.slice(0, 20), // top 20 voor UI
    });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Restore mislukt.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  } finally {
    if (tmpDbPad) { try { fs.unlinkSync(tmpDbPad); } catch { /* */ } }
    if (uploadTmpPad) { try { fs.unlinkSync(uploadTmpPad); } catch { /* */ } }
  }
}
