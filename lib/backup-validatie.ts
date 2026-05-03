// Bestandsnaam-validatie voor restore-import. Gedeeld door client (BackupRestore.tsx)
// en server (api/restore). Naam-patroon volgt de bestanden die anchor.ts/backup.ts
// schrijven: backup_anker_<datum>.sqlite(.enc)?.gz en legacy backup_<ts>.sqlite(.enc)?.gz.
export const BESTANDS_REGEX = /^backup_(anker_)?[\d_-]+\.sqlite(\.enc)?\.gz$/;

export type ValidatieResultaat = { ok: true } | { ok: false; reden: string };

export function valideerBackupNaam(naam: string): ValidatieResultaat {
  if (BESTANDS_REGEX.test(naam)) return { ok: true };

  if (/^wlog_.+\.ndjson(\.enc)?\.gz$/.test(naam)) {
    return { ok: false, reden: 'Dit is een wijzig-log (diff-bestand), niet een complete backup. Importeer het bijbehorende anker (backup_anker_<datum>.sqlite.gz) — de wijzigingen op die datum zijn daar automatisch in opgenomen.' };
  }
  if (naam.endsWith('.meta.json') || naam === 'backup-meta.json') {
    return { ok: false, reden: 'Dit is een metadata-bestand, geen backup. Kies het bijbehorende .sqlite.gz of .sqlite.enc.gz bestand.' };
  }
  if (naam === 'backup-activiteit-extern.json.gz') {
    return { ok: false, reden: 'Dit is een activiteit-logbestand voor externe sync, geen backup.' };
  }
  return { ok: false, reden: 'Niet herkend als geldige FBS backup. Verwacht: backup_anker_<datum>.sqlite.gz of backup_anker_<datum>.sqlite.enc.gz.' };
}
