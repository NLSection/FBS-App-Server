// FILE: route.ts (api/reset)
// AANGEMAAKT: 30-03-2026 10:00
// VERSIE: 2
// GEWIJZIGD: 07-04-2026
//
// WIJZIGINGEN (07-04-2026):
// - Tabellen dynamisch ophalen uit sqlite_master (future-proof)
// - Foreign keys uitgeschakeld tijdens reset

import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { BACKUP_DIR } from '@/lib/backup';
import fs from 'fs';
import path from 'path';

export function POST() {
  try {
    const db = getDb();
    const tabellen = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all() as { name: string }[];

    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      for (const { name } of tabellen) {
        if (name === 'budgetten_potjes') {
          // Beschermde categorieën (Omboekingen, Vaste Posten, Overige Posten) blijven
          // staan zodat hun id en koppelingen behouden blijven
          db.prepare(`DELETE FROM "${name}" WHERE beschermd = 0`).run();
        } else {
          db.prepare(`DELETE FROM "${name}"`).run();
        }
      }
    })();
    db.pragma('foreign_keys = ON');
    db.prepare('INSERT INTO instellingen (id, maand_start_dag, backup_versie) VALUES (1, 27, 0)').run();

    // Safety net: zorg dat de drie beschermde rijen bestaan, ook na een eerste-keer
    // reset op een database waar ze (door een oudere bug) nog niet zijn aangemaakt
    db.prepare("INSERT OR IGNORE INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Omboekingen', 'potje', NULL, 1, '#00BCD4')").run();
    db.prepare("INSERT OR IGNORE INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Vaste Posten', 'potje', NULL, 1, '#748ffc')").run();
    db.prepare("INSERT OR IGNORE INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Overige Posten', 'potje', NULL, 1, '#f4a7b9')").run();

    // backup-meta.json verwijderen zodat het backup-systeem geen oude versie terugzet
    const metaPath = path.join(BACKUP_DIR, 'backup-meta.json');
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
