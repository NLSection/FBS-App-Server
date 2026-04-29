// FILE: instellingen.ts
// AANGEMAAKT: 25-03-2026 21:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 22:00
//
// WIJZIGINGEN (03-04-2026 22:00):
// - catUitklappen instelling toegevoegd (cat_uitklappen kolom)
// WIJZIGINGEN (25-03-2026 21:00):
// - Initiële aanmaak: getInstellingen en updateInstellingen

import getDb from '@/lib/db';

export interface Instellingen {
  maandStartDag:          number;
  dashboardBlsTonen:      boolean;
  dashboardCatTonen:      boolean;
  catUitklappen:          boolean;
  catTrxUitgeklapt:       boolean;
  blsTrxUitgeklapt:       boolean;
  vastePostenOverzicht: string;
  vastePostenAfwijkingProcent: number;
  backupBewaarDagen:     number;
  apparaatId:            string | null;
  apparaatNaam:          string | null;
  backupExternPad:       string | null;
  backupVersie:          number;
  backupEncryptieHash:   string | null;
  backupEncryptieHint:   string | null;
  backupEncryptieSalt:   string | null;
  vastePostenBuffer:     number;
  vastePostenVergelijk: string;
  vastePostenNieuwDrempel: string;
  vastePostenSubtabelPeriode: string;
  vastePostenVerbergDrempel: string;
  omboekingenAuto:       boolean;
  gebruikersProfiel:     'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null;
  updateKanaal:          'main' | 'test' | 'uit';
  trendsGridCols:        number;
  trendsGridSpacing:     number;
  onboardingVoltooid:    boolean;
  regelAutoArchiveerMaanden: number;
  aangepastAutoArchiveerMaanden: number;
  backupExternInterval: number;
  transactieKolommen:   string[] | null;
  helpModus:            boolean;
  uiZoom:               number;        // 25-200, percentage van native rendering
}

type Row = {
  maand_start_dag:           number;
  dashboard_bls_tonen:       number;
  dashboard_cat_tonen:       number;
  cat_uitklappen:            number;
  bls_trx_uitgeklapt:        number;
  cat_trx_uitgeklapt:        number;
  vaste_posten_overzicht: string;
  vaste_posten_afwijking_procent: number;
  backup_bewaar_dagen:     number;
  apparaat_id:             string | null;
  apparaat_naam:           string | null;
  backup_extern_pad:       string | null;
  backup_versie:           number;
  backup_encryptie_hash:   string | null;
  backup_encryptie_hint:   string | null;
  backup_encryptie_salt:   string | null;
  vaste_posten_buffer:     number;
  vaste_posten_vergelijk: string;
  vaste_posten_nieuw_drempel: string;
  vaste_posten_subtabel_periode: string;
  vaste_posten_verberg_drempel: string;
  omboekingen_auto:        number;
  gebruikers_profiel:      string | null;
  update_kanaal:           string | null;
  trends_grid_cols:        number;
  trends_grid_spacing:     number;
  onboarding_voltooid:     number;
  regel_auto_archiveer_maanden: number;
  aangepast_auto_archiveer_maanden: number;
  backup_extern_interval: number;
  transactie_kolommen:    string | null;
  help_modus:             number;
  ui_zoom:                number;
};

export function getInstellingen(): Instellingen {
  const row = getDb()
    .prepare('SELECT maand_start_dag, dashboard_bls_tonen, dashboard_cat_tonen, cat_uitklappen, cat_trx_uitgeklapt, bls_trx_uitgeklapt, vaste_posten_overzicht, vaste_posten_afwijking_procent, vaste_posten_buffer, vaste_posten_vergelijk, vaste_posten_nieuw_drempel, vaste_posten_subtabel_periode, vaste_posten_verberg_drempel, backup_bewaar_dagen, apparaat_id, apparaat_naam, backup_extern_pad, backup_versie, backup_encryptie_hash, backup_encryptie_hint, backup_encryptie_salt, omboekingen_auto, gebruikers_profiel, update_kanaal, trends_grid_cols, trends_grid_spacing, onboarding_voltooid, regel_auto_archiveer_maanden, aangepast_auto_archiveer_maanden, backup_extern_interval, transactie_kolommen, help_modus, ui_zoom FROM instellingen WHERE id = 1')
    .get() as Row | undefined;
  if (!row) return {
    maandStartDag: 1, dashboardBlsTonen: true, dashboardCatTonen: true,
    catUitklappen: false, catTrxUitgeklapt: false, blsTrxUitgeklapt: false,
    vastePostenOverzicht: '4', vastePostenAfwijkingProcent: 5,
    backupBewaarDagen: 7,
    apparaatId: null, apparaatNaam: null, backupExternPad: null, backupVersie: 0,
    backupEncryptieHash: null, backupEncryptieHint: null, backupEncryptieSalt: null,
    vastePostenBuffer: 0, vastePostenVergelijk: '3',
    vastePostenNieuwDrempel: '12',
    vastePostenSubtabelPeriode: '3',
    vastePostenVerbergDrempel: '4',
    omboekingenAuto: true,
    gebruikersProfiel: null,
    updateKanaal: 'main',
    trendsGridCols: 48,
    trendsGridSpacing: 1,
    onboardingVoltooid: false,
    regelAutoArchiveerMaanden: 0,
    aangepastAutoArchiveerMaanden: 0,
    backupExternInterval: 60,
    transactieKolommen: null,
    helpModus: false,
    uiZoom: 100,
  };
  return {
    maandStartDag:          row.maand_start_dag,
    dashboardBlsTonen:      row.dashboard_bls_tonen      !== 0,
    dashboardCatTonen:      row.dashboard_cat_tonen      !== 0,
    catUitklappen:          row.cat_uitklappen            !== 0,
    blsTrxUitgeklapt:       (row.bls_trx_uitgeklapt ?? 0) !== 0,
    catTrxUitgeklapt:       row.cat_trx_uitgeklapt        !== 0,
    vastePostenOverzicht:  row.vaste_posten_overzicht != null ? String(row.vaste_posten_overzicht) : '4',
    vastePostenAfwijkingProcent: row.vaste_posten_afwijking_procent ?? 5,
    backupBewaarDagen:     row.backup_bewaar_dagen     ?? 7,
    apparaatId:            row.apparaat_id             ?? null,
    apparaatNaam:          row.apparaat_naam           ?? null,
    backupExternPad:       row.backup_extern_pad       ?? null,
    backupVersie:          row.backup_versie           ?? 0,
    backupEncryptieHash:   row.backup_encryptie_hash   ?? null,
    backupEncryptieHint:   row.backup_encryptie_hint   ?? null,
    backupEncryptieSalt:   row.backup_encryptie_salt   ?? null,
    vastePostenBuffer:     row.vaste_posten_buffer      ?? 0,
    vastePostenVergelijk:  row.vaste_posten_vergelijk != null ? String(row.vaste_posten_vergelijk) : '3',
    vastePostenNieuwDrempel: row.vaste_posten_nieuw_drempel != null ? String(row.vaste_posten_nieuw_drempel) : '12',
    vastePostenSubtabelPeriode: row.vaste_posten_subtabel_periode ?? '3',
    vastePostenVerbergDrempel: row.vaste_posten_verberg_drempel != null ? String(row.vaste_posten_verberg_drempel) : '4',
    omboekingenAuto:       (row.omboekingen_auto ?? 1) !== 0,
    gebruikersProfiel:     (['potjesbeheer', 'uitgavenbeheer', 'handmatig'].includes(row.gebruikers_profiel ?? '') ? row.gebruikers_profiel as 'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' : null),
    updateKanaal:          row.update_kanaal === 'test' ? 'test' : row.update_kanaal === 'uit' ? 'uit' : 'main',
    trendsGridCols:        row.trends_grid_cols ?? 48,
    trendsGridSpacing:     row.trends_grid_spacing ?? 1,
    onboardingVoltooid:    (row.onboarding_voltooid ?? 0) !== 0,
    regelAutoArchiveerMaanden: row.regel_auto_archiveer_maanden ?? 0,
    aangepastAutoArchiveerMaanden: row.aangepast_auto_archiveer_maanden ?? 0,
    backupExternInterval: row.backup_extern_interval ?? 60,
    transactieKolommen:   (() => {
      if (!row.transactie_kolommen) return null;
      try { const p = JSON.parse(row.transactie_kolommen); return Array.isArray(p) ? p.map(String) : null; } catch { return null; }
    })(),
    helpModus:            (row.help_modus ?? 0) !== 0,
    uiZoom:               row.ui_zoom ?? 100,
  };
}

export function updateInstellingen(data: Partial<Instellingen>): void {
  const sets: string[]  = [];
  const values: unknown[] = [];

  if (data.maandStartDag !== undefined) {
    if (!Number.isInteger(data.maandStartDag) || data.maandStartDag < 1 || data.maandStartDag > 28) {
      throw new Error('maandStartDag moet een geheel getal zijn tussen 1 en 28.');
    }
    sets.push('maand_start_dag = ?');
    values.push(data.maandStartDag);
  }
  if (data.dashboardBlsTonen      !== undefined) { sets.push('dashboard_bls_tonen = ?');      values.push(data.dashboardBlsTonen      ? 1 : 0); }
  if (data.dashboardCatTonen      !== undefined) { sets.push('dashboard_cat_tonen = ?');      values.push(data.dashboardCatTonen      ? 1 : 0); }
  if (data.catUitklappen          !== undefined) { sets.push('cat_uitklappen = ?');           values.push(data.catUitklappen          ? 1 : 0); }
  if (data.blsTrxUitgeklapt       !== undefined) { sets.push('bls_trx_uitgeklapt = ?');      values.push(data.blsTrxUitgeklapt       ? 1 : 0); }
  if (data.catTrxUitgeklapt       !== undefined) { sets.push('cat_trx_uitgeklapt = ?');      values.push(data.catTrxUitgeklapt       ? 1 : 0); }
  if (data.vastePostenOverzicht !== undefined) {
    const v = data.vastePostenOverzicht;
    const isJaar = v === 'jaar';
    const n = Number(v);
    if (!isJaar && (!Number.isInteger(n) || n < 1 || n > 12)) {
      throw new Error("vastePostenOverzicht moet 'jaar' zijn of een geheel getal tussen 1 en 12.");
    }
    sets.push('vaste_posten_overzicht = ?'); values.push(v);
  }
  if (data.vastePostenAfwijkingProcent !== undefined) {
    if (!Number.isInteger(data.vastePostenAfwijkingProcent) || data.vastePostenAfwijkingProcent < 1 || data.vastePostenAfwijkingProcent > 100) {
      throw new Error('vastePostenAfwijkingProcent moet een geheel getal zijn tussen 1 en 100.');
    }
    sets.push('vaste_posten_afwijking_procent = ?'); values.push(data.vastePostenAfwijkingProcent);
  }
  if (data.vastePostenVergelijk !== undefined) {
    const v = data.vastePostenVergelijk;
    const isJaar = v === 'jaar';
    const n = Number(v);
    if (!isJaar && (!Number.isInteger(n) || n < 1 || n > 12)) {
      throw new Error("vastePostenVergelijk moet 'jaar' zijn of een geheel getal tussen 1 en 12.");
    }
    sets.push('vaste_posten_vergelijk = ?'); values.push(v);
  }
  if (data.vastePostenNieuwDrempel !== undefined) {
    const v = data.vastePostenNieuwDrempel;
    const isJaar = v === 'jaar';
    const n = Number(v);
    if (!isJaar && (!Number.isInteger(n) || n < 1 || n > 36)) {
      throw new Error("vastePostenNieuwDrempel moet 'jaar' zijn of een geheel getal tussen 1 en 36.");
    }
    sets.push('vaste_posten_nieuw_drempel = ?'); values.push(v);
  }
  if (data.vastePostenSubtabelPeriode !== undefined) {
    const v = data.vastePostenSubtabelPeriode;
    const isJaar = v === 'jaar';
    const n = Number(v);
    if (!isJaar && (!Number.isInteger(n) || n < 1 || n > 24)) {
      throw new Error("vastePostenSubtabelPeriode moet 'jaar' zijn of een geheel getal tussen 1 en 24.");
    }
    sets.push('vaste_posten_subtabel_periode = ?'); values.push(v);
  }
  if (data.vastePostenVerbergDrempel !== undefined) {
    const v = data.vastePostenVerbergDrempel;
    const isJaar = v === 'jaar';
    const n = Number(v);
    if (!isJaar && (!Number.isInteger(n) || n < 1 || n > 36)) {
      throw new Error("vastePostenVerbergDrempel moet 'jaar' zijn of een geheel getal tussen 1 en 36.");
    }
    sets.push('vaste_posten_verberg_drempel = ?'); values.push(v);
  }
  if (data.vastePostenBuffer !== undefined) {
    if (typeof data.vastePostenBuffer !== 'number' || data.vastePostenBuffer < 0) {
      throw new Error('vastePostenBuffer moet een positief getal zijn.');
    }
    sets.push('vaste_posten_buffer = ?'); values.push(data.vastePostenBuffer);
  }

  if (data.backupBewaarDagen !== undefined) {
    if (!Number.isInteger(data.backupBewaarDagen) || data.backupBewaarDagen < 1 || data.backupBewaarDagen > 365) {
      throw new Error('backupBewaarDagen moet een geheel getal zijn tussen 1 en 365.');
    }
    sets.push('backup_bewaar_dagen = ?'); values.push(data.backupBewaarDagen);
  }

  if (data.apparaatNaam !== undefined) {
    const naam = (data.apparaatNaam ?? '').trim();
    if (!naam) throw new Error('apparaatNaam mag niet leeg zijn.');
    if (naam.length > 64) throw new Error('apparaatNaam mag maximaal 64 tekens zijn.');
    sets.push('apparaat_naam = ?'); values.push(naam);
  }
  if (data.backupExternPad !== undefined) {
    sets.push('backup_extern_pad = ?');
    values.push(data.backupExternPad || null);
  }
  if (data.backupExternInterval !== undefined) {
    const geldige = [30, 60, 120, 300, 600, 1800];
    if (!geldige.includes(data.backupExternInterval)) {
      throw new Error('backupExternInterval moet een van de toegestane waarden zijn.');
    }
    sets.push('backup_extern_interval = ?'); values.push(data.backupExternInterval);
  }
  if (data.omboekingenAuto !== undefined) { sets.push('omboekingen_auto = ?'); values.push(data.omboekingenAuto ? 1 : 0); }
  if (data.gebruikersProfiel !== undefined) {
    if (data.gebruikersProfiel !== null && !['potjesbeheer', 'uitgavenbeheer', 'handmatig'].includes(data.gebruikersProfiel)) {
      throw new Error("gebruikersProfiel moet 'potjesbeheer', 'uitgavenbeheer', 'handmatig' of null zijn.");
    }
    sets.push('gebruikers_profiel = ?'); values.push(data.gebruikersProfiel);
  }
  if (data.updateKanaal !== undefined) {
    if (data.updateKanaal !== 'main' && data.updateKanaal !== 'test' && data.updateKanaal !== 'uit') {
      throw new Error("updateKanaal moet 'main', 'test' of 'uit' zijn.");
    }
    sets.push('update_kanaal = ?'); values.push(data.updateKanaal);
  }
  if (data.trendsGridCols !== undefined) {
    if (!Number.isInteger(data.trendsGridCols) || data.trendsGridCols < 6 || data.trendsGridCols > 96) {
      throw new Error('trendsGridCols moet een geheel getal zijn tussen 6 en 96.');
    }
    sets.push('trends_grid_cols = ?'); values.push(data.trendsGridCols);
  }
  if (data.trendsGridSpacing !== undefined) {
    if (!Number.isInteger(data.trendsGridSpacing) || data.trendsGridSpacing < 0 || data.trendsGridSpacing > 40) {
      throw new Error('trendsGridSpacing moet een geheel getal zijn tussen 0 en 40.');
    }
    sets.push('trends_grid_spacing = ?'); values.push(data.trendsGridSpacing);
  }
  if (data.onboardingVoltooid !== undefined) {
    sets.push('onboarding_voltooid = ?'); values.push(data.onboardingVoltooid ? 1 : 0);
  }
  if (data.regelAutoArchiveerMaanden !== undefined) {
    if (!Number.isInteger(data.regelAutoArchiveerMaanden) || data.regelAutoArchiveerMaanden < 0 || data.regelAutoArchiveerMaanden > 120) {
      throw new Error('regelAutoArchiveerMaanden moet een geheel getal zijn tussen 0 en 120.');
    }
    sets.push('regel_auto_archiveer_maanden = ?'); values.push(data.regelAutoArchiveerMaanden);
  }
  if (data.aangepastAutoArchiveerMaanden !== undefined) {
    if (!Number.isInteger(data.aangepastAutoArchiveerMaanden) || data.aangepastAutoArchiveerMaanden < 0 || data.aangepastAutoArchiveerMaanden > 120) {
      throw new Error('aangepastAutoArchiveerMaanden moet een geheel getal zijn tussen 0 en 120.');
    }
    sets.push('aangepast_auto_archiveer_maanden = ?'); values.push(data.aangepastAutoArchiveerMaanden);
  }

  if (data.transactieKolommen !== undefined) {
    if (data.transactieKolommen !== null && !Array.isArray(data.transactieKolommen)) {
      throw new Error('transactieKolommen moet een array zijn of null.');
    }
    sets.push('transactie_kolommen = ?');
    values.push(data.transactieKolommen === null ? null : JSON.stringify(data.transactieKolommen));
  }
  if (data.helpModus !== undefined) {
    sets.push('help_modus = ?'); values.push(data.helpModus ? 1 : 0);
  }
  if (data.uiZoom !== undefined) {
    if (!Number.isInteger(data.uiZoom) || data.uiZoom < 25 || data.uiZoom > 200) {
      throw new Error('uiZoom moet een geheel getal zijn tussen 25 en 200.');
    }
    sets.push('ui_zoom = ?'); values.push(data.uiZoom);
  }

  if (sets.length === 0) throw new Error('Geen velden om bij te werken.');
  getDb().prepare(`UPDATE instellingen SET ${sets.join(', ')} WHERE id = 1`).run(...values);
}
