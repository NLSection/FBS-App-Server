// FILE: backupTabellen.ts
//
// Server-side backup-dekking check. De pure constanten leven in
// config/backupTabellen.ts zodat client components ze kunnen importeren
// zonder de better-sqlite3/fs chain mee te trekken.

import getDb from './db';
import { BACKUP_TABELLEN, NIET_BACKUP_TABELLEN } from '@/config/backupTabellen';

export { BACKUP_TABELLEN, NIET_BACKUP_TABELLEN };

/**
 * Dev-warning: logt elke tabel in de DB die noch in BACKUP_TABELLEN noch in
 * NIET_BACKUP_TABELLEN voorkomt. Voorkomt dat nieuwe tabellen stilletjes buiten
 * de backup/restore vallen. Draait alleen in dev-mode.
 */
export function controleerBackupDekking(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const db = getDb();
    const aanwezig = (db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]).map(r => r.name);
    const bekende = new Set<string>([...BACKUP_TABELLEN, ...NIET_BACKUP_TABELLEN]);
    const ontbrekend = aanwezig.filter(t => !bekende.has(t));
    if (ontbrekend.length > 0) {
      console.warn(
        `[backup] WAARSCHUWING — onbekende tabel(len): ${ontbrekend.join(', ')}. ` +
        `Voeg toe aan BACKUP_TABELLEN of NIET_BACKUP_TABELLEN in lib/backupTabellen.ts.`
      );
    }
    const aanwezigSet = new Set(aanwezig);
    const verdwenen = BACKUP_TABELLEN.filter(t => !aanwezigSet.has(t));
    if (verdwenen.length > 0) {
      console.warn(
        `[backup] WAARSCHUWING — BACKUP_TABELLEN verwijst naar niet-bestaande tabel(len): ${verdwenen.join(', ')}. ` +
        `Haal uit config/backupTabellen.ts — restore crasht anders op oude backups.`
      );
    }
  } catch (err) {
    console.warn('[backup] Dekking-check mislukt:', err);
  }
}
