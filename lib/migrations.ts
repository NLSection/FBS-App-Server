// FILE: migrations.ts
// AANGEMAAKT: 25-03-2026 10:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 16:45
//
// WIJZIGINGEN (03-04-2026 16:45):
// - Stap 14: kolom laatst_herstelde_backup voor cross-device backup sync
// WIJZIGINGEN (31-03-2026 20:00):
// - Stap 12: tabel transactie_aanpassingen aangemaakt; bestaande aanpassingen gemigreerd uit transacties
// WIJZIGINGEN (30-03-2026 21:00):
// - Stap 3: kolom toelichting TEXT toegevoegd aan categorieen
// WIJZIGINGEN (30-03-2026 19:00):
// - Stap 3: kolom toelichting TEXT toegevoegd aan transacties
// WIJZIGINGEN (25-03-2026 18:30):
// - Initiële aanmaak: CREATE TABLE IF NOT EXISTS voor imports en transacties
// - Tabellen rekeningen en vaste_lasten_config toegevoegd
// - verwachte_dag en verwacht_bedrag kolommen toegevoegd aan vaste_lasten_config
// - UNIQUE INDEX op volgnummer toegevoegd voor duplicaatdetectie
// - Tabel categorieen toegevoegd
// - Idempotente migratie type systeem: overig/vast/spaar/omboeking → normaal-af/bij + omboeking-af/bij
// WIJZIGINGEN (25-03-2026 19:30):
// - Tabel budgetten_potjes toegevoegd met standaard seed-records
// WIJZIGINGEN (25-03-2026 21:00):
// - Tabel instellingen toegevoegd met seed maand_start_dag = 27
// WIJZIGINGEN (26-03-2026 17:00):
// - Kolommen handmatig_gecategoriseerd en originele_datum toegevoegd aan transacties
// - Kolom kleur toegevoegd aan budgetten_potjes
// - Stap 6: seed kleuren voor bestaande budgetten_potjes records
// WIJZIGINGEN (26-03-2026 18:00):
// - Stap 7: cleanup transacties/imports zonder volgnummer (geïmporteerd vóór kolomnaam-fix)
// - Stap 8: herseeden badge-kleuren verwijderd (overschreef user-kleuren); Omboekingen als beschermde categorie; Vaste Lasten/Overige Uitgaven ontgrendeld
// WIJZIGINGEN (30-03-2026 00:00):
// - Stap 9: eenmalige migratie naar zacht kleurenpalet; auto-kleur kiest maximale hue-afstand
// WIJZIGINGEN (26-03-2026 19:00):
// - Stap 3: kolom fout_geboekt INTEGER DEFAULT 0 toegevoegd aan transacties
// - Stap 8: Overige Uitgaven kleur gewijzigd van #a0a8c0 naar #63e6be
// WIJZIGINGEN (30-03-2026 12:00):
// - 'type' kolom verwijderd uit seed INSERT voor budgetten_potjes (kolom bestaat niet meer)
// - Seed voor budgetten_potjes verwijderd: voorkomt dat categorieën na reset opnieuw verschijnen
// WIJZIGINGEN (30-03-2026 16:00):
// - Stap 10: koppeltabel budgetten_potjes_rekeningen aangemaakt; bestaande rekening_id gemigreerd

import os from 'node:os';
import getDb from '@/lib/db';
import { BACKUP_TABELLEN } from '@/config/backupTabellen';

// Huidig schema-versienummer. Ophogen bij elke release met schema-wijzigingen.
export const SCHEMA_VERSION = 83;

// Nieuwe transacties tabel DDL — gedeeld door fresh install en migratie
const TRANSACTIES_DDL = `
  CREATE TABLE transacties (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id                   INTEGER NOT NULL REFERENCES imports(id),

    -- Rabobank CSV kolommen
    iban_bban                   TEXT,
    munt                        TEXT,
    bic                         TEXT,
    volgnummer                  TEXT,
    datum                       TEXT,
    rentedatum                  TEXT,
    bedrag                      REAL,
    saldo_na_trn                REAL,
    tegenrekening_iban_bban     TEXT,
    naam_tegenpartij            TEXT,
    naam_uiteindelijke_partij   TEXT,
    naam_initierende_partij     TEXT,
    bic_tegenpartij             TEXT,
    code                        TEXT,
    batch_id                    TEXT,
    transactiereferentie        TEXT,
    machtigingskenmerk          TEXT,
    incassant_id                TEXT,
    betalingskenmerk            TEXT,
    omschrijving_1              TEXT,
    omschrijving_2              TEXT,
    omschrijving_3              TEXT,
    reden_retour                TEXT,
    oorspr_bedrag               REAL,
    oorspr_munt                 TEXT,
    koers                       REAL,

    -- App-velden
    type          TEXT NOT NULL DEFAULT 'normaal-af'
                      CHECK(type IN ('normaal-af','normaal-bij','omboeking-af','omboeking-bij')),
    status        TEXT NOT NULL DEFAULT 'nieuw'
                      CHECK(status IN ('nieuw','verwerkt')),
    categorie_id  INTEGER
  )
`;

export function runMigrations(): void {
  const db = getDb();

  // Sla over als schema al up-to-date is (normale app-start na eerste migratie)
  const currentVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  if (currentVersion >= SCHEMA_VERSION) {
    // Safety: idempotente kolom-existence checks voor velden die via een nieuwe release
    // erbij gekomen zijn. Voorkomt "no such column" wanneer user_version al op SCHEMA_VERSION
    // staat maar een migratie-stap onverhoopt niet alle kolommen had gemaakt.
    ensureTrendPanelsKolommen(db);
    ensureTrendConsolidatieTabellen(db);
    ensureTrendPanelSeriesConsolidatieCheck(db);
    // Triggers altijd opnieuw bouwen — vangnet voor het geval een eerdere run
    // ze niet had aangemaakt of een tabel-rebuild ze heeft weggegooid.
    herbouwWijzigingTriggers(db);
    return;
  }

  // ── Stap 1: Type-systeem migratie (idempotent) ────────────────────────────
  // Check of de transacties tabel nog het oude type systeem heeft
  const schemaRij = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transacties'")
    .get() as { sql: string } | undefined;

  if (schemaRij?.sql?.includes("'overig'")) {
    db.exec('PRAGMA foreign_keys=OFF');
    db.transaction(() => {
      db.exec('ALTER TABLE transacties RENAME TO transacties_oud');
      db.exec(TRANSACTIES_DDL);
      db.exec(`
        INSERT INTO transacties
        SELECT
          id, import_id,
          iban_bban, munt, bic, volgnummer, datum, rentedatum,
          bedrag, saldo_na_trn,
          tegenrekening_iban_bban, naam_tegenpartij,
          naam_uiteindelijke_partij, naam_initierende_partij,
          bic_tegenpartij, code, batch_id, transactiereferentie,
          machtigingskenmerk, incassant_id, betalingskenmerk,
          omschrijving_1, omschrijving_2, omschrijving_3,
          reden_retour, oorspr_bedrag, oorspr_munt, koers,
          CASE type
            WHEN 'vast'      THEN 'normaal-af'
            WHEN 'overig'    THEN CASE WHEN bedrag < 0 THEN 'normaal-af' ELSE 'normaal-bij' END
            WHEN 'spaar'     THEN CASE WHEN bedrag < 0 THEN 'omboeking-af' ELSE 'omboeking-bij' END
            WHEN 'omboeking' THEN CASE WHEN bedrag < 0 THEN 'omboeking-af' ELSE 'omboeking-bij' END
            ELSE 'normaal-af'
          END,
          status, categorie_id
        FROM transacties_oud
      `);
      db.exec('DROP TABLE transacties_oud');
    })();
    db.exec('PRAGMA foreign_keys=ON');
  }

  // ── Stap 2: Initiële tabellen aanmaken (fresh install) ───────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      bestandsnaam        TEXT    NOT NULL,
      geimporteerd_op     TEXT    NOT NULL,
      aantal_transacties  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rekeningen (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      iban       TEXT    NOT NULL UNIQUE,
      naam       TEXT    NOT NULL,
      type       TEXT    NOT NULL CHECK(type IN ('betaal','spaar')),
      kleur      TEXT    DEFAULT NULL,
      kleur_auto INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS vaste_posten_config (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      iban         TEXT NOT NULL,
      naam         TEXT NOT NULL,
      omschrijving TEXT,
      label        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categorieen (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      iban                   TEXT,
      naam_zoekwoord         TEXT,
      naam_origineel         TEXT,
      omschrijving_zoekwoord TEXT,
      categorie              TEXT NOT NULL,
      subcategorie           TEXT,
      type                   TEXT NOT NULL DEFAULT 'alle'
                                 CHECK(type IN ('normaal-af','normaal-bij','omboeking-af','omboeking-bij','alle')),
      laatste_gebruik        TEXT
    );

    CREATE TABLE IF NOT EXISTS budgetten_potjes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      naam        TEXT    NOT NULL UNIQUE,
      type        TEXT    NOT NULL CHECK(type IN ('budget','potje')),
      rekening_id INTEGER REFERENCES rekeningen(id),
      beschermd   INTEGER NOT NULL DEFAULT 0,
      kleur       TEXT    DEFAULT NULL,
      kleur_auto  INTEGER NOT NULL DEFAULT 1
    );
  `);

  // transacties apart: gebruikt de gedeelde DDL-constante (zonder IF NOT EXISTS)
  const transactiesBestaatAl = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transacties'")
    .get();
  if (!transactiesBestaatAl) {
    db.exec(TRANSACTIES_DDL);
  }

  // ── Stap 3: Idempotente kolom- en indexmigraties ─────────────────────────
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transacties_volgnummer ON transacties(volgnummer)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transacties_datum ON transacties(datum)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_categorieen_categorie ON categorieen(categorie)');
  try { db.exec('ALTER TABLE vaste_posten_config ADD COLUMN verwachte_dag INTEGER'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE vaste_posten_config ADD COLUMN verwacht_bedrag REAL'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE transacties ADD COLUMN handmatig_gecategoriseerd INTEGER DEFAULT 0'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE transacties ADD COLUMN originele_datum TEXT'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE budgetten_potjes ADD COLUMN kleur TEXT'); } catch { /* bestaat al */ }
  // Defensief: type-kolom toevoegen als die op een oude DB ontbreekt (CREATE TABLE IF NOT EXISTS voegt geen kolommen toe)
  {
    const heeftType = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('budgetten_potjes') WHERE name = 'type'").get() as { n: number }).n > 0;
    if (!heeftType) {
      db.exec("ALTER TABLE budgetten_potjes ADD COLUMN type TEXT DEFAULT 'potje'");
      db.prepare("UPDATE budgetten_potjes SET type = 'potje' WHERE type IS NULL").run();
    }
  }
  try { db.exec('ALTER TABLE transacties ADD COLUMN fout_geboekt INTEGER DEFAULT 0'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE transacties ADD COLUMN toelichting TEXT'); } catch { /* bestaat al */ }
  try { db.exec('ALTER TABLE categorieen ADD COLUMN toelichting TEXT'); } catch { /* bestaat al */ }

  // ── Stap 4: Seed budgetten_potjes als tabel leeg is ──────────────────────
  // ── Stap 5: Instellingen tabel + seed ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS instellingen (
      id               INTEGER PRIMARY KEY CHECK(id = 1),
      maand_start_dag  INTEGER NOT NULL DEFAULT 27
    )
  `);
  const instLeeg = db.prepare('SELECT COUNT(*) AS n FROM instellingen').get() as { n: number };
  if (instLeeg.n === 0) {
    db.prepare('INSERT INTO instellingen (id, maand_start_dag) VALUES (1, 27)').run();
  }


  // ── Stap 6: Seed kleuren voor budgetten_potjes ────────────────────────────
  const KLEUR_PALETTE = ['#f06595','#ff8787','#ffa94d','#ffd43b','#a9e34b','#69db7c',
                         '#38d9a9','#4dabf7','#748ffc','#da77f2','#f783ac','#63e6be'];
  db.prepare("UPDATE budgetten_potjes SET kleur = '#5c7cfa' WHERE naam = 'Vaste Lasten' AND kleur IS NULL").run();
  db.prepare("UPDATE budgetten_potjes SET kleur = '#a0a8c0' WHERE naam = 'Overige Posten' AND kleur IS NULL").run();
  const zonderKleur = db.prepare('SELECT id FROM budgetten_potjes WHERE kleur IS NULL ORDER BY id ASC').all() as { id: number }[];
  const kleurStmt = db.prepare('UPDATE budgetten_potjes SET kleur = ? WHERE id = ?');
  zonderKleur.forEach((rij, index) => {
    kleurStmt.run(KLEUR_PALETTE[index % KLEUR_PALETTE.length], rij.id);
  });

  // ── Stap 8: Omboekingen als beschermde categorie + Vaste Lasten/Overige Uitgaven ontgrendeld
  const ombRij = db.prepare("SELECT id FROM budgetten_potjes WHERE naam = 'Omboekingen'").get() as { id: number } | undefined;
  if (!ombRij) {
    db.prepare("INSERT INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Omboekingen', 'potje', NULL, 1, '#00BCD4')").run();
  } else {
    db.prepare("UPDATE budgetten_potjes SET beschermd = 1 WHERE naam = 'Omboekingen'").run();
  }
  db.prepare("UPDATE budgetten_potjes SET beschermd = 0 WHERE naam = 'Vaste Lasten'").run();

  // ── Stap 9: Eenmalige migratie naar zacht kleurenpalet ─────────────────
  // Vaste toewijzing per naam — draait idempotent, alleen als kleur nog niet handmatig gewijzigd is
  const ZACHTE_KLEUREN: Record<string, string> = {
    'Vaste Lasten':     '#748ffc', // blauw
    'Overige Posten':   '#f4a7b9', // roze
    'Boodschappen':     '#7cdba8', // mint
    'Brandstof':        '#f4b77c', // warm oranje
    'Uit Eten':         '#e4a0f4', // lila
    'Uitjes':           '#8bd4f4', // hemelsblauw
    'Zorg':             '#a78bfa', // lavendel
    'Kleedgeld Max':    '#f4d87c', // zachtgeel
    'Sparen':           '#b8a7f4', // violet
  };
  const ALLE_OUDE_KLEUREN = new Set([
    '#69db7c','#ffa94d','#f783ac','#da77f2','#38d9a9','#4dabf7','#ffd43b','#ff8787','#63e6be',
    '#5c7cfa','#a0a8c0','#748ffc',
    '#7cdba8','#f4b77c','#f4a7b9','#e4a0f4','#7cf4e4','#8bd4f4','#f4d87c','#f49dad','#a7f4cb',
  ]);
  for (const [naam, kleur] of Object.entries(ZACHTE_KLEUREN)) {
    db.prepare('UPDATE budgetten_potjes SET kleur = ? WHERE naam = ? AND kleur IN (' +
      [...ALLE_OUDE_KLEUREN].map(() => '?').join(',') + ')')
      .run(kleur, naam, ...ALLE_OUDE_KLEUREN);
  }

  // ── Stap 10: Koppeltabel budgetten_potjes_rekeningen (many-to-many) ───────
  db.exec(`
    CREATE TABLE IF NOT EXISTS budgetten_potjes_rekeningen (
      potje_id    INTEGER NOT NULL REFERENCES budgetten_potjes(id) ON DELETE CASCADE,
      rekening_id INTEGER NOT NULL REFERENCES rekeningen(id) ON DELETE CASCADE,
      PRIMARY KEY (potje_id, rekening_id)
    )
  `);
  // Migreer bestaande rekening_id waarden naar de koppeltabel
  const bprLeeg = db.prepare('SELECT COUNT(*) AS n FROM budgetten_potjes_rekeningen').get() as { n: number };
  if (bprLeeg.n === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO budgetten_potjes_rekeningen (potje_id, rekening_id)
      SELECT id, rekening_id FROM budgetten_potjes WHERE rekening_id IS NOT NULL
    `).run();
  }

  // ── Stap 11: "Aangepast" als beschermd systeemitem ─────────────────────
  const aangepastRij = db.prepare("SELECT id FROM budgetten_potjes WHERE naam = 'Aangepast'").get() as { id: number } | undefined;
  if (!aangepastRij) {
    db.prepare("INSERT INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Aangepast', 'potje', NULL, 1, '#e8590c')").run();
  } else {
    db.prepare("UPDATE budgetten_potjes SET beschermd = 1 WHERE naam = 'Aangepast'").run();
  }

  // ── Stap 11b: "Vaste Posten" als beschermd systeemitem (clean install) ──
  // Op clean install bestaat 'Vaste Lasten' niet, dus de hernoem-migratie in
  // Stap 20 maakt 'Vaste Posten' niet aan. Hier idempotent seedden.
  const vastePostenRij = db.prepare("SELECT id FROM budgetten_potjes WHERE naam = 'Vaste Posten'").get() as { id: number } | undefined;
  if (!vastePostenRij) {
    db.prepare("INSERT INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Vaste Posten', 'potje', NULL, 1, '#748ffc')").run();
  }

  // ── Stap 12: transactie_aanpassingen tabel + migratie ───────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactie_aanpassingen (
      transactie_id             INTEGER PRIMARY KEY REFERENCES transacties(id) ON DELETE CASCADE,
      datum_aanpassing          TEXT,
      categorie_id              INTEGER REFERENCES categorieen(id),
      categorie                 TEXT,
      subcategorie              TEXT,
      status                    TEXT NOT NULL DEFAULT 'nieuw',
      handmatig_gecategoriseerd INTEGER NOT NULL DEFAULT 0,
      fout_geboekt              INTEGER NOT NULL DEFAULT 0,
      toelichting               TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ta_transactie_id ON transactie_aanpassingen(transactie_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ta_datum ON transactie_aanpassingen(datum_aanpassing)');

  // Eenmalige datamisgratie: kopieer bestaande aanpassingen uit transacties
  // Alleen uitvoeren als de legacy-kolom 'categorie' nog op de transacties tabel staat
  const heeftCategorieKolom = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('transacties') WHERE name = 'categorie'").get() as { n: number }).n > 0;
  const aanpassingenLeeg = db.prepare('SELECT COUNT(*) AS n FROM transactie_aanpassingen').get() as { n: number };
  if (aanpassingenLeeg.n === 0 && heeftCategorieKolom) {
    db.transaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO transactie_aanpassingen
          (transactie_id, datum_aanpassing, categorie_id, categorie, subcategorie,
           status, handmatig_gecategoriseerd, fout_geboekt, toelichting)
        SELECT
          id,
          CASE WHEN originele_datum IS NOT NULL THEN datum ELSE NULL END,
          CASE WHEN categorie_id IS NOT NULL AND EXISTS (SELECT 1 FROM categorieen WHERE id = transacties.categorie_id) THEN categorie_id ELSE NULL END,
          categorie,
          subcategorie,
          COALESCE(status, 'nieuw'),
          COALESCE(handmatig_gecategoriseerd, 0),
          COALESCE(fout_geboekt, 0),
          toelichting
        FROM transacties
        WHERE categorie_id IS NOT NULL
           OR categorie IS NOT NULL
           OR originele_datum IS NOT NULL
           OR status = 'verwerkt'
           OR COALESCE(handmatig_gecategoriseerd, 0) = 1
           OR COALESCE(fout_geboekt, 0) = 1
           OR toelichting IS NOT NULL
      `).run();
      // Herstel originele importdatum voor verplaatste transacties
      db.prepare('UPDATE transacties SET datum = originele_datum WHERE originele_datum IS NOT NULL').run();
    })();
  }

  // ── Stap 13: Dashboard weergave-instellingen ─────────────────────────────
  try { db.exec('ALTER TABLE instellingen ADD COLUMN dashboard_bls_tonen     INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE instellingen ADD COLUMN dashboard_cat_tonen     INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE instellingen ADD COLUMN dashboard_bls_uitgeklapt INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE instellingen ADD COLUMN dashboard_cat_uitgeklapt INTEGER NOT NULL DEFAULT 1'); } catch {}

  // ── Stap 14: Laatst herstelde backup bijhouden (cross-device sync) ───────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN laatst_herstelde_backup TEXT DEFAULT NULL"); } catch {}

  // ── Stap 15: Transacties in subcategorieën standaard uitgeklapt ─────────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN cat_trx_uitgeklapt INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN cat_uitklappen INTEGER DEFAULT 1"); } catch {}

  // ── Stap 16: Vaste posten overzicht instellingen ───────────────────────
  // Kolom wordt aangemaakt als vaste_lasten_* (legacy) en in stap 20 hernoemd.
  // Als vaste_posten_* al bestaat (door eerdere migratie) slaan we over.
  {
    const heeftNieuw = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'vaste_posten_overzicht_maanden'").get() as { n: number }).n > 0;
    if (!heeftNieuw) {
      try { db.exec("ALTER TABLE instellingen ADD COLUMN vaste_lasten_overzicht_maanden INTEGER NOT NULL DEFAULT 4"); } catch {}
      try { db.exec("ALTER TABLE instellingen ADD COLUMN vaste_lasten_afwijking_procent INTEGER NOT NULL DEFAULT 5"); } catch {}
    }
  }

  // ── Stap 17: BLS transacties standaard uitgeklapt ───────────────────────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN bls_trx_uitgeklapt INTEGER NOT NULL DEFAULT 0"); } catch {}

  // ── Stap 18: Kleur kolom op rekeningen ──────────────────────────────────
  try { db.exec("ALTER TABLE rekeningen ADD COLUMN kleur TEXT DEFAULT NULL"); } catch {}

  // ── Stap 19: Rekeninggroepen ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS rekening_groepen (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      naam     TEXT    NOT NULL,
      volgorde INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rekening_groep_rekeningen (
      groep_id    INTEGER NOT NULL REFERENCES rekening_groepen(id) ON DELETE CASCADE,
      rekening_id INTEGER NOT NULL REFERENCES rekeningen(id) ON DELETE CASCADE,
      PRIMARY KEY (groep_id, rekening_id)
    )
  `);
  // Migreer bestaande beheerde rekeningen naar een standaard groep
  const groepenLeeg = db.prepare('SELECT COUNT(*) AS n FROM rekening_groepen').get() as { n: number };
  const heeftBeheerd2 = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('rekeningen') WHERE name = 'beheerd'").get() as { n: number }).n > 0;
  const beheerdeRekeningen = heeftBeheerd2 ? db.prepare('SELECT id FROM rekeningen WHERE beheerd = 1').all() as { id: number }[] : [];
  if (groepenLeeg.n === 0 && beheerdeRekeningen.length > 0) {
    const gr = db.prepare("INSERT INTO rekening_groepen (naam, volgorde) VALUES ('Samengevoegde rekeningen', 0)").run();
    const groepId = Number(gr.lastInsertRowid);
    const insGr = db.prepare('INSERT OR IGNORE INTO rekening_groep_rekeningen (groep_id, rekening_id) VALUES (?, ?)');
    for (const r of beheerdeRekeningen) {
      insGr.run(groepId, r.id);
    }
  }

  // ── Stap 20: Vaste Lasten → Vaste Posten hernoem + vergrendeling ────────
  // Tabel hernoemen
  const heeftOudeTabel = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='vaste_lasten_config'").get() as { n: number };
  const heeftNieuweTabel = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='vaste_posten_config'").get() as { n: number };
  if (heeftOudeTabel.n > 0 && heeftNieuweTabel.n === 0) {
    db.exec('ALTER TABLE vaste_lasten_config RENAME TO vaste_posten_config');
  } else if (heeftOudeTabel.n > 0 && heeftNieuweTabel.n > 0) {
    // Beide tabellen bestaan (door eerdere mislukte migratie) — verwijder de lege oude
    db.exec('DROP TABLE vaste_lasten_config');
  }
  // Kolommen hernoemen in instellingen
  const heeftOudeKolom = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'vaste_lasten_overzicht_maanden'").get() as { n: number }).n > 0;
  const heeftNieuweKolom = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'vaste_posten_overzicht_maanden'").get() as { n: number }).n > 0;
  if (heeftOudeKolom && !heeftNieuweKolom) {
    db.exec('ALTER TABLE instellingen RENAME COLUMN vaste_lasten_overzicht_maanden TO vaste_posten_overzicht_maanden');
    db.exec('ALTER TABLE instellingen RENAME COLUMN vaste_lasten_afwijking_procent TO vaste_posten_afwijking_procent');
  }
  // Categorie hernoemen in budgetten_potjes + propagatie
  const vlRij = db.prepare("SELECT id FROM budgetten_potjes WHERE naam = 'Vaste Lasten'").get() as { id: number } | undefined;
  if (vlRij) {
    db.prepare("UPDATE budgetten_potjes SET naam = 'Vaste Posten', beschermd = 1 WHERE id = ?").run(vlRij.id);
    db.prepare("UPDATE categorieen SET categorie = 'Vaste Posten' WHERE categorie = 'Vaste Lasten'").run();
    db.prepare("UPDATE transactie_aanpassingen SET categorie = 'Vaste Posten' WHERE categorie = 'Vaste Lasten'").run();
  }
  // Als Vaste Posten al bestaat maar niet beschermd is
  db.prepare("UPDATE budgetten_potjes SET beschermd = 1 WHERE naam = 'Vaste Posten'").run();

  // ── Stap 21: Drop beheerd kolom van rekeningen ──────────────────────────
  const heeftBeheerd = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('rekeningen') WHERE name = 'beheerd'").get() as { n: number }).n > 0;
  if (heeftBeheerd) {
    db.exec('ALTER TABLE rekeningen DROP COLUMN beheerd');
  }

  // ── Stap 22: Subcategorieën tabel ─────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS subcategorieen (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      categorie  TEXT NOT NULL,
      naam       TEXT NOT NULL,
      UNIQUE(categorie, naam)
    )
  `);
  // Populeer vanuit bestaande data (eenmalig)
  const subLeeg = db.prepare('SELECT COUNT(*) AS n FROM subcategorieen').get() as { n: number };
  if (subLeeg.n === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO subcategorieen (categorie, naam)
      SELECT DISTINCT categorie, subcategorie FROM categorieen
      WHERE subcategorie IS NOT NULL AND subcategorie != ''
    `).run();
    db.prepare(`
      INSERT OR IGNORE INTO subcategorieen (categorie, naam)
      SELECT DISTINCT categorie, subcategorie FROM transactie_aanpassingen
      WHERE subcategorie IS NOT NULL AND subcategorie != ''
    `).run();
  }

  // ── Stap 23: Backup instellingen ─────────────────────────────────────────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_bewaar_dagen INTEGER NOT NULL DEFAULT 7"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_min_bewaard INTEGER NOT NULL DEFAULT 3"); } catch {}

  // ── Stap 24: Backup encryptie ────────────────────────────────────────────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_encryptie_hash TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_encryptie_hint TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_encryptie_salt TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_herstelsleutel_hash TEXT DEFAULT NULL"); } catch {}

  // ── Stap 25: Apparaat-ID en extern backup pad ──────────────────────────
  try { db.exec("ALTER TABLE instellingen ADD COLUMN apparaat_id TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_extern_pad TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE instellingen ADD COLUMN backup_versie INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Genereer apparaat-ID als die nog niet bestaat
  const appIdRow = db.prepare('SELECT apparaat_id FROM instellingen WHERE id = 1').get() as { apparaat_id: string | null } | undefined;
  if (appIdRow && !appIdRow.apparaat_id) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare('UPDATE instellingen SET apparaat_id = ? WHERE id = 1').run(id);
  }

  // ── Stap 7: Cleanup pre-fix imports zonder volgnummer ────────────────────
  // Transacties geïmporteerd vóór de 'Volgnr'-fix hebben volgnummer = NULL.
  // Als er transacties zijn maar geen enkel volgnummer gevuld is, zijn ze
  // onbruikbaar voor deduplicatie en worden ze verwijderd zodat herImport correct werkt.
  const totaalTrn    = db.prepare('SELECT COUNT(*) AS n FROM transacties').get() as { n: number };
  const metVolgNr    = db.prepare('SELECT COUNT(*) AS n FROM transacties WHERE volgnummer IS NOT NULL').get() as { n: number };
  if (totaalTrn.n > 0 && metVolgNr.n === 0) {
    db.transaction(() => {
      db.exec('DELETE FROM transacties');
      db.exec('DELETE FROM imports');
    })();
  }

  // ── Stap 26: Vaste posten buffer instelling ───────────────────────────────
  try { db.exec('ALTER TABLE instellingen ADD COLUMN vaste_posten_buffer REAL NOT NULL DEFAULT 0'); } catch {}

  // ── Stap 27: VP groepen (samenvoegen subcategorieën op vaste posten pagina) ─
  db.exec(`
    CREATE TABLE IF NOT EXISTS vp_groepen (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL UNIQUE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vp_groep_subcategorieen (
      groep_id    INTEGER NOT NULL REFERENCES vp_groepen(id) ON DELETE CASCADE,
      subcategorie TEXT NOT NULL,
      UNIQUE(subcategorie)
    )
  `);

  // ── Stap 28: VP volgorde en negeer ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vp_volgorde (
      sleutel  TEXT NOT NULL PRIMARY KEY,
      volgorde INTEGER NOT NULL
    )
  `);

  // ── Stap 29: VP volgorde uitbreiden met periode-scope ────────────────────
  if (currentVersion < 29) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS vp_volgorde_new (
          sleutel  TEXT NOT NULL,
          periode  TEXT NOT NULL DEFAULT 'permanent',
          volgorde INTEGER NOT NULL,
          PRIMARY KEY (sleutel, periode)
        )
      `);
      db.exec(`INSERT OR IGNORE INTO vp_volgorde_new (sleutel, periode, volgorde) SELECT sleutel, 'permanent', volgorde FROM vp_volgorde`);
      db.exec(`DROP TABLE vp_volgorde`);
      db.exec(`ALTER TABLE vp_volgorde_new RENAME TO vp_volgorde`);
    })();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS vp_negeer (
      regel_id INTEGER NOT NULL REFERENCES categorieen(id) ON DELETE CASCADE,
      periode  TEXT NOT NULL,
      UNIQUE(regel_id, periode)
    )
  `);

  // ── Stap 30: Trend-panels ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_panels (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      titel               TEXT NOT NULL DEFAULT 'Nieuwe trend',
      databron            TEXT NOT NULL DEFAULT 'saldo'
                              CHECK(databron IN ('saldo','uitgaven','inkomsten')),
      grafiek_type        TEXT NOT NULL DEFAULT 'lijn'
                              CHECK(grafiek_type IN ('lijn','staaf')),
      weergave            TEXT NOT NULL DEFAULT 'per_maand'
                              CHECK(weergave IN ('per_maand','cumulatief')),
      toon_jaarknoppen    INTEGER NOT NULL DEFAULT 1,
      toon_maandknoppen   INTEGER NOT NULL DEFAULT 0,
      toon_alle_jaren     INTEGER NOT NULL DEFAULT 1,
      volgorde            INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_panel_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id  INTEGER NOT NULL REFERENCES trend_panels(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK(item_type IN ('rekening','categorie','subcategorie')),
      item_id   INTEGER NOT NULL,
      UNIQUE(panel_id, item_type, item_id)
    )
  `);

  // ── Stap 30b: aantal_nieuw kolom op imports ────────────────────────────────
  const importKolommen = db.prepare("PRAGMA table_info(imports)").all() as { name: string }[];
  if (!importKolommen.some(k => k.name === 'aantal_nieuw')) {
    db.exec(`ALTER TABLE imports ADD COLUMN aantal_nieuw INTEGER`);
  }

  // ── Stap 31: Periode configuraties ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS periode_configuraties (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      maand_start_dag INTEGER NOT NULL,
      geldig_vanaf    TEXT NOT NULL UNIQUE,
      aangemaakt_op   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  // Migreer bestaande maand_start_dag als tabel leeg is
  const periodeConfigLeeg = db.prepare('SELECT COUNT(*) AS n FROM periode_configuraties').get() as { n: number };
  if (periodeConfigLeeg.n === 0) {
    const instRij = db.prepare('SELECT maand_start_dag FROM instellingen WHERE id = 1').get() as { maand_start_dag: number } | undefined;
    const dag = instRij?.maand_start_dag ?? 27;
    db.prepare("INSERT INTO periode_configuraties (maand_start_dag, geldig_vanaf) VALUES (?, '0000-01')").run(dag);
  }

  // ── Stap 32: UNIQUE constraint van geldig_vanaf verwijderen ─────────────────
  // Meerdere rijen met dezelfde geldig_vanaf zijn nu toegestaan (elke wijziging
  // maakt een nieuwe rij aan, aangemaakt_op DESC bepaalt de winnaar).
  db.exec(`
    CREATE TABLE IF NOT EXISTS periode_configuraties_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      maand_start_dag INTEGER NOT NULL,
      geldig_vanaf    TEXT NOT NULL,
      aangemaakt_op   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    INSERT INTO periode_configuraties_new (id, maand_start_dag, geldig_vanaf, aangemaakt_op)
      SELECT id, maand_start_dag, geldig_vanaf, aangemaakt_op FROM periode_configuraties;
    DROP TABLE periode_configuraties;
    ALTER TABLE periode_configuraties_new RENAME TO periode_configuraties;
  `);

  // ── Stap 33: Overige Uitgaven → Overige Posten + vergrendeling ──────────────
  const ovRij = db.prepare("SELECT id FROM budgetten_potjes WHERE naam = 'Overige Uitgaven'").get() as { id: number } | undefined;
  if (ovRij) {
    db.prepare("UPDATE budgetten_potjes SET naam = 'Overige Posten', beschermd = 1 WHERE id = ?").run(ovRij.id);
    db.prepare("UPDATE categorieen SET subcategorie = 'Overige Posten' WHERE subcategorie = 'Overige Uitgaven'").run();
    db.prepare("UPDATE transactie_aanpassingen SET subcategorie = 'Overige Posten' WHERE subcategorie = 'Overige Uitgaven'").run();
  } else {
    db.prepare("INSERT OR IGNORE INTO budgetten_potjes (naam, type, rekening_id, beschermd, kleur) VALUES ('Overige Posten', 'potje', NULL, 1, '#f4a7b9')").run();
    db.prepare("UPDATE budgetten_potjes SET beschermd = 1 WHERE naam = 'Overige Posten'").run();
  }

  // ── Stap 34: subcategorieen tabel bijwerken Overige Uitgaven → Overige Posten ─
  db.prepare("UPDATE subcategorieen SET naam = 'Overige Posten' WHERE naam = 'Overige Uitgaven'").run();

  // ── Stap 35: categorie-kolom propagatie Overige Uitgaven → Overige Posten ────
  db.prepare("UPDATE subcategorieen SET categorie = 'Overige Posten' WHERE categorie = 'Overige Uitgaven'").run();
  db.prepare("UPDATE categorieen SET categorie = 'Overige Posten' WHERE categorie = 'Overige Uitgaven'").run();
  db.prepare("UPDATE transactie_aanpassingen SET categorie = 'Overige Posten' WHERE categorie = 'Overige Uitgaven'").run();

  // ── Stap 36: Aangepast verwijderen uit budgetten_potjes ──────────────────────
  db.prepare("DELETE FROM budgetten_potjes WHERE naam = 'Aangepast'").run();

  // ── Stap 37: Omboekingen configuratie ────────────────────────────────────────
  try { db.exec('ALTER TABLE instellingen ADD COLUMN omboekingen_auto INTEGER NOT NULL DEFAULT 1'); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS omboeking_uitzonderingen (
      rekening_a_id INTEGER NOT NULL REFERENCES rekeningen(id) ON DELETE CASCADE,
      rekening_b_id INTEGER NOT NULL REFERENCES rekeningen(id) ON DELETE CASCADE,
      PRIMARY KEY (rekening_a_id, rekening_b_id)
    )
  `);

  // ── Stap 38: Dashboard tabbladen ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('groep', 'rekening')),
      entiteit_id INTEGER NOT NULL,
      bls_tonen INTEGER NOT NULL DEFAULT 1,
      cat_tonen INTEGER NOT NULL DEFAULT 1,
      volgorde INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Auto-seed vanuit bestaande rekeninggroepen als de tabel nog leeg is
  const tabCount = (db.prepare('SELECT COUNT(*) as n FROM dashboard_tabs').get() as { n: number }).n;
  if (tabCount === 0) {
    const groepen = db.prepare('SELECT id, volgorde FROM rekening_groepen ORDER BY volgorde ASC').all() as { id: number; volgorde: number }[];
    const insert = db.prepare('INSERT INTO dashboard_tabs (type, entiteit_id, bls_tonen, cat_tonen, volgorde) VALUES (?, ?, 1, 1, ?)');
    for (const g of groepen) insert.run('groep', g.id, g.volgorde);
  }

  // ── Stap 39: Per-tab BLS/CAT detail instellingen ──────────────────────────────
  try { db.exec('ALTER TABLE dashboard_tabs ADD COLUMN bls_trx_uitgeklapt INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE dashboard_tabs ADD COLUMN cat_uitklappen INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE dashboard_tabs ADD COLUMN cat_trx_uitgeklapt INTEGER NOT NULL DEFAULT 0'); } catch {}

  // ── Stap 40: Vaste posten "nieuw" drempel (maanden) ──────────────────────────
  try { db.exec('ALTER TABLE instellingen ADD COLUMN vaste_posten_nieuw_drempel_maanden INTEGER NOT NULL DEFAULT 12'); } catch {}

  // ── Stap 41: Categorie-regels matchen op bedrag-bereik ─────────────────────
  try { db.exec('ALTER TABLE categorieen ADD COLUMN bedrag_min REAL DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE categorieen ADD COLUMN bedrag_max REAL DEFAULT NULL'); } catch {}

  // ── Stap 42: Vaste posten subtabel-periode (eigen instelling, los van vergelijkMaanden) ─
  try { db.exec("ALTER TABLE instellingen ADD COLUMN vaste_posten_subtabel_periode TEXT NOT NULL DEFAULT '3'"); } catch {}

  // ── Stap 43: Vaste posten verberg-drempel (regel verbergen na X maanden zonder voorkomen) ─
  try { db.exec('ALTER TABLE instellingen ADD COLUMN vaste_posten_verberg_drempel_maanden INTEGER NOT NULL DEFAULT 4'); } catch {}

  // ── Stap 44: Vaste posten nieuw-drempel als TEXT — ondersteunt nu 'jaar' optie ──────
  // Voegt nieuwe TEXT kolom toe en migreert eenmalig de waarde uit de oude INTEGER kolom.
  // De oude kolom blijft bestaan voor backwards-compat met oude backups.
  {
    const heeftNieuw = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'vaste_posten_nieuw_drempel'").get() as { n: number }).n > 0;
    if (!heeftNieuw) {
      db.exec("ALTER TABLE instellingen ADD COLUMN vaste_posten_nieuw_drempel TEXT NOT NULL DEFAULT '12'");
      const heeftOudNieuw = (db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'vaste_posten_nieuw_drempel_maanden'").get() as { n: number }).n > 0;
      if (heeftOudNieuw) db.exec("UPDATE instellingen SET vaste_posten_nieuw_drempel = CAST(vaste_posten_nieuw_drempel_maanden AS TEXT) WHERE vaste_posten_nieuw_drempel_maanden IS NOT NULL");
    }
  }

  // ── Stap 45: Vaste posten overzicht/vergelijk/verberg als TEXT — ondersteunt 'jaar' optie ─
  {
    const transities = [
      { nieuw: 'vaste_posten_overzicht', oud: 'vaste_posten_overzicht_maanden', def: '4' },
      { nieuw: 'vaste_posten_vergelijk', oud: 'vaste_posten_vergelijk_maanden', def: '3' },
      { nieuw: 'vaste_posten_verberg_drempel', oud: 'vaste_posten_verberg_drempel_maanden', def: '4' },
    ];
    for (const { nieuw, oud, def } of transities) {
      const heeft = (db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = '${nieuw}'`).get() as { n: number }).n > 0;
      if (!heeft) {
        db.exec(`ALTER TABLE instellingen ADD COLUMN ${nieuw} TEXT NOT NULL DEFAULT '${def}'`);
        const heeftOud = (db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = '${oud}'`).get() as { n: number }).n > 0;
        if (heeftOud) db.exec(`UPDATE instellingen SET ${nieuw} = CAST(${oud} AS TEXT) WHERE ${oud} IS NOT NULL`);
      }
    }
  }

  // ── Stap 47: Gebruikersprofiel instelling ────────────────────────────────────
  {
    const heeft = (db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'gebruikers_profiel'`).get() as { n: number }).n > 0;
    if (!heeft) db.exec(`ALTER TABLE instellingen ADD COLUMN gebruikers_profiel TEXT DEFAULT NULL`);
  }

  // ── Stap 46: Transacties tabbladen configuratie ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS transacties_tabs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL CHECK(type IN ('groep','rekening')),
      entiteit_id INTEGER NOT NULL,
      volgorde    INTEGER NOT NULL DEFAULT 0,
      UNIQUE(type, entiteit_id)
    )
  `);

  // ── Stap 48: Update-kanaal instelling (main / test) ─────────────────────────
  {
    const heeft = (db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('instellingen') WHERE name = 'update_kanaal'`).get() as { n: number }).n > 0;
    if (!heeft) db.exec(`ALTER TABLE instellingen ADD COLUMN update_kanaal TEXT NOT NULL DEFAULT 'main'`);
  }

  // ── Stap 49: Trend-panels dashboard-model (grid-layout + series per paneel) ──
  if (currentVersion < 49) {
    // 49a: Nieuwe series-tabel (onafhankelijk van panel-rebuild)
    db.exec(`
      CREATE TABLE IF NOT EXISTS trend_panel_series (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        panel_id   INTEGER NOT NULL REFERENCES trend_panels(id) ON DELETE CASCADE,
        volgorde   INTEGER NOT NULL DEFAULT 0,
        label      TEXT,
        kleur      TEXT NOT NULL DEFAULT '#5b8def',
        as_zijde   TEXT NOT NULL DEFAULT 'links'
                       CHECK(as_zijde IN ('links','rechts')),
        serie_type TEXT NOT NULL DEFAULT 'lijn'
                       CHECK(serie_type IN ('lijn','staaf')),
        bron_type  TEXT NOT NULL
                       CHECK(bron_type IN ('rekening','categorie','subcategorie','totaal')),
        bron_id    INTEGER,
        meting     TEXT NOT NULL
                       CHECK(meting IN ('saldo','uitgaven','inkomsten','netto','aantal'))
      )
    `);

    // 49b: Data-migratie trend_panel_items → trend_panel_series.
    // Conversie alleen uitvoeren als de oude kolommen databron + grafiek_type nog bestaan op
    // trend_panels. Bij een halfweg-staat (panels al herbouwd in een afgebroken eerdere run,
    // maar items-tabel nog aanwezig) gewoon de weesachtige items-tabel droppen.
    const oudeItemsBestaat = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='trend_panel_items'`).get() as { n: number }).n > 0;
    if (oudeItemsBestaat) {
      const panelsCols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
      const heeftDatabron    = panelsCols.some(c => c.name === 'databron');
      const heeftGrafiekType = panelsCols.some(c => c.name === 'grafiek_type');

      if (heeftDatabron && heeftGrafiekType) {
        const palette = ['#5b8def', '#f97066', '#12b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const oudePanels = db.prepare(`SELECT id, databron, grafiek_type FROM trend_panels`).all() as { id: number; databron: string; grafiek_type: string }[];
        const alBestaand = db.prepare(`SELECT COUNT(*) AS n FROM trend_panel_series`).get() as { n: number };
        if (alBestaand.n === 0) {
          const insertSerie = db.prepare(`
            INSERT INTO trend_panel_series (panel_id, volgorde, kleur, as_zijde, serie_type, bron_type, bron_id, meting)
            VALUES (?, ?, ?, 'links', ?, ?, ?, ?)
          `);
          for (const p of oudePanels) {
            const items = db.prepare(`SELECT item_type, item_id FROM trend_panel_items WHERE panel_id = ? ORDER BY id ASC`).all(p.id) as { item_type: string; item_id: number }[];
            const meting = p.databron === 'saldo' ? 'saldo' : p.databron;
            const serieType = p.grafiek_type === 'staaf' ? 'staaf' : 'lijn';
            items.forEach((it, idx) => {
              insertSerie.run(p.id, idx, palette[idx % palette.length], serieType, it.item_type, it.item_id, meting);
            });
          }
        }
      }
      db.exec(`DROP TABLE trend_panel_items`);
    }

    // 49c: trend_panels rebuilden — databron/grafiek_type verwijderen (CHECK-constraints
    // blokkeren DROP COLUMN), grid-layout + as-config kolommen toevoegen. Volgorde: nieuwe
    // tabel → data overnemen → oude droppen → hernoemen. FK van trend_panel_series blijft
    // geldig omdat panel-id's behouden blijven.
    const panelCols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    const isOud = panelCols.some(c => c.name === 'databron') || panelCols.some(c => c.name === 'grafiek_type');
    if (isOud) {
      db.exec(`
        CREATE TABLE trend_panels_new (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          titel               TEXT NOT NULL DEFAULT 'Nieuwe trend',
          weergave            TEXT NOT NULL DEFAULT 'per_maand'
                                  CHECK(weergave IN ('per_maand','cumulatief')),
          toon_jaarknoppen    INTEGER NOT NULL DEFAULT 1,
          toon_maandknoppen   INTEGER NOT NULL DEFAULT 0,
          toon_alle_jaren     INTEGER NOT NULL DEFAULT 1,
          volgorde            INTEGER NOT NULL DEFAULT 0,
          grid_x              INTEGER NOT NULL DEFAULT 0,
          grid_y              INTEGER NOT NULL DEFAULT 0,
          grid_w              INTEGER NOT NULL DEFAULT 24,
          grid_h              INTEGER NOT NULL DEFAULT 12,
          x_as_schaal         TEXT NOT NULL DEFAULT 'maand'
                                  CHECK(x_as_schaal IN ('maand','kwartaal','jaar')),
          y_as_links_label    TEXT,
          y_as_rechts_label   TEXT
        )
      `);
      db.exec(`
        INSERT INTO trend_panels_new (id, titel, weergave, toon_jaarknoppen, toon_maandknoppen, toon_alle_jaren, volgorde)
        SELECT id, titel, weergave, toon_jaarknoppen, toon_maandknoppen, toon_alle_jaren, volgorde FROM trend_panels
      `);
      db.exec(`DROP TABLE trend_panels`);
      db.exec(`ALTER TABLE trend_panels_new RENAME TO trend_panels`);
    }
  }

  // ── Stap 51: Standaard-periode per trend-panel ──────────────────────────────
  {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    const heeft = (n: string) => cols.some(c => c.name === n);
    if (!heeft('standaard_jaar'))       db.exec(`ALTER TABLE trend_panels ADD COLUMN standaard_jaar INTEGER`);
    if (!heeft('standaard_maand'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN standaard_maand INTEGER`);
    if (!heeft('standaard_alle_jaren')) db.exec(`ALTER TABLE trend_panels ADD COLUMN standaard_alle_jaren INTEGER NOT NULL DEFAULT 1`);
  }

  // ── Stap 52: Bedragen omkeren optie op trend_panels ────────────────────────
  {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    if (!cols.some(c => c.name === 'bedragen_omkeren')) {
      db.exec(`ALTER TABLE trend_panels ADD COLUMN bedragen_omkeren INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // ── Stap 53: Trends-builder rastergrootte (cols) in instellingen ───────────
  {
    const cols = db.prepare(`PRAGMA table_info(instellingen)`).all() as { name: string }[];
    if (!cols.some(c => c.name === 'trends_grid_cols')) {
      db.exec(`ALTER TABLE instellingen ADD COLUMN trends_grid_cols INTEGER NOT NULL DEFAULT 48`);
    }
  }

  // ── Stap 54: Label langs lijn (textPath) optie op trend_panels ─────────────
  {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    if (!cols.some(c => c.name === 'label_langs_lijn')) {
      db.exec(`ALTER TABLE trend_panels ADD COLUMN label_langs_lijn INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // ── Stap 55: Lijn-curve type per paneel (monotone=glad / linear=recht) ─────
  {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    if (!cols.some(c => c.name === 'lijn_curve')) {
      db.exec(`ALTER TABLE trend_panels ADD COLUMN lijn_curve TEXT NOT NULL DEFAULT 'monotone'`);
    }
  }

  // ── Stap 56: Chart opties — dividers, legenda, kleuren, waarden, as-schaling ─
  {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    const heeft = (n: string) => cols.some(c => c.name === n);
    if (!heeft('toon_nullijn'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN toon_nullijn INTEGER NOT NULL DEFAULT 0`);
    if (!heeft('toon_gridlijnen'))   db.exec(`ALTER TABLE trend_panels ADD COLUMN toon_gridlijnen INTEGER NOT NULL DEFAULT 1`);
    if (!heeft('toon_legenda'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN toon_legenda INTEGER NOT NULL DEFAULT 1`);
    if (!heeft('as_kleur'))          db.exec(`ALTER TABLE trend_panels ADD COLUMN as_kleur TEXT NOT NULL DEFAULT '#2e3148'`);
    if (!heeft('toon_waarden'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN toon_waarden INTEGER NOT NULL DEFAULT 0`);
    // Per Y-as: log-schaal toggle, handmatig min/max, tick-interval (null = auto)
    if (!heeft('y_links_log'))       db.exec(`ALTER TABLE trend_panels ADD COLUMN y_links_log INTEGER NOT NULL DEFAULT 0`);
    if (!heeft('y_links_min'))       db.exec(`ALTER TABLE trend_panels ADD COLUMN y_links_min REAL`);
    if (!heeft('y_links_max'))       db.exec(`ALTER TABLE trend_panels ADD COLUMN y_links_max REAL`);
    if (!heeft('y_links_tick'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN y_links_tick REAL`);
    if (!heeft('y_rechts_log'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN y_rechts_log INTEGER NOT NULL DEFAULT 0`);
    if (!heeft('y_rechts_min'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN y_rechts_min REAL`);
    if (!heeft('y_rechts_max'))      db.exec(`ALTER TABLE trend_panels ADD COLUMN y_rechts_max REAL`);
    if (!heeft('y_rechts_tick'))     db.exec(`ALTER TABLE trend_panels ADD COLUMN y_rechts_tick REAL`);
  }

  // ── Stap 57: bron_type CHECK uitbreiden met 'rekening_groep' ───────────────
  if (currentVersion < 57) {
    const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='trend_panel_series'`).get() as { sql?: string } | undefined)?.sql ?? '';
    if (!sql.includes("'rekening_groep'")) {
      db.exec(`
        CREATE TABLE trend_panel_series_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          panel_id   INTEGER NOT NULL REFERENCES trend_panels(id) ON DELETE CASCADE,
          volgorde   INTEGER NOT NULL DEFAULT 0,
          label      TEXT,
          kleur      TEXT NOT NULL DEFAULT '#5b8def',
          as_zijde   TEXT NOT NULL DEFAULT 'links'
                         CHECK(as_zijde IN ('links','rechts')),
          serie_type TEXT NOT NULL DEFAULT 'lijn'
                         CHECK(serie_type IN ('lijn','staaf')),
          bron_type  TEXT NOT NULL
                         CHECK(bron_type IN ('rekening','rekening_groep','categorie','subcategorie','totaal')),
          bron_id    INTEGER,
          meting     TEXT NOT NULL
                         CHECK(meting IN ('saldo','uitgaven','inkomsten','netto','aantal'))
        )
      `);
      db.exec(`
        INSERT INTO trend_panel_series_new
          (id, panel_id, volgorde, label, kleur, as_zijde, serie_type, bron_type, bron_id, meting)
        SELECT id, panel_id, volgorde, label, kleur, as_zijde, serie_type, bron_type, bron_id, meting
        FROM trend_panel_series
      `);
      db.exec(`DROP TABLE trend_panel_series`);
      db.exec(`ALTER TABLE trend_panel_series_new RENAME TO trend_panel_series`);
    }
  }

  // ── Stap 58: Trends-builder raster-spacing in instellingen ─────────────────
  {
    const cols = db.prepare(`PRAGMA table_info(instellingen)`).all() as { name: string }[];
    if (!cols.some(c => c.name === 'trends_grid_spacing')) {
      db.exec(`ALTER TABLE instellingen ADD COLUMN trends_grid_spacing INTEGER NOT NULL DEFAULT 1`);
    }
  }

  // ── Stap 59: Trends-tabbladen — nieuwe tabel + tab_id op trend_panels ──────
  if (currentVersion < 59) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trend_tabs (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        naam     TEXT NOT NULL DEFAULT 'Nieuw tabblad',
        volgorde INTEGER NOT NULL DEFAULT 0
      )
    `);
    // tab_id op trend_panels (nullable eerst; default-tab aanmaken en bestaande rijen toewijzen).
    const panelCols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    if (!panelCols.some(c => c.name === 'tab_id')) {
      db.exec(`ALTER TABLE trend_panels ADD COLUMN tab_id INTEGER REFERENCES trend_tabs(id) ON DELETE CASCADE`);
    }
    // Als er al panelen zijn en nog geen tabs, maak default-tab 'Dashboard' en koppel alles eraan.
    const aantalPanels = (db.prepare(`SELECT COUNT(*) AS n FROM trend_panels`).get() as { n: number }).n;
    const aantalTabs   = (db.prepare(`SELECT COUNT(*) AS n FROM trend_tabs`).get() as { n: number }).n;
    if (aantalPanels > 0 && aantalTabs === 0) {
      const res = db.prepare(`INSERT INTO trend_tabs (naam, volgorde) VALUES (?, 0)`).run('Trends Dashboard');
      const tabId = Number(res.lastInsertRowid);
      db.exec(`UPDATE trend_panels SET tab_id = ${tabId} WHERE tab_id IS NULL`);
    }
  }

  // ── Stap 60: Onboarding voltooid-vlag in DB (ipv localStorage) ────────────
  // DIR-21: voorkeuren horen in DB. localStorage in Tauri is per-port en gaat
  // verloren bij dynamische PORT=0 herstarten — gebruiker kreeg onboarding
  // elke app-start opnieuw. DB-vlag overleeft herstart én backup-restore.
  if (currentVersion < 60) {
    try { db.exec(`ALTER TABLE instellingen ADD COLUMN onboarding_voltooid INTEGER NOT NULL DEFAULT 0`); } catch { /* bestaat al */ }
  }

  // ── Stap 61: Trend-paneel optie "actuele maand meenemen" ──────────────────
  // Standaard 0 (= alleen afgesloten periodes, bestaande gedrag). Per paneel aan
  // te zetten in de Trend Builder voor real-time inzicht in de lopende maand.
  if (currentVersion < 61) {
    try { db.exec(`ALTER TABLE trend_panels ADD COLUMN incl_actuele_maand INTEGER NOT NULL DEFAULT 0`); } catch { /* bestaat al */ }
  }

  // ── Stap 62: Beschikbare filterknoppen per trend-paneel ───────────────────
  if (currentVersion < 62) {
    try { db.exec(`ALTER TABLE trend_panels ADD COLUMN beschikbare_jaren TEXT`); } catch { /* bestaat al */ }
    try { db.exec(`ALTER TABLE trend_panels ADD COLUMN beschikbare_maanden TEXT`); } catch { /* bestaat al */ }
  }

  // ── Stap 63: Fractionele rijpositie voor proportioneel schalen bij resize ─
  if (currentVersion < 63) {
    try { db.exec(`ALTER TABLE trend_panels ADD COLUMN frac_y REAL`); } catch { /* bestaat al */ }
    try { db.exec(`ALTER TABLE trend_panels ADD COLUMN frac_h REAL`); } catch { /* bestaat al */ }
  }

  // ── Stap 64: Trend-paneel UI-config naar één JSON-kolom ───────────────────
  // Alle UI-voorkeuren van een paneel leven voortaan in `ui_config TEXT` (JSON).
  // Doel: nieuwe UI-flags toevoegen zonder schema-migratie + backups vangen
  // nieuwe velden automatisch op (één kolom, niet per veld een restore-transform).
  // Relationele velden (id, tab_id, titel, volgorde) en bulk-layout-kolommen
  // (grid_x/y/w/h) blijven kolommen voor query- en update-performance.
  //
  // Idempotent: gate op het nog bestaan van oude vlakke kolommen ('weergave'
  // is representatief — verdwijnt bij de tabel-rebuild). Na rebuild doet deze
  // stap niets, ook als de migratie na een restore opnieuw draait.
  if (currentVersion < 64) {
    const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
    const heeft = (n: string) => cols.some(c => c.name === n);
    if (heeft('weergave')) {
      if (!heeft('ui_config')) db.exec(`ALTER TABLE trend_panels ADD COLUMN ui_config TEXT`);

      // Pak per rij de vlakke waarden in één JSON-blob. Booleans worden echte
      // JSON-booleans (niet 0/1) zodat de TS-parser geen extra coercion hoeft.
      const rows = db.prepare(`SELECT * FROM trend_panels`).all() as Record<string, unknown>[];
      const update = db.prepare(`UPDATE trend_panels SET ui_config = ? WHERE id = ?`);
      const parseArr = (v: unknown): number[] | null => {
        if (typeof v !== 'string' || v === '') return null;
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; }
      };
      for (const r of rows) {
        const ui = {
          weergave: (r.weergave as string) ?? 'per_maand',
          toon_jaarknoppen: r.toon_jaarknoppen === 1,
          toon_maandknoppen: r.toon_maandknoppen === 1,
          toon_alle_jaren: r.toon_alle_jaren === 1,
          x_as_schaal: (r.x_as_schaal as string) ?? 'maand',
          y_as_links_label: (r.y_as_links_label as string | null) ?? null,
          y_as_rechts_label: (r.y_as_rechts_label as string | null) ?? null,
          standaard_jaar: (r.standaard_jaar as number | null) ?? null,
          standaard_maand: (r.standaard_maand as number | null) ?? null,
          standaard_alle_jaren: r.standaard_alle_jaren === 1,
          bedragen_omkeren: r.bedragen_omkeren === 1,
          label_langs_lijn: r.label_langs_lijn === 1,
          lijn_curve: (r.lijn_curve as string) ?? 'monotone',
          toon_nullijn: r.toon_nullijn === 1,
          toon_gridlijnen: r.toon_gridlijnen === 1,
          toon_legenda: r.toon_legenda === 1,
          as_kleur: (r.as_kleur as string) ?? '#2e3148',
          toon_waarden: r.toon_waarden === 1,
          y_links_log: r.y_links_log === 1,
          y_links_min: (r.y_links_min as number | null) ?? null,
          y_links_max: (r.y_links_max as number | null) ?? null,
          y_links_tick: (r.y_links_tick as number | null) ?? null,
          y_rechts_log: r.y_rechts_log === 1,
          y_rechts_min: (r.y_rechts_min as number | null) ?? null,
          y_rechts_max: (r.y_rechts_max as number | null) ?? null,
          y_rechts_tick: (r.y_rechts_tick as number | null) ?? null,
          incl_actuele_maand: r.incl_actuele_maand === 1,
          beschikbare_jaren: parseArr(r.beschikbare_jaren),
          beschikbare_maanden: parseArr(r.beschikbare_maanden),
          frac_y: (r.frac_y as number | null) ?? null,
          frac_h: (r.frac_h as number | null) ?? null,
        };
        update.run(JSON.stringify(ui), r.id);
      }

      // Rebuild-tabel: alleen relationele + grid-kolommen + ui_config overhouden.
      db.exec(`
        CREATE TABLE trend_panels_new (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          tab_id    INTEGER REFERENCES trend_tabs(id) ON DELETE CASCADE,
          titel     TEXT NOT NULL DEFAULT 'Nieuwe trend',
          volgorde  INTEGER NOT NULL DEFAULT 0,
          grid_x    INTEGER NOT NULL DEFAULT 0,
          grid_y    INTEGER NOT NULL DEFAULT 0,
          grid_w    INTEGER NOT NULL DEFAULT 24,
          grid_h    INTEGER NOT NULL DEFAULT 12,
          ui_config TEXT
        )
      `);
      db.exec(`
        INSERT INTO trend_panels_new (id, tab_id, titel, volgorde, grid_x, grid_y, grid_w, grid_h, ui_config)
        SELECT id, tab_id, titel, volgorde, grid_x, grid_y, grid_w, grid_h, ui_config FROM trend_panels
      `);
      db.exec(`DROP TABLE trend_panels`);
      db.exec(`ALTER TABLE trend_panels_new RENAME TO trend_panels`);
    }
  }

  // Stap 65: backup_log tabel voor traceerbare backup-geschiedenis.
  // Apparaat-specifiek: NIET in BACKUP_TABELLEN. Bij restore op een ander apparaat
  // blijft de log van dat apparaat intact; de nieuwe backups worden daar weer bij gelogd.
  if (currentVersion < 65) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_log (
        bestandsnaam  TEXT PRIMARY KEY,
        type          TEXT NOT NULL DEFAULT 'onbekend',
        beschrijving  TEXT NOT NULL DEFAULT '',
        aangemaakt_op TEXT NOT NULL
      )
    `);
  }

  // Stap 66: performance indexes op JOIN- en filter-kolommen.
  // Alle IF NOT EXISTS dus idempotent; geen dataverlies-risico.
  if (currentVersion < 66) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactie_aanpassingen_transactie_id ON transactie_aanpassingen(transactie_id);
      CREATE INDEX IF NOT EXISTS idx_transactie_aanpassingen_categorie_id ON transactie_aanpassingen(categorie_id);
      CREATE INDEX IF NOT EXISTS idx_transacties_import_id ON transacties(import_id);
      CREATE INDEX IF NOT EXISTS idx_transacties_iban_bban ON transacties(iban_bban);
      CREATE INDEX IF NOT EXISTS idx_transacties_tegenrekening_iban_bban ON transacties(tegenrekening_iban_bban);
      CREATE INDEX IF NOT EXISTS idx_transacties_datum ON transacties(datum);
      CREATE INDEX IF NOT EXISTS idx_rekeningen_iban ON rekeningen(iban);
      CREATE INDEX IF NOT EXISTS idx_categorieen_categorie ON categorieen(categorie);
      CREATE INDEX IF NOT EXISTS idx_subcategorieen_categorie ON subcategorieen(categorie);
    `);
  }

  // Stap 67: archiveer-vlag + auto-archiveer instelling.
  // Archiveren verbergt uit dropdowns + matcher zonder historische transacties te raken.
  if (currentVersion < 67) {
    try { db.exec(`ALTER TABLE categorieen      ADD COLUMN gearchiveerd INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
    try { db.exec(`ALTER TABLE subcategorieen   ADD COLUMN gearchiveerd INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
    try { db.exec(`ALTER TABLE budgetten_potjes ADD COLUMN gearchiveerd INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
    try { db.exec(`ALTER TABLE instellingen     ADD COLUMN regel_auto_archiveer_maanden INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
  }

  // Stap 68: archiveer-vlag op transactie_aanpassingen (voor handmatige categorisaties).
  // Gearchiveerde aanpassingen verbergen uit de Aangepast-tab onder "Gearchiveerd".
  if (currentVersion < 68) {
    try { db.exec(`ALTER TABLE transactie_aanpassingen ADD COLUMN gearchiveerd INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
  }

  // Stap 69: instelling voor auto-archiveer termijn van aangepaste categorisaties.
  if (currentVersion < 69) {
    try { db.exec(`ALTER TABLE instellingen ADD COLUMN aangepast_auto_archiveer_maanden INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
  }

  // Stap 70: bevries-kolom op transactie_aanpassingen; verwijder gearchiveerde regels.
  // Gearchiveerde categorieregels worden verwijderd; hun auto-gematchte transacties
  // krijgen bevroren=1 zodat ze buiten de matcher vallen maar hun categorietekst behouden.
  if (currentVersion < 70) {
    try { db.exec(`ALTER TABLE transactie_aanpassingen ADD COLUMN bevroren INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
    db.exec(`
      UPDATE transactie_aanpassingen
      SET bevroren = 1, categorie_id = NULL
      WHERE categorie_id IN (SELECT id FROM categorieen WHERE gearchiveerd = 1)
        AND COALESCE(handmatig_gecategoriseerd, 0) = 0;
      UPDATE transactie_aanpassingen
      SET categorie_id = NULL
      WHERE categorie_id IN (SELECT id FROM categorieen WHERE gearchiveerd = 1);
      DELETE FROM categorieen WHERE gearchiveerd = 1;
    `);
  }

  // Stap 71: interval voor externe backup gatekeeper worker (seconden).
  if (currentVersion < 71) {
    try { db.exec(`ALTER TABLE instellingen ADD COLUMN backup_extern_interval INTEGER NOT NULL DEFAULT 60`); } catch { /* al aanwezig */ }
  }

  // Stap 72: compound index op (bevroren, handmatig_gecategoriseerd) voor matcher-WHERE.
  // De matcher filtert `WHERE COALESCE(a.bevroren,0)=0 AND COALESCE(a.handmatig_gecategoriseerd,0)=0`
  // — zonder index wordt transactie_aanpassingen bij elke hermatch volledig gescand.
  if (currentVersion < 72) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_ta_matcher ON transactie_aanpassingen(bevroren, handmatig_gecategoriseerd, transactie_id)');
  }

  // Stap 73: voorkeuren die voorheen in localStorage leefden naar instellingen-tabel (DIR-21).
  // transactie_kolommen: JSON-array met zichtbare kolommen in de TransactiesTabel.
  // help_modus: aan/uit voor mini-tour-knopjes in de app.
  if (currentVersion < 73) {
    try { db.exec(`ALTER TABLE instellingen ADD COLUMN transactie_kolommen TEXT DEFAULT NULL`); } catch { /* al aanwezig */ }
    try { db.exec(`ALTER TABLE instellingen ADD COLUMN help_modus INTEGER NOT NULL DEFAULT 0`); } catch { /* al aanwezig */ }
  }

  // Stap 74: wijziging_log tabel — fundament voor event-sourcing restore-systeem.
  // Triggers op elke gemonitorde tabel schrijven hier elke INSERT/UPDATE/DELETE
  // naartoe met voor/na JSON-snapshot. Restore = walk-back transactie die de
  // operaties in reverse-order omkeert. Eén DB-bestand bevat zo de hele
  // wijzigingsgeschiedenis — geen losse backup-files per wijziging meer.
  if (currentVersion < 74) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wijziging_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        actie_id      TEXT    NOT NULL,
        timestamp_ms  INTEGER NOT NULL,
        type          TEXT    NOT NULL DEFAULT 'systeem',
        beschrijving  TEXT    NOT NULL DEFAULT '',
        tabel         TEXT    NOT NULL,
        rij_id        INTEGER,
        operatie      TEXT    NOT NULL CHECK (operatie IN ('insert','update','delete')),
        voor_json     TEXT,
        na_json       TEXT,
        teruggedraaid INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wijziging_log_actie ON wijziging_log(actie_id, id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wijziging_log_tabel_rij ON wijziging_log(tabel, rij_id, id)`);
  }

  // Stap 75: apparaat_naam kolom voor multi-device zichtbaarheid. Default =
  // hostname van het systeem; gebruiker kan dit in instellingen overschrijven.
  if (currentVersion < 75) {
    try { db.exec("ALTER TABLE instellingen ADD COLUMN apparaat_naam TEXT"); } catch {}
  }
  // Vul leeg apparaat_naam met hostname (loopt elke run idempotent zodat een
  // restored DB op een nieuw apparaat z'n eigen hostname krijgt zonder dat
  // de gebruiker hem handmatig moet invullen).
  try {
    const naamRow = db.prepare('SELECT apparaat_naam FROM instellingen WHERE id = 1').get() as { apparaat_naam: string | null } | undefined;
    if (naamRow && !naamRow.apparaat_naam) {
      const hostname = os.hostname() || 'Onbekend apparaat';
      db.prepare('UPDATE instellingen SET apparaat_naam = ? WHERE id = 1').run(hostname);
    }
  } catch { /* */ }

  // Stap 76: cursor voor split-brain detectie. Tracks de hoogste log-id van
  // het diff-file dat we het laatst van extern hebben gezien (bij push of
  // bij restore). Een verschil met onze eigen lokale hoogste log-id én een
  // verschil met externe hoogste log-id = beide kanten zijn vooruit gelopen.
  if (currentVersion < 76) {
    try { db.exec("ALTER TABLE instellingen ADD COLUMN gezien_extern_hoogste_id INTEGER NOT NULL DEFAULT 0"); } catch {}
  }

  // Stap 77: zoom-instelling. Persistente UI-voorkeur (DIR-21) — werkt mee
  // op alle apparaten via backup/restore. Default 100 = native rendering.
  if (currentVersion < 77) {
    try { db.exec("ALTER TABLE instellingen ADD COLUMN ui_zoom INTEGER NOT NULL DEFAULT 100"); } catch {}
  }

  // Stap 78: bedragen_omkeren van panel-level naar series-level. Bij gemengde
  // metings (uitgaven + inkomsten) was panel-level toggle dubbelzinnig: uitgaven
  // werden positief maar inkomsten negatief. Per-serie geeft de juiste granulariteit.
  // Bestaande panelen met ui_config.bedragen_omkeren=true → al hun series krijgen
  // bedragen_omkeren=1. ui_config-key blijft staan (backup-replay-veiligheid),
  // maar wordt niet meer gelezen door render/lib/trendData.ts.
  if (currentVersion < 78) {
    try { db.exec("ALTER TABLE trend_panel_series ADD COLUMN bedragen_omkeren INTEGER NOT NULL DEFAULT 0"); } catch {}
    // Conversie: panels waarvan ui_config.bedragen_omkeren JSON-true is.
    try {
      const panelen = db.prepare("SELECT id, ui_config FROM trend_panels WHERE ui_config IS NOT NULL").all() as Array<{ id: number; ui_config: string }>;
      const update = db.prepare("UPDATE trend_panel_series SET bedragen_omkeren = 1 WHERE panel_id = ?");
      for (const p of panelen) {
        try {
          const ui = JSON.parse(p.ui_config);
          if (ui && ui.bedragen_omkeren === true) update.run(p.id);
        } catch { /* ongeldige JSON: skip */ }
      }
    } catch { /* */ }
  }

  // Stap 79: trend-consolidaties — gebundelde rekeningen/categorieën/subcategorieën
  // als één bron in trend-panels. Eén consolidatie heeft één bron_type;
  // members zijn ID-verwijzingen naar de overeenkomende bron-tabel. Server somt
  // de waarden van leden in lib/trendData.ts. Gebruik via bron_type='consolidatie'
  // op trend_panel_series, met bron_id = consolidatie.id.
  if (currentVersion < 79) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS trend_consolidaties (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          naam      TEXT NOT NULL UNIQUE,
          bron_type TEXT NOT NULL CHECK (bron_type IN ('rekening','categorie','subcategorie')),
          volgorde  INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS trend_consolidatie_leden (
          consolidatie_id INTEGER NOT NULL REFERENCES trend_consolidaties(id) ON DELETE CASCADE,
          bron_id         INTEGER NOT NULL,
          PRIMARY KEY (consolidatie_id, bron_id)
        );
      `);
    } catch { /* */ }
  }

  // Stap 80: bron_type CHECK op trend_panel_series uitbreiden met 'consolidatie'.
  // Idempotent via SQL-tekst-check op de bestaande tabel-definitie.
  if (currentVersion < 80) {
    ensureTrendPanelSeriesConsolidatieCheck(db);
  }

  // Stap 81: thema-kolom op instellingen voor light/dark/systeem (DIR-21:
  // voorkeur in DB, niet in localStorage, zodat backup/restore meegaat).
  // (Default was hier oorspronkelijk 'systeem'; in stap 82 verschoven naar
  // 'donker'. Voor fresh installs draait stap 81 direct gevolgd door 82,
  // dus kolom-default in 81 zelf doet er functioneel niet toe.)
  if (currentVersion < 81) {
    try {
      db.exec(`ALTER TABLE instellingen ADD COLUMN thema TEXT NOT NULL DEFAULT 'donker'`);
    } catch { /* kolom bestaat al */ }
  }

  // Stap 82: default-thema verschoven 'systeem' → 'donker' (gebruikersfeedback
  // 02-05-2026: light-OS users die FBS openen kregen ongewild light-mode i.p.v.
  // FBS' donker-first uitstraling). Migreer alleen waardes die nog op 'systeem'
  // staan (= DB-default uit stap 81); expliciete 'licht'/'donker' keuzes
  // blijven respecteerd. Idempotent.
  if (currentVersion < 82) {
    try {
      db.exec(`UPDATE instellingen SET thema = 'donker' WHERE thema = 'systeem'`);
    } catch { /* */ }
  }

  // Stap 83: actieve dashboard-tab persisteren in DB. Wordt gedeeld tussen
  // dashboard en Vaste Posten-pagina zodat de groep-/rekeningfilter consistent
  // is bij navigatie tussen die twee schermen.
  if (currentVersion < 83) {
    try {
      db.exec(`ALTER TABLE instellingen ADD COLUMN actieve_dashboard_tab_id INTEGER`);
    } catch { /* kolom bestaat al */ }
  }

  // Schema-versie vastleggen zodat toekomstige starts deze run overslaan
  db.pragma(`user_version = ${SCHEMA_VERSION}`);

  // Triggers altijd herbouwen vanuit het huidige schema. Door dit ná de
  // versie-bump te doen kunnen toekomstige migraties (kolom toevoegen aan een
  // gemonitorde tabel) automatisch correct loggen vanaf de eerstvolgende start
  // — geen losse trigger-onderhoudsstap per migratie nodig.
  herbouwWijzigingTriggers(db);
}

/**
 * Idempotente kolom-existence checks op trend_panels.
 * Draait ook als user_version al up-to-date is — vangnet voor gebruikers die in een
 * halfweg-staat zijn beland (kolommen uit een eerdere release die onverhoopt niet
 * toegevoegd werden). Nieuwe releases voegen hier hun columns toe.
 */
type DbType = ReturnType<typeof getDb>;
function ensureTrendPanelSeriesConsolidatieCheck(db: DbType): void {
  const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='trend_panel_series'`).get() as { sql?: string } | undefined)?.sql ?? '';
  if (!sql || sql.includes("'consolidatie'")) return;
  db.exec(`
    CREATE TABLE trend_panel_series_new (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id         INTEGER NOT NULL REFERENCES trend_panels(id) ON DELETE CASCADE,
      volgorde         INTEGER NOT NULL DEFAULT 0,
      label            TEXT,
      kleur            TEXT NOT NULL DEFAULT '#5b8def',
      as_zijde         TEXT NOT NULL DEFAULT 'links'
                           CHECK(as_zijde IN ('links','rechts')),
      serie_type       TEXT NOT NULL DEFAULT 'lijn'
                           CHECK(serie_type IN ('lijn','staaf')),
      bron_type        TEXT NOT NULL
                           CHECK(bron_type IN ('rekening','rekening_groep','categorie','subcategorie','consolidatie','totaal')),
      bron_id          INTEGER,
      meting           TEXT NOT NULL
                           CHECK(meting IN ('saldo','uitgaven','inkomsten','netto','aantal')),
      bedragen_omkeren INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    INSERT INTO trend_panel_series_new
      (id, panel_id, volgorde, label, kleur, as_zijde, serie_type, bron_type, bron_id, meting, bedragen_omkeren)
    SELECT id, panel_id, volgorde, label, kleur, as_zijde, serie_type, bron_type, bron_id, meting, bedragen_omkeren
    FROM trend_panel_series
  `);
  db.exec(`DROP TABLE trend_panel_series`);
  db.exec(`ALTER TABLE trend_panel_series_new RENAME TO trend_panel_series`);
}

function ensureTrendConsolidatieTabellen(db: DbType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_consolidaties (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      naam      TEXT NOT NULL UNIQUE,
      bron_type TEXT NOT NULL CHECK (bron_type IN ('rekening','categorie','subcategorie')),
      volgorde  INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_consolidatie_leden (
      consolidatie_id INTEGER NOT NULL REFERENCES trend_consolidaties(id) ON DELETE CASCADE,
      bron_id         INTEGER NOT NULL,
      PRIMARY KEY (consolidatie_id, bron_id)
    );
  `);
}

function ensureTrendPanelsKolommen(db: DbType): void {
  // Als trend_panels nog niet bestaat (zeer verse install die hier ergens faalde),
  // doe niets — de normale migratie moet dan alsnog draaien.
  const bestaat = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='trend_panels'`).get() as { n: number }).n > 0;
  if (!bestaat) return;

  // Safety: oude trend_panel_items-tabel alsnog droppen (indien migratie 49 onvolledig draaide).
  const oudeItems = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='trend_panel_items'`).get() as { n: number }).n > 0;
  if (oudeItems) db.exec(`DROP TABLE trend_panel_items`);

  // Wees-panelen redden: elk paneel met tab_id NULL of verwijzing naar niet-bestaande tab wordt
  // gekoppeld aan de eerst-beschikbare tab. Als er nog geen tabs zijn maar wel panelen: tab maken.
  const tabsBestaat = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='trend_tabs'`).get() as { n: number }).n > 0;
  const heeftTabId = (db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[]).some(c => c.name === 'tab_id');
  if (tabsBestaat && heeftTabId) {
    const wees = (db.prepare(`
      SELECT COUNT(*) AS n FROM trend_panels p
      WHERE p.tab_id IS NULL OR NOT EXISTS (SELECT 1 FROM trend_tabs t WHERE t.id = p.tab_id)
    `).get() as { n: number }).n;
    if (wees > 0) {
      let eersteTab = (db.prepare(`SELECT id FROM trend_tabs ORDER BY volgorde ASC, id ASC LIMIT 1`).get() as { id: number } | undefined);
      if (!eersteTab) {
        const res = db.prepare(`INSERT INTO trend_tabs (naam, volgorde) VALUES ('Trends Dashboard', 0)`).run();
        eersteTab = { id: Number(res.lastInsertRowid) };
      }
      db.prepare(`
        UPDATE trend_panels
        SET tab_id = ?
        WHERE tab_id IS NULL OR NOT EXISTS (SELECT 1 FROM trend_tabs t WHERE t.id = trend_panels.tab_id)
      `).run(eersteTab.id);
    }
  }

  const cols = db.prepare(`PRAGMA table_info(trend_panels)`).all() as { name: string }[];
  const heeft = (n: string) => cols.some(c => c.name === n);
  const voegToe = (naam: string, ddl: string) => { if (!heeft(naam)) db.exec(`ALTER TABLE trend_panels ADD COLUMN ${ddl}`); };

  // Vanaf schema 64 leeft alle paneel-UI-state in één JSON-kolom.
  // De losse vlakke kolommen zijn weggehaald in de tabel-rebuild van stap 64.
  // Vangnet: als een install halfweg is blijven steken is deze kolom er nog niet.
  voegToe('ui_config', `ui_config TEXT`);
}

/**
 * Genereert de wijziging_log capture-triggers vanuit het huidige schema.
 * Voor elke tabel in BACKUP_TABELLEN worden 3 triggers (insert/update/delete)
 * neergezet die automatisch een log-entry schrijven met JSON-snapshots van OLD
 * en/of NEW. De triggers gebruiken de UDFs huidige_actie_id/type/beschrijving
 * om de actie-context van de huidige request mee te kopiëren.
 *
 * Volledig idempotent: alle bestaande wlog_*-triggers worden eerst gedropt en
 * daarna vers opgebouwd uit de actuele PRAGMA table_info. Hierdoor lopen
 * schema-wijzigingen (kolom toevoegen aan een gemonitorde tabel) automatisch
 * mee — geen aparte trigger-onderhoudsstap per migratie nodig.
 */
function herbouwWijzigingTriggers(db: DbType): void {
  // Drop bestaande capture-triggers
  const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'wlog_%'`).all() as { name: string }[];
  for (const t of triggers) {
    db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
  }

  // Bouw 3 triggers per gemonitorde tabel
  for (const tabel of BACKUP_TABELLEN) {
    // Tabel-existence check: bij een halfweg-install kan een gemonitorde tabel
    // nog niet bestaan. Sla die over — de volgende migratie-run pakt 'm op.
    const bestaat = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?`).get(tabel) as { n: number }).n > 0;
    if (!bestaat) continue;

    const cols = db.prepare(`PRAGMA table_info("${tabel}")`).all() as { name: string }[];
    if (cols.length === 0) continue;

    // rij_id: gebruik NEW.id als die bestaat, anders NEW.rowid (SQLite-implicit).
    // Voor composite-PK koppeltabellen blijft rowid een unieke aanwijzer naar
    // die specifieke rij — bruikbaar voor conflict-detectie binnen één run.
    const heeftId = cols.some(c => c.name === 'id');
    const newId = heeftId ? 'NEW.id' : 'NEW.rowid';
    const oldId = heeftId ? 'OLD.id' : 'OLD.rowid';

    // json_object('col1', NEW.col1, 'col2', NEW.col2, ...) voor volledige snapshot
    const jsonObj = (prefix: 'NEW' | 'OLD') =>
      `json_object(${cols.map(c => `'${c.name}', ${prefix}."${c.name}"`).join(', ')})`;

    // No-op UPDATE detect: alleen vuren als minstens één kolom écht is gewijzigd.
    // `IS NOT` doet NULL-aware vergelijking (in tegenstelling tot `<>`).
    // Voorkomt dat een UPDATE die niets verandert (bv. UPSERT die dezelfde
    // waarden zet) toch een log-entry genereert.
    const wijzigingDetect = cols.map(c => `OLD."${c.name}" IS NOT NEW."${c.name}"`).join(' OR ');

    // Tijdstempel in milliseconden sinds epoch. Volgorde binnen één tick wordt
    // gegarandeerd door de auto-increment id van wijziging_log.
    const ts = `CAST(strftime('%s','now') AS INTEGER) * 1000`;

    db.exec(`
      CREATE TRIGGER "wlog_${tabel}_ai" AFTER INSERT ON "${tabel}"
      WHEN log_actief() = 1
      BEGIN
        INSERT INTO wijziging_log (actie_id, timestamp_ms, type, beschrijving, tabel, rij_id, operatie, na_json)
        VALUES (
          huidige_actie_id(), ${ts}, huidige_actie_type(), huidige_actie_beschrijving(),
          '${tabel}', ${newId}, 'insert', ${jsonObj('NEW')}
        );
      END
    `);

    db.exec(`
      CREATE TRIGGER "wlog_${tabel}_au" AFTER UPDATE ON "${tabel}"
      WHEN log_actief() = 1 AND (${wijzigingDetect})
      BEGIN
        INSERT INTO wijziging_log (actie_id, timestamp_ms, type, beschrijving, tabel, rij_id, operatie, voor_json, na_json)
        VALUES (
          huidige_actie_id(), ${ts}, huidige_actie_type(), huidige_actie_beschrijving(),
          '${tabel}', ${newId}, 'update', ${jsonObj('OLD')}, ${jsonObj('NEW')}
        );
      END
    `);

    db.exec(`
      CREATE TRIGGER "wlog_${tabel}_ad" AFTER DELETE ON "${tabel}"
      WHEN log_actief() = 1
      BEGIN
        INSERT INTO wijziging_log (actie_id, timestamp_ms, type, beschrijving, tabel, rij_id, operatie, voor_json)
        VALUES (
          huidige_actie_id(), ${ts}, huidige_actie_type(), huidige_actie_beschrijving(),
          '${tabel}', ${oldId}, 'delete', ${jsonObj('OLD')}
        );
      END
    `);
  }
}
