import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { headers as nextHeaders } from 'next/headers';
import getDb, { DB_PATH } from './db';
import { versleutel, ontsleutel } from './backupEncryptie';
import { cleanupAll } from './retention';
import { SCHEMA_VERSION } from './migrations';
export const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backup');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

// total_changes() telt het cumulatieve aantal INSERT/UPDATE/DELETE-rijen op
// de eigen connection sinds open. Door deze waarde te onthouden ná elke backup
// kunnen we triggers overslaan die geen rij-wijziging hebben veroorzaakt
// (bv. read-only API-call die per ongeluk triggerBackup roept).
//
// LET OP: SQLite's `data_version` pragma is hiervoor ongeschikt — die
// incrementeert alleen bij wijzigingen van ANDERE connections, niet van de
// eigen connection. Met onze singleton-DB blijft `data_version` na de eerste
// backup eeuwig gelijk → alle volgende triggers werden geskipt.
let lastBackupTotalChanges = -1;

function leesTotalChanges(db: ReturnType<typeof getDb>): number {
  const row = db.prepare('SELECT total_changes() AS n').get() as { n: number };
  return row.n;
}

/**
 * Metadata voor backup_log. `type` is een korte categorie (bv. 'import',
 * 'transactie', 'categorie', 'handmatig', 'pre-restore'), `beschrijving` is
 * een concrete zin voor de gebruiker ("Transactie toegevoegd: €45,20 AH to go").
 * Optioneel — oude call-sites zonder parameter loggen als 'onbekend'.
 */
export type BackupMeta = { type: string; beschrijving: string };

/**
 * Sidecar-bestand naast elk backup-bestand: bevat de metadata die anders alleen
 * in de lokale `backup_log`-tabel zou zitten. Hierdoor is een backup-bestand op
 * een externe locatie zelfbeschrijvend — een ander apparaat dat die locatie
 * leest ziet meteen welke actie deze backup triggerde én welk apparaat 'm maakte.
 */
export type BackupSidecar = {
  bestandsnaam: string;
  type: string;
  beschrijving: string;
  apparaat_id: string;
  aangemaakt_op: string;
  schema_versie?: number;
};

export function sidecarNaam(backupNaam: string): string {
  return backupNaam.replace(/\.(sqlite\.enc\.gz|sqlite\.gz)$/, '.meta.json');
}

function schrijfSidecar(dir: string, backupNaam: string, data: BackupSidecar): void {
  try {
    fs.writeFileSync(path.join(dir, sidecarNaam(backupNaam)), JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* sidecar-write mag nooit de backup-flow breken */ }
}

export function leesSidecar(dir: string, backupNaam: string): BackupSidecar | null {
  try {
    const pad = path.join(dir, sidecarNaam(backupNaam));
    if (!fs.existsSync(pad)) return null;
    return JSON.parse(fs.readFileSync(pad, 'utf-8')) as BackupSidecar;
  } catch { return null; }
}

/**
 * Action-group coalescing: calls met dezelfde actieId worden samengevoegd tot
 * één backup. Debounce-venster: ACTIE_DEBOUNCE_MS na de laatste call binnen de
 * actie draait de backup met een samengevoegde beschrijving. Zo krijgt één
 * user-actie (bv. transactie categoriseren → regel aanmaken → hermatch) exact
 * één backup, ongeacht hoeveel API-calls onder de motorkap gebeuren.
 */
const ACTIE_DEBOUNCE_MS = 300;
type ActieState = { meta: BackupMeta[]; timer: NodeJS.Timeout };
const actieMap = new Map<string, ActieState>();

function combineerMeta(metas: BackupMeta[]): BackupMeta {
  if (metas.length === 1) return metas[0];
  const types = Array.from(new Set(metas.map(m => m.type)));
  const beschrijvingen = metas.map(m => m.beschrijving).filter(b => b.length > 0);
  const unieke = Array.from(new Set(beschrijvingen));
  return {
    type: types.length === 1 ? types[0] : 'gecombineerd',
    beschrijving: unieke.length > 0 ? unieke.join(' + ') : types.join(' + '),
  };
}

export function triggerBackup(logMeta?: BackupMeta, actieIdExpliciet?: string): void {
  // Fire-and-forget: lees X-Actie-Id uit de request-context (Next.js headers()
  // werkt binnen de async request chain, ook na setImmediate). Zonder actie-id
  // draait de backup direct; mét id worden opeenvolgende calls in hetzelfde
  // request gecoalesceerd tot één backup.
  (async () => {
    let actieId = actieIdExpliciet;
    if (!actieId) {
      try {
        const h = await nextHeaders();
        actieId = h.get('x-actie-id') ?? undefined;
      } catch { /* buiten request-context (bv. CLI-script) */ }
    }
    if (actieId) {
      const bestaand = actieMap.get(actieId);
      if (bestaand) {
        if (logMeta) bestaand.meta.push(logMeta);
        clearTimeout(bestaand.timer);
        bestaand.timer = setTimeout(() => voerActieUit(actieId!), ACTIE_DEBOUNCE_MS);
        return;
      }
      const state: ActieState = {
        meta: logMeta ? [logMeta] : [],
        timer: setTimeout(() => voerActieUit(actieId!), ACTIE_DEBOUNCE_MS),
      };
      actieMap.set(actieId, state);
      return;
    }
    doeBackup(logMeta);
  })();
}

function voerActieUit(actieId: string): void {
  const state = actieMap.get(actieId);
  if (!state) return;
  actieMap.delete(actieId);
  const gecombineerd = state.meta.length > 0 ? combineerMeta(state.meta) : undefined;
  doeBackup(gecombineerd);
}

function doeBackup(logMeta?: BackupMeta): void {
  setImmediate(async () => {
    let tmpPad: string | null = null;
    try {
      const db = getDb();

      // Skip als er sinds de vorige backup geen rij-wijzigingen zijn geweest.
      // Voorkomt no-op backups van read-only routes die per ongeluk
      // triggerBackup roepen. Handmatige en pre-restore backups omzeilen deze
      // check (gebruiker wil altijd een backup).
      const huidigeChanges = leesTotalChanges(db);
      const alwaysRun = logMeta?.type === 'handmatig' || logMeta?.type === 'pre-restore';
      if (!alwaysRun && lastBackupTotalChanges === huidigeChanges) return;

      fs.mkdirSync(BACKUP_DIR, { recursive: true });

      // WAL flushen naar de main DB-file zodat de snapshot zo compact mogelijk is.
      // db.backup() handelt WAL technisch zelf af, maar zonder checkpoint krijgen
      // ongecommitte WAL-pages alsnog mee gerepliceerd in de backup.
      try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* niet-kritiek */ }

      // Versienummer ophogen
      db.prepare('UPDATE instellingen SET backup_versie = backup_versie + 1 WHERE id = 1').run();
      const instRow = db.prepare('SELECT apparaat_id, backup_bewaar_dagen, backup_extern_pad, backup_versie, backup_encryptie_hash, backup_encryptie_salt FROM instellingen WHERE id = 1').get() as {
        apparaat_id: string | null; backup_bewaar_dagen: number;
        backup_extern_pad: string | null; backup_versie: number;
        backup_encryptie_hash: string | null; backup_encryptie_salt: string | null;
      } | undefined;

      const apparaatId   = instRow?.apparaat_id ?? 'onbekend';
      const bewaarDagen  = instRow?.backup_bewaar_dagen ?? 7;
      const externPad    = instRow?.backup_extern_pad ?? null;
      const versie       = instRow?.backup_versie ?? 1;
      const encryptieSalt = instRow?.backup_encryptie_salt ?? null;
      const heeftEncryptie = !!instRow?.backup_encryptie_hash && !!encryptieSalt;

      // Timestamp in Amsterdam-tijd als bestandsnaam
      const nu = new Date();
      const stamp = nu.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' })
        .replace(' ', '_')
        .replace(/:/g, '-');
      const naam = `backup_${stamp}.sqlite.gz`;

      // Native SQLite snapshot via Online Backup API → tmp-bestand → gzip → final.
      // Page-level kopie binnen één transaction — orders of magnitude sneller dan
      // tabel-voor-tabel SELECT + JSON serialiseren bij grote DBs.
      tmpPad = path.join(BACKUP_DIR, `.tmp-${process.pid}-${Date.now()}.sqlite`);
      await db.backup(tmpPad);
      const dbBuffer = await fsp.readFile(tmpPad);
      const compressed = await gzipAsync(dbBuffer);
      await fsp.writeFile(path.join(BACKUP_DIR, naam), compressed);

      const sidecarData: BackupSidecar = {
        bestandsnaam: naam,
        type: logMeta?.type ?? 'onbekend',
        beschrijving: logMeta?.beschrijving ?? '',
        apparaat_id: apparaatId,
        aangemaakt_op: nu.toISOString(),
        schema_versie: SCHEMA_VERSION,
      };
      schrijfSidecar(BACKUP_DIR, naam, sidecarData);

      // Log entry voor backup-overzicht (cache van sidecars voor snel opvragen)
      try {
        db.prepare(`
          INSERT INTO backup_log (bestandsnaam, type, beschrijving, aangemaakt_op)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(bestandsnaam) DO UPDATE SET type = excluded.type, beschrijving = excluded.beschrijving
        `).run(naam, sidecarData.type, sidecarData.beschrijving, sidecarData.aangemaakt_op);
      } catch { /* tabel bestaat nog niet bij een zeer verse install */ }

      // Backup-meta met apparaat-ID en versie
      const dbMtime = fs.statSync(DB_PATH).mtime.toISOString();
      const backupTijd = nu.toISOString();
      const meta = { latestBackup: naam, dbMtime, backupTijd, apparaatId, versie };
      fs.writeFileSync(path.join(BACKUP_DIR, 'backup-meta.json'), JSON.stringify(meta), 'utf-8');

      // Markeer deze backup als "bekend" op dit apparaat
      try {
        db.prepare('UPDATE instellingen SET laatst_herstelde_backup = ? WHERE id = 1').run(naam);
      } catch { /* kolom bestaat mogelijk nog niet bij eerste run */ }

      // Extern backup: altijd eerst naar pending-extern — gatekeeper worker sync
      // asynchroon. Direct na schrijven een fire-and-forget sync triggeren zodat
      // een bereikbare externe locatie binnen seconden wordt bijgewerkt i.p.v.
      // tot de volgende interval-tick te wachten. Bij onbereikbare locatie
      // returned de tick vroeg en wacht pending op de timer.
      const pendingDir = path.join(BACKUP_DIR, 'pending-extern');
      if (externPad) {
        const externNaam = heeftEncryptie && encryptieSalt ? naam.replace('.sqlite.gz', '.sqlite.enc.gz') : naam;
        const externData = heeftEncryptie && encryptieSalt
          ? versleutel(compressed, instRow!.backup_encryptie_hash!, encryptieSalt)
          : compressed;
        fs.mkdirSync(pendingDir, { recursive: true });
        fs.writeFileSync(path.join(pendingDir, externNaam), externData);
        schrijfSidecar(pendingDir, externNaam, sidecarData);
        triggerGatekeeperTick();
      }

      // Onthoud total_changes ná de UPDATE backup_versie zodat een volgende
      // trigger zonder echte data-wijziging wordt overgeslagen.
      lastBackupTotalChanges = leesTotalChanges(db);

      // Cleanup lokale backups: per-set retention (anker+diff+meta tegelijk)
      // + losse snapshots ouder dan bewaarDagen. Jongste set blijft altijd.
      cleanupAll(BACKUP_DIR, bewaarDagen, nu);
    } catch (err) {
      console.error('[backup] Automatische backup mislukt:', err);
    } finally {
      if (tmpPad) { try { fs.unlinkSync(tmpPad); } catch { /* */ } }
    }
  });
}

/** Sync alle per-dag wlog-files (`wlog_<datum>.ndjson(.enc).gz` +
 *  `wlog_<datum>.meta.json`) van lokaal naar extern. Diff-files worden
 *  versleuteld als encryptie aan staat. Meta blijft plain. Per file wordt
 *  alleen gekopieerd als de lokale versie nieuwer is dan de externe
 *  (mtime-vergelijking). Tegenhanger-bestand (oude encryptie-status) wordt
 *  opgeruimd op extern. */
async function syncWlogNaarExtern(
  externPad: string, heeftEncryptie: boolean, hash: string | null, salt: string | null,
): Promise<void> {
  const { diffFileNaam, diffEncFileNaam, diffMetaNaam } = await import('./diff');

  // Eigen apparaat-id + cursor ophalen voor split-brain-guard. Zonder deze
  // guard zou een lokale push blind een externe wlog van een ander apparaat
  // overschrijven (data-loss). Zie DIR-12 / sessie 25-04-2026.
  let eigenApparaatId: string | null = null;
  let gezienExternHoogsteId = 0;
  try {
    const r = getDb().prepare('SELECT apparaat_id, gezien_extern_hoogste_id FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; gezien_extern_hoogste_id: number } | undefined;
    eigenApparaatId = r?.apparaat_id ?? null;
    gezienExternHoogsteId = r?.gezien_extern_hoogste_id ?? 0;
  } catch { /* */ }

  let hoogstGepushedId = 0;

  // Vind alle datums waarvoor lokaal een wlog-file of meta bestaat.
  const lokaleEntries = fs.readdirSync(BACKUP_DIR);
  const datums = new Set<string>();
  for (const f of lokaleEntries) {
    const m = f.match(/^wlog_(\d{4}-\d{2}-\d{2})\.(ndjson(?:\.enc)?\.gz|meta\.json)$/);
    if (m) datums.add(m[1]);
  }

  for (const datum of datums) {
    const plainNaam = diffFileNaam(datum);
    const encNaam = diffEncFileNaam(datum);
    const metaNaam = diffMetaNaam(datum);

    // Push-guard: is de externe wlog van een ander apparaat én vooruit op
    // onze cursor? Dan niet pushen — wachten op split-brain-resolve via
    // SplitBrainModal. Anders zouden we hun entries silent overschrijven.
    const externMetaPad = path.join(externPad, metaNaam);
    if (fs.existsSync(externMetaPad)) {
      try {
        const externMeta = JSON.parse(fs.readFileSync(externMetaPad, 'utf-8')) as { hoogste_id?: number; schrijver_apparaat_id?: string | null };
        const externSchrijver = externMeta.schrijver_apparaat_id ?? null;
        const externHoogsteId = externMeta.hoogste_id ?? 0;
        if (externSchrijver && eigenApparaatId && externSchrijver !== eigenApparaatId && externHoogsteId > gezienExternHoogsteId) {
          console.warn(`[gatekeeper] Skip push wlog ${datum}: extern schrijver ${externSchrijver} (hoogste_id=${externHoogsteId}) > onze cursor (${gezienExternHoogsteId}) — wacht op split-brain resolve`);
          continue;
        }
      } catch { /* meta corrupt — laat door zodat we 'm overschrijven */ }
    }

    const lokaalPad = path.join(BACKUP_DIR, plainNaam);
    let gepushed = false;
    if (fs.existsSync(lokaalPad)) {
      const externNaam = heeftEncryptie ? encNaam : plainNaam;
      const externFilePad = path.join(externPad, externNaam);
      const lokaleMtime = fs.statSync(lokaalPad).mtimeMs;
      const externMtime = fs.existsSync(externFilePad) ? fs.statSync(externFilePad).mtimeMs : 0;
      if (lokaleMtime > externMtime) {
        const data = fs.readFileSync(lokaalPad);
        const uitvoer = heeftEncryptie && hash && salt ? versleutel(data, hash, salt) : data;
        fs.writeFileSync(externFilePad, uitvoer);
        gepushed = true;
        const tegenhanger = path.join(externPad, heeftEncryptie ? plainNaam : encNaam);
        if (fs.existsSync(tegenhanger)) { try { fs.unlinkSync(tegenhanger); } catch { /* */ } }
      }
    }

    const metaLokaal = path.join(BACKUP_DIR, metaNaam);
    if (fs.existsSync(metaLokaal)) {
      const metaExtern = path.join(externPad, metaNaam);
      const lokaleMtime = fs.statSync(metaLokaal).mtimeMs;
      const externMtime = fs.existsSync(metaExtern) ? fs.statSync(metaExtern).mtimeMs : 0;
      if (lokaleMtime > externMtime) {
        fs.copyFileSync(metaLokaal, metaExtern);
      }
    }

    if (gepushed) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaLokaal, 'utf-8')) as { hoogste_id?: number };
        if (typeof meta.hoogste_id === 'number' && meta.hoogste_id > hoogstGepushedId) {
          hoogstGepushedId = meta.hoogste_id;
        }
      } catch { /* */ }
    }
  }

  // Bij succesvolle push: update lokaal `gezien_extern_hoogste_id` zodat we
  // weten dat onze huidige staat ook op extern staat. Toekomstige writes
  // van een ander apparaat worden hierdoor als "nieuwere data" detecteerbaar.
  if (hoogstGepushedId > 0) {
    try {
      getDb().prepare('UPDATE instellingen SET gezien_extern_hoogste_id = MAX(gezien_extern_hoogste_id, ?) WHERE id = 1').run(hoogstGepushedId);
    } catch { /* */ }
  }
}

/** Sync lokale backups die nog niet op extern staan (alleen gecomprimeerde bestanden). Retourneert het aantal gesynchroniseerde bestanden. */
function syncNaarExtern(externPad: string, heeftEncryptie: boolean, hash: string | null, salt: string | null): number {
  const lokaal = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_') && f.endsWith('.sqlite.gz'));
  const extern = new Set(
    fs.readdirSync(externPad).filter(f => f.startsWith('backup_'))
  );
  let gesynchroniseerd = 0;
  for (const f of lokaal) {
    const externNaam = heeftEncryptie && hash && salt ? f.replace('.sqlite.gz', '.sqlite.enc.gz') : f;
    if (!extern.has(externNaam)) {
      if (heeftEncryptie && hash && salt) {
        const data = fs.readFileSync(path.join(BACKUP_DIR, f));
        const encrypted = versleutel(data, hash, salt);
        fs.writeFileSync(path.join(externPad, externNaam), encrypted);
      } else {
        fs.copyFileSync(path.join(BACKUP_DIR, f), path.join(externPad, f));
      }
      gesynchroniseerd++;
    }
    // Sidecar altijd synchroniseren (onversleuteld, metadata is niet-gevoelig)
    const lokaalSidecar = path.join(BACKUP_DIR, sidecarNaam(f));
    const externSidecar = path.join(externPad, sidecarNaam(externNaam));
    if (fs.existsSync(lokaalSidecar) && !fs.existsSync(externSidecar)) {
      try { fs.copyFileSync(lokaalSidecar, externSidecar); } catch { /* */ }
    }
  }
  return gesynchroniseerd;
}

/** Verplaats pending-extern bestanden naar externe locatie en ruim lokaal op.
 *  Guard: als het externe bestand al bestaat én van een ander apparaat is
 *  (sidecar.apparaat_id != eigen), niet overschrijven — pending laten staan
 *  zodat het later via een resolve kan worden afgehandeld. Zonder deze guard
 *  zou een dagelijks anker van het andere apparaat blind worden vervangen
 *  door dat van ons (data-loss bij split-brain). */
function verplaatsPending(pendingDir: string, externPad: string, eigenApparaatId: string | null): void {
  if (!fs.existsSync(pendingDir)) return;
  const bestanden = fs.readdirSync(pendingDir).filter(f => f.startsWith('backup_') && !f.endsWith('.meta.json'));
  for (const f of bestanden) {
    try {
      const externDoel = path.join(externPad, f);
      if (fs.existsSync(externDoel) && eigenApparaatId) {
        const sc = leesSidecar(externPad, f);
        if (sc?.apparaat_id && sc.apparaat_id !== eigenApparaatId) {
          console.warn(`[gatekeeper] Skip overwrite ${f}: extern is van apparaat ${sc.apparaat_id}, wij zijn ${eigenApparaatId}`);
          continue;
        }
      }
      fs.copyFileSync(path.join(pendingDir, f), externDoel);
      fs.unlinkSync(path.join(pendingDir, f));
      const sc = sidecarNaam(f);
      const scBron = path.join(pendingDir, sc);
      if (fs.existsSync(scBron)) {
        try { fs.copyFileSync(scBron, path.join(externPad, sc)); fs.unlinkSync(scBron); } catch { /* */ }
      }
    } catch { /* individueel bestand mislukt — probeer de rest */ }
  }
  try { const rest = fs.readdirSync(pendingDir); if (rest.length === 0) fs.rmdirSync(pendingDir); } catch { /* */ }
}

/** Maakt een interne backup van de huidige staat (geen extern, geen cleanup). Bedoeld als veiligheidsnet vóór een restore. Async — caller moet awaiten zodat de DB-connection nog open is tijdens db.backup(). */
export async function maakInterneBackup(): Promise<void> {
  let tmpPad: string | null = null;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const db = getDb();
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* niet-kritiek */ }

    const nu = new Date();
    const stamp = nu.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' })
      .replace(' ', '_').replace(/:/g, '-');
    const naam = `backup_${stamp}.sqlite.gz`;

    tmpPad = path.join(BACKUP_DIR, `.tmp-${process.pid}-${Date.now()}.sqlite`);
    await db.backup(tmpPad);
    const dbBuffer = await fsp.readFile(tmpPad);
    const compressed = await gzipAsync(dbBuffer);
    await fsp.writeFile(path.join(BACKUP_DIR, naam), compressed);

    const instRow = db.prepare('SELECT apparaat_id, backup_versie FROM instellingen WHERE id = 1').get() as { apparaat_id: string | null; backup_versie: number } | undefined;
    const apparaatId = instRow?.apparaat_id ?? 'onbekend';

    schrijfSidecar(BACKUP_DIR, naam, {
      bestandsnaam: naam,
      type: 'pre-restore',
      beschrijving: 'Veiligheidsbackup vóór restore',
      apparaat_id: apparaatId,
      aangemaakt_op: nu.toISOString(),
      schema_versie: SCHEMA_VERSION,
    });

    try {
      db.prepare(`
        INSERT INTO backup_log (bestandsnaam, type, beschrijving, aangemaakt_op)
        VALUES (?, 'pre-restore', 'Veiligheidsbackup vóór restore', ?)
        ON CONFLICT(bestandsnaam) DO NOTHING
      `).run(naam, nu.toISOString());
    } catch { /* */ }
    const meta = { latestBackup: naam, dbMtime: fs.statSync(DB_PATH).mtime.toISOString(), backupTijd: nu.toISOString(), apparaatId, versie: instRow?.backup_versie ?? 0 };
    fs.writeFileSync(path.join(BACKUP_DIR, 'backup-meta.json'), JSON.stringify(meta), 'utf-8');
  } catch (err) {
    console.error('[backup] Pre-restore backup mislukt:', err);
  } finally {
    if (tmpPad) { try { fs.unlinkSync(tmpPad); } catch { /* */ } }
  }
}

// ---------------------------------------------------------------------------
// Gatekeeper worker — synchroniseert pending-extern naar de externe locatie
// ---------------------------------------------------------------------------

export async function isExternPadBereikbaar(pad: string, timeoutMs = 5000): Promise<boolean> {
  if (!pad.startsWith('\\\\') && !pad.startsWith('//')) return true;
  const match = pad.match(/^[/\\]{2}([^/\\]+)/);
  if (!match) return false;
  const server = match[1];
  const tcpOk = await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.connect(445, server, () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error', () => { clearTimeout(timer); resolve(false); });
  });
  if (tcpOk) return true;
  // Fallback: TCP:445 kan falen (NAS in sleep, firewall blokkeert node.exe) terwijl de
  // Windows SMB-kernelclient wél werkt. Async fs.stat draait op libuv threadpool — geen
  // main-thread blokkade. Bevestigt werkelijke bereikbaarheid via het OS.
  try {
    await Promise.race([
      fsp.stat(pad),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// Re-entrancy guard: zowel de interval-timer als de fire-and-forget trigger
// vanuit een verse backup kunnen tegelijk willen syncen. Voorkom dat ze beide
// tegelijk in pending-extern gaan staan rommelen.
let gatekeeperTickActief = false;

async function gatekeeperTick(): Promise<void> {
  if (gatekeeperTickActief) return;
  gatekeeperTickActief = true;
  try {
    const db = getDb();
    const instRow = db.prepare('SELECT backup_extern_pad, backup_bewaar_dagen, backup_encryptie_hash, backup_encryptie_salt FROM instellingen WHERE id = 1')
      .get() as { backup_extern_pad: string | null; backup_bewaar_dagen: number; backup_encryptie_hash: string | null; backup_encryptie_salt: string | null } | undefined;

    const externPad = instRow?.backup_extern_pad ?? null;
    if (!externPad) return;

    const bereikbaar = await isExternPadBereikbaar(externPad);
    if (!bereikbaar) return;

    const bewaarDagen = instRow?.backup_bewaar_dagen ?? 7;
    const hash        = instRow?.backup_encryptie_hash  ?? null;
    const salt        = instRow?.backup_encryptie_salt  ?? null;
    const heeftEncryptie = !!hash && !!salt;

    const eigenApparaatId = (db.prepare('SELECT apparaat_id FROM instellingen WHERE id = 1').get() as { apparaat_id: string | null } | undefined)?.apparaat_id ?? null;

    const pendingDir = path.join(BACKUP_DIR, 'pending-extern');
    const hadPending = fs.existsSync(pendingDir) && fs.readdirSync(pendingDir).filter(f => f.startsWith('backup_') && !f.endsWith('.meta.json')).length > 0;
    verplaatsPending(pendingDir, externPad, eigenApparaatId);
    const nieuwGesynchroniseerd = syncNaarExtern(externPad, heeftEncryptie, hash, salt);

    // Bijwerk backup-meta.json op externe locatie alleen als er daadwerkelijk nieuwe bestanden zijn gesynchroniseerd
    if (hadPending || nieuwGesynchroniseerd > 0) {
      try {
        const lokaalMeta = path.join(BACKUP_DIR, 'backup-meta.json');
        if (fs.existsSync(lokaalMeta)) {
          const meta = JSON.parse(fs.readFileSync(lokaalMeta, 'utf-8')) as Record<string, unknown>;
          fs.writeFileSync(path.join(externPad, 'backup-meta.json'), JSON.stringify(meta), 'utf-8');
        }
      } catch { /* niet-kritiek */ }
    }

    try { cleanupAll(externPad, bewaarDagen, new Date()); } catch { /* */ }

    // Diff-file (+ meta) syncen naar extern. Versleutelen indien geconfigureerd
    // — wlog bevat dezelfde gevoelige data als snapshots, dus moet dezelfde
    // encryptie volgen. Meta blijft plain (geen privégegevens, alleen tellers).
    try { await syncWlogNaarExtern(externPad, heeftEncryptie, hash, salt); } catch { /* */ }

    // Update lokale cache van externe backup-entries (voor snelle activiteit-route zonder TCP-check)
    try {
      const externBestanden = fs.readdirSync(externPad)
        .filter(f => f.startsWith('backup_') && (f.endsWith('.sqlite.gz') || f.endsWith('.sqlite.enc.gz')));
      const cacheEntries = externBestanden.map(f => {
        const stat = fs.statSync(path.join(externPad, f));
        const sc = leesSidecar(externPad, f);
        return {
          bestandsnaam: f,
          type: sc?.type ?? 'onbekend',
          beschrijving: sc?.beschrijving ?? '',
          aangemaakt_op: sc?.aangemaakt_op ?? stat.mtime.toISOString(),
          apparaat_id: sc?.apparaat_id ?? '',
          versleuteld: f.endsWith('.sqlite.enc.gz'),
          grootte: stat.size,
        };
      });
      fs.writeFileSync(
        path.join(BACKUP_DIR, 'backup-activiteit-extern.json.gz'),
        zlib.gzipSync(Buffer.from(JSON.stringify(cacheEntries), 'utf-8'))
      );
    } catch { /* extern niet bereikbaar of scan mislukt */ }
  } catch (err) {
    console.error('[gatekeeper] Fout tijdens sync:', err);
  } finally {
    gatekeeperTickActief = false;
  }
}

/** Trigger een directe sync-poging — fire-and-forget. Bedoeld voor aanroep
 *  vanuit de backup-write zodat een nieuwe backup niet hoeft te wachten op
 *  de volgende interval-tick. Re-entrancy guard zorgt dat parallelle calls
 *  geen dubbele sync veroorzaken. */
export function triggerGatekeeperTick(): void {
  void gatekeeperTick();
}

let gatekeeperTimer: NodeJS.Timeout | null = null;

function planVolgendeGatekeeperTick(): void {
  if (gatekeeperTimer) clearTimeout(gatekeeperTimer);
  try {
    const db = getDb();
    const row = db.prepare('SELECT backup_extern_interval FROM instellingen WHERE id = 1')
      .get() as { backup_extern_interval: number } | undefined;
    const intervalMs = (row?.backup_extern_interval ?? 60) * 1000;
    gatekeeperTimer = setTimeout(async () => {
      await gatekeeperTick();
      planVolgendeGatekeeperTick();
    }, intervalMs);
  } catch {
    // DB nog niet beschikbaar — probeer over 10s opnieuw
    gatekeeperTimer = setTimeout(planVolgendeGatekeeperTick, 10_000);
  }
}

export function startGatekeeperWorker(): void {
  // Eerste tick uitgesteld via setTimeout — voorkomt dat de dev-server opstart blokkeert
  // op een TCP- of fs-check wanneer het externe pad (tijdelijk) onbereikbaar is.
  setTimeout(() => {
    gatekeeperTick().then(planVolgendeGatekeeperTick).catch(planVolgendeGatekeeperTick);
  }, 2000);

  const shutdown = async () => {
    if (gatekeeperTimer) { clearTimeout(gatekeeperTimer); gatekeeperTimer = null; }
    await gatekeeperTick();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT',  shutdown);
}

// ---------------------------------------------------------------------------

/**
 * Leest een binary backup-bestand (.sqlite.gz of .sqlite.enc.gz), schrijft de
 * uitgepakte SQLite-DB naar een tmp-bestand en retourneert het pad. Caller is
 * verantwoordelijk voor het opruimen van het tmp-bestand na gebruik.
 */
export async function leesBackupNaarTmp(bestandsPad: string, wachtwoordHash?: string, salt?: string): Promise<string> {
  const raw = await fsp.readFile(bestandsPad);
  let gzipped: Buffer;
  if (bestandsPad.endsWith('.sqlite.enc.gz') || bestandsPad.endsWith('.enc.gz')) {
    if (!wachtwoordHash || !salt) throw new Error('Wachtwoord is vereist voor versleutelde backups.');
    gzipped = ontsleutel(raw, wachtwoordHash, salt);
  } else {
    gzipped = raw;
  }
  const dbBuffer = await gunzipAsync(gzipped);
  const tmpPad = path.join(BACKUP_DIR, `.restore-${process.pid}-${Date.now()}.sqlite`);
  await fsp.writeFile(tmpPad, dbBuffer);
  return tmpPad;
}
