// Single source of truth voor welke tabellen onderdeel zijn van een backup/restore.
// Volgorde is FK-respectful: parents eerst (voor INSERT). De restore-route
// reverseert deze lijst voor de DELETE-fase (kind-tabellen eerst).
//
// Deze file is bewust pure config (geen db-import) zodat hij ook vanuit
// client components geïmporteerd kan worden.

export const BACKUP_TABELLEN = [
  'instellingen',
  'periode_configuraties',
  'rekeningen',
  'genegeerde_rekeningen',
  'omboeking_uitzonderingen',
  'rekening_groepen',
  'rekening_groep_rekeningen',
  'dashboard_tabs',
  'transacties_tabs',
  'categorieen',
  'imports',
  'budgetten_potjes',
  'budgetten_potjes_rekeningen',
  'subcategorieen',
  'transacties',
  'transactie_aanpassingen',
  'vaste_posten_config',
  'vp_groepen',
  'vp_groep_subcategorieen',
  'vp_volgorde',
  'vp_negeer',
  'trend_tabs',
  'trend_panels',
  'trend_panel_series',
  'trend_consolidaties',
  'trend_consolidatie_leden',
] as const;

// Tabellen die bewust niet in een backup horen (efemeer / apparaat-specifiek / SQLite intern)
export const NIET_BACKUP_TABELLEN = new Set<string>([
  'sqlite_sequence',
  'backup_log',
  'wijziging_log',
]);
