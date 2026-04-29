import getDb from '@/lib/db';

export type BronType = 'rekening' | 'rekening_groep' | 'categorie' | 'subcategorie' | 'totaal' | 'consolidatie';
export type Meting = 'saldo' | 'uitgaven' | 'inkomsten' | 'netto' | 'aantal';
export type AsZijde = 'links' | 'rechts';
export type SerieType = 'lijn' | 'staaf';
export type XAsSchaal = 'maand' | 'kwartaal' | 'jaar';
export type Weergave = 'per_maand' | 'cumulatief';

export interface TrendPanelSerie {
  id: number;
  panel_id: number;
  volgorde: number;
  label: string | null;
  kleur: string;
  as_zijde: AsZijde;
  serie_type: SerieType;
  bron_type: BronType;
  bron_id: number | null;
  meting: Meting;
  bedragen_omkeren: boolean;
}

export interface TrendPanel {
  id: number;
  tab_id: number;
  titel: string;
  weergave: Weergave;
  toon_jaarknoppen: boolean;
  toon_maandknoppen: boolean;
  toon_alle_jaren: boolean;
  volgorde: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  x_as_schaal: XAsSchaal;
  y_as_links_label: string | null;
  y_as_rechts_label: string | null;
  standaard_jaar: number | null;
  standaard_maand: number | null;
  standaard_alle_jaren: boolean;
  bedragen_omkeren: boolean;
  label_langs_lijn: boolean;
  lijn_curve: 'monotone' | 'linear';
  toon_nullijn: boolean;
  toon_gridlijnen: boolean;
  toon_legenda: boolean;
  as_kleur: string;
  toon_waarden: boolean;
  y_links_log: boolean;
  y_links_min: number | null;
  y_links_max: number | null;
  y_links_tick: number | null;
  y_rechts_log: boolean;
  y_rechts_min: number | null;
  y_rechts_max: number | null;
  y_rechts_tick: number | null;
  incl_actuele_maand: boolean;
  beschikbare_jaren: number[] | null;
  beschikbare_maanden: number[] | null;
  frac_y: number | null;
  frac_h: number | null;
  max_x_labels: number | null;
  max_waarde_labels: number | null;
  min_label_px: number;
  x_labels_step: number | null;
  waarde_labels_step: number | null;
  series: TrendPanelSerie[];
}

// Defaults voor de JSON-ui-config. Toevoegen van een nieuwe UI-flag = hier één
// regel erbij + één regel op de TrendPanel-interface. Geen schema-migratie nodig,
// geen restore-transform: ontbrekende keys vallen terug op de default.
const UI_DEFAULTS: UiConfig = {
  weergave: 'per_maand',
  toon_jaarknoppen: false,
  toon_maandknoppen: false,
  toon_alle_jaren: false,
  x_as_schaal: 'maand',
  y_as_links_label: null,
  y_as_rechts_label: null,
  standaard_jaar: null,
  standaard_maand: null,
  standaard_alle_jaren: true,
  bedragen_omkeren: false,
  label_langs_lijn: false,
  lijn_curve: 'monotone',
  toon_nullijn: false,
  toon_gridlijnen: true,
  toon_legenda: true,
  as_kleur: '#2e3148',
  toon_waarden: false,
  y_links_log: false,
  y_links_min: null,
  y_links_max: null,
  y_links_tick: null,
  y_rechts_log: false,
  y_rechts_min: null,
  y_rechts_max: null,
  y_rechts_tick: null,
  incl_actuele_maand: false,
  beschikbare_jaren: null,
  beschikbare_maanden: null,
  frac_y: null,
  frac_h: null,
  max_x_labels: null,
  max_waarde_labels: null,
  min_label_px: 20,
  x_labels_step: null,
  waarde_labels_step: null,
};

interface UiConfig {
  weergave: Weergave;
  toon_jaarknoppen: boolean;
  toon_maandknoppen: boolean;
  toon_alle_jaren: boolean;
  x_as_schaal: XAsSchaal;
  y_as_links_label: string | null;
  y_as_rechts_label: string | null;
  standaard_jaar: number | null;
  standaard_maand: number | null;
  standaard_alle_jaren: boolean;
  bedragen_omkeren: boolean;
  label_langs_lijn: boolean;
  lijn_curve: 'monotone' | 'linear';
  toon_nullijn: boolean;
  toon_gridlijnen: boolean;
  toon_legenda: boolean;
  as_kleur: string;
  toon_waarden: boolean;
  y_links_log: boolean;
  y_links_min: number | null;
  y_links_max: number | null;
  y_links_tick: number | null;
  y_rechts_log: boolean;
  y_rechts_min: number | null;
  y_rechts_max: number | null;
  y_rechts_tick: number | null;
  incl_actuele_maand: boolean;
  beschikbare_jaren: number[] | null;
  beschikbare_maanden: number[] | null;
  frac_y: number | null;
  frac_h: number | null;
  max_x_labels: number | null;
  max_waarde_labels: number | null;
  min_label_px: number;
  x_labels_step: number | null;
  waarde_labels_step: number | null;
}

interface PanelRij {
  id: number;
  tab_id: number | null;
  titel: string;
  volgorde: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  ui_config: string | null;
}

interface SerieRij {
  id: number;
  panel_id: number;
  volgorde: number;
  label: string | null;
  kleur: string;
  as_zijde: string;
  serie_type: string;
  bron_type: string;
  bron_id: number | null;
  meting: string;
  bedragen_omkeren: number;
}

function parseUiConfig(raw: string | null): UiConfig {
  if (!raw) return { ...UI_DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<UiConfig>;
    return { ...UI_DEFAULTS, ...parsed };
  } catch {
    return { ...UI_DEFAULTS };
  }
}

function rijNaarPanel(rij: PanelRij, series: TrendPanelSerie[]): TrendPanel {
  const ui = parseUiConfig(rij.ui_config);
  return {
    id: rij.id,
    tab_id: rij.tab_id ?? 0,
    titel: rij.titel,
    volgorde: rij.volgorde,
    grid_x: rij.grid_x,
    grid_y: rij.grid_y,
    grid_w: rij.grid_w,
    grid_h: rij.grid_h,
    weergave: ui.weergave,
    toon_jaarknoppen: ui.toon_jaarknoppen,
    toon_maandknoppen: ui.toon_maandknoppen,
    toon_alle_jaren: ui.toon_alle_jaren,
    x_as_schaal: ui.x_as_schaal,
    y_as_links_label: ui.y_as_links_label,
    y_as_rechts_label: ui.y_as_rechts_label,
    standaard_jaar: ui.standaard_jaar,
    standaard_maand: ui.standaard_maand,
    standaard_alle_jaren: ui.standaard_alle_jaren,
    bedragen_omkeren: ui.bedragen_omkeren,
    label_langs_lijn: ui.label_langs_lijn,
    lijn_curve: ui.lijn_curve,
    toon_nullijn: ui.toon_nullijn,
    toon_gridlijnen: ui.toon_gridlijnen,
    toon_legenda: ui.toon_legenda,
    as_kleur: ui.as_kleur,
    toon_waarden: ui.toon_waarden,
    y_links_log: ui.y_links_log,
    y_links_min: ui.y_links_min,
    y_links_max: ui.y_links_max,
    y_links_tick: ui.y_links_tick,
    y_rechts_log: ui.y_rechts_log,
    y_rechts_min: ui.y_rechts_min,
    y_rechts_max: ui.y_rechts_max,
    y_rechts_tick: ui.y_rechts_tick,
    incl_actuele_maand: ui.incl_actuele_maand,
    beschikbare_jaren: ui.beschikbare_jaren,
    beschikbare_maanden: ui.beschikbare_maanden,
    frac_y: ui.frac_y,
    frac_h: ui.frac_h,
    max_x_labels: ui.max_x_labels,
    max_waarde_labels: ui.max_waarde_labels,
    min_label_px: ui.min_label_px,
    x_labels_step: ui.x_labels_step,
    waarde_labels_step: ui.waarde_labels_step,
    series,
  };
}

function rijNaarSerie(r: SerieRij): TrendPanelSerie {
  return {
    id: r.id,
    panel_id: r.panel_id,
    volgorde: r.volgorde,
    label: r.label,
    kleur: r.kleur,
    as_zijde: r.as_zijde as AsZijde,
    serie_type: r.serie_type as SerieType,
    bron_type: r.bron_type as BronType,
    bron_id: r.bron_id,
    meting: r.meting as Meting,
    bedragen_omkeren: r.bedragen_omkeren === 1,
  };
}

export function getAllPanels(): TrendPanel[] {
  const db = getDb();
  const rijen = db.prepare('SELECT * FROM trend_panels ORDER BY volgorde ASC, id ASC').all() as PanelRij[];
  const alleSeries = db.prepare('SELECT * FROM trend_panel_series ORDER BY panel_id ASC, volgorde ASC, id ASC').all() as SerieRij[];

  const seriesPerPanel = new Map<number, TrendPanelSerie[]>();
  for (const s of alleSeries) {
    if (!seriesPerPanel.has(s.panel_id)) seriesPerPanel.set(s.panel_id, []);
    seriesPerPanel.get(s.panel_id)!.push(rijNaarSerie(s));
  }

  return rijen.map(r => rijNaarPanel(r, seriesPerPanel.get(r.id) ?? []));
}

export function getPanel(id: number): TrendPanel | null {
  const db = getDb();
  const rij = db.prepare('SELECT * FROM trend_panels WHERE id = ?').get(id) as PanelRij | undefined;
  if (!rij) return null;
  const series = (db.prepare('SELECT * FROM trend_panel_series WHERE panel_id = ? ORDER BY volgorde ASC, id ASC').all(id) as SerieRij[])
    .map(rijNaarSerie);
  return rijNaarPanel(rij, series);
}

export interface SerieInput {
  label?: string | null;
  kleur: string;
  as_zijde: AsZijde;
  serie_type: SerieType;
  bron_type: BronType;
  bron_id: number | null;
  meting: Meting;
  bedragen_omkeren?: boolean;
}

export interface PanelInput {
  tab_id?: number;
  titel: string;
  weergave?: Weergave;
  toon_jaarknoppen?: boolean;
  toon_maandknoppen?: boolean;
  toon_alle_jaren?: boolean;
  grid_x?: number;
  grid_y?: number;
  grid_w?: number;
  grid_h?: number;
  x_as_schaal?: XAsSchaal;
  y_as_links_label?: string | null;
  y_as_rechts_label?: string | null;
  standaard_jaar?: number | null;
  standaard_maand?: number | null;
  standaard_alle_jaren?: boolean;
  bedragen_omkeren?: boolean;
  label_langs_lijn?: boolean;
  lijn_curve?: 'monotone' | 'linear';
  toon_nullijn?: boolean;
  toon_gridlijnen?: boolean;
  toon_legenda?: boolean;
  as_kleur?: string;
  toon_waarden?: boolean;
  y_links_log?: boolean;
  y_links_min?: number | null;
  y_links_max?: number | null;
  y_links_tick?: number | null;
  y_rechts_log?: boolean;
  y_rechts_min?: number | null;
  y_rechts_max?: number | null;
  y_rechts_tick?: number | null;
  incl_actuele_maand?: boolean;
  beschikbare_jaren?: number[] | null;
  beschikbare_maanden?: number[] | null;
  frac_y?: number | null;
  frac_h?: number | null;
  max_x_labels?: number | null;
  max_waarde_labels?: number | null;
  min_label_px?: number;
  x_labels_step?: number | null;
  waarde_labels_step?: number | null;
  series?: SerieInput[];
}

// Bouwt een UiConfig uit een Partial<PanelInput>, aangevuld met waarden uit
// een bestaande UiConfig (voor updates) of UI_DEFAULTS (voor nieuwe panelen).
function mergeUi(base: UiConfig, data: Partial<PanelInput>): UiConfig {
  const pick = <K extends keyof UiConfig>(k: K): UiConfig[K] => {
    const v = (data as Record<string, unknown>)[k];
    return (v !== undefined ? v : base[k]) as UiConfig[K];
  };
  return {
    weergave: pick('weergave'),
    toon_jaarknoppen: pick('toon_jaarknoppen'),
    toon_maandknoppen: pick('toon_maandknoppen'),
    toon_alle_jaren: pick('toon_alle_jaren'),
    x_as_schaal: pick('x_as_schaal'),
    y_as_links_label: pick('y_as_links_label'),
    y_as_rechts_label: pick('y_as_rechts_label'),
    standaard_jaar: pick('standaard_jaar'),
    standaard_maand: pick('standaard_maand'),
    standaard_alle_jaren: pick('standaard_alle_jaren'),
    bedragen_omkeren: pick('bedragen_omkeren'),
    label_langs_lijn: pick('label_langs_lijn'),
    lijn_curve: pick('lijn_curve'),
    toon_nullijn: pick('toon_nullijn'),
    toon_gridlijnen: pick('toon_gridlijnen'),
    toon_legenda: pick('toon_legenda'),
    as_kleur: pick('as_kleur'),
    toon_waarden: pick('toon_waarden'),
    y_links_log: pick('y_links_log'),
    y_links_min: pick('y_links_min'),
    y_links_max: pick('y_links_max'),
    y_links_tick: pick('y_links_tick'),
    y_rechts_log: pick('y_rechts_log'),
    y_rechts_min: pick('y_rechts_min'),
    y_rechts_max: pick('y_rechts_max'),
    y_rechts_tick: pick('y_rechts_tick'),
    incl_actuele_maand: pick('incl_actuele_maand'),
    beschikbare_jaren: pick('beschikbare_jaren'),
    beschikbare_maanden: pick('beschikbare_maanden'),
    frac_y: pick('frac_y'),
    frac_h: pick('frac_h'),
    max_x_labels: pick('max_x_labels'),
    max_waarde_labels: pick('max_waarde_labels'),
    min_label_px: pick('min_label_px'),
    x_labels_step: pick('x_labels_step'),
    waarde_labels_step: pick('waarde_labels_step'),
  };
}

export function createPanel(data: PanelInput): TrendPanel {
  const db = getDb();
  const maxVolgorde = (db.prepare('SELECT MAX(volgorde) AS m FROM trend_panels').get() as { m: number | null }).m ?? -1;

  const ui = mergeUi(UI_DEFAULTS, data);

  const result = db.prepare(`
    INSERT INTO trend_panels
      (tab_id, titel, volgorde, grid_x, grid_y, grid_w, grid_h, ui_config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.tab_id ?? null,
    data.titel,
    maxVolgorde + 1,
    data.grid_x ?? 0,
    data.grid_y ?? 0,
    data.grid_w ?? 24,
    data.grid_h ?? 12,
    JSON.stringify(ui),
  );

  const panelId = Number(result.lastInsertRowid);
  if (data.series && data.series.length > 0) {
    vervangSeries(panelId, data.series);
  }
  return getPanel(panelId)!;
}

export function updatePanel(id: number, data: Partial<PanelInput>): TrendPanel | null {
  const db = getDb();
  const huidige = db.prepare('SELECT ui_config FROM trend_panels WHERE id = ?').get(id) as { ui_config: string | null } | undefined;
  if (!huidige) return null;

  const velden: string[] = [];
  const waarden: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => { velden.push(`${col} = ?`); waarden.push(val); };

  if (data.tab_id !== undefined) set('tab_id', data.tab_id);
  if (data.titel !== undefined) set('titel', data.titel);
  if (data.grid_x !== undefined) set('grid_x', data.grid_x);
  if (data.grid_y !== undefined) set('grid_y', data.grid_y);
  if (data.grid_w !== undefined) set('grid_w', data.grid_w);
  if (data.grid_h !== undefined) set('grid_h', data.grid_h);

  // UI-config: altijd mergen met huidige + overridden velden en volledig
  // terugschrijven. Pas alleen toe als er minstens één UI-veld in `data` zit —
  // anders laten we ui_config ongemoeid.
  const uiKeys: (keyof UiConfig)[] = Object.keys(UI_DEFAULTS) as (keyof UiConfig)[];
  const heeftUiUpdate = uiKeys.some(k => (data as Record<string, unknown>)[k] !== undefined);
  if (heeftUiUpdate) {
    const basis = parseUiConfig(huidige.ui_config);
    const nieuw = mergeUi(basis, data);
    set('ui_config', JSON.stringify(nieuw));
  }

  if (velden.length > 0) {
    waarden.push(id);
    db.prepare(`UPDATE trend_panels SET ${velden.join(', ')} WHERE id = ?`).run(...waarden);
  }

  if (data.series !== undefined) {
    vervangSeries(id, data.series);
  }

  return getPanel(id);
}

function vervangSeries(panelId: number, series: SerieInput[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trend_panel_series WHERE panel_id = ?').run(panelId);
    const stmt = db.prepare(`
      INSERT INTO trend_panel_series
        (panel_id, volgorde, label, kleur, as_zijde, serie_type, bron_type, bron_id, meting, bedragen_omkeren)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    series.forEach((s, idx) => {
      stmt.run(
        panelId, idx,
        s.label ?? null,
        s.kleur,
        s.as_zijde,
        s.serie_type,
        s.bron_type,
        s.bron_id,
        s.meting,
        s.bedragen_omkeren ? 1 : 0,
      );
    });
  });
  tx();
}

export function deletePanel(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM trend_panels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function duplicatePanel(id: number): TrendPanel | null {
  const panel = getPanel(id);
  if (!panel) return null;

  return createPanel({
    titel: `${panel.titel} (kopie)`,
    weergave: panel.weergave,
    toon_jaarknoppen: panel.toon_jaarknoppen,
    toon_maandknoppen: panel.toon_maandknoppen,
    toon_alle_jaren: panel.toon_alle_jaren,
    grid_x: panel.grid_x,
    grid_y: panel.grid_y + panel.grid_h,
    grid_w: panel.grid_w,
    grid_h: panel.grid_h,
    x_as_schaal: panel.x_as_schaal,
    y_as_links_label: panel.y_as_links_label,
    y_as_rechts_label: panel.y_as_rechts_label,
    standaard_jaar: panel.standaard_jaar,
    standaard_maand: panel.standaard_maand,
    standaard_alle_jaren: panel.standaard_alle_jaren,
    bedragen_omkeren: panel.bedragen_omkeren,
    label_langs_lijn: panel.label_langs_lijn,
    lijn_curve: panel.lijn_curve,
    toon_nullijn: panel.toon_nullijn,
    toon_gridlijnen: panel.toon_gridlijnen,
    toon_legenda: panel.toon_legenda,
    as_kleur: panel.as_kleur,
    toon_waarden: panel.toon_waarden,
    y_links_log: panel.y_links_log,
    y_links_min: panel.y_links_min,
    y_links_max: panel.y_links_max,
    y_links_tick: panel.y_links_tick,
    y_rechts_log: panel.y_rechts_log,
    y_rechts_min: panel.y_rechts_min,
    y_rechts_max: panel.y_rechts_max,
    y_rechts_tick: panel.y_rechts_tick,
    incl_actuele_maand: panel.incl_actuele_maand,
    beschikbare_jaren: panel.beschikbare_jaren,
    beschikbare_maanden: panel.beschikbare_maanden,
    frac_y: panel.frac_y,
    frac_h: panel.frac_h,
    max_x_labels: panel.max_x_labels,
    max_waarde_labels: panel.max_waarde_labels,
    min_label_px: panel.min_label_px,
    x_labels_step: panel.x_labels_step,
    waarde_labels_step: panel.waarde_labels_step,
    series: panel.series.map(s => ({
      label: s.label,
      kleur: s.kleur,
      as_zijde: s.as_zijde,
      serie_type: s.serie_type,
      bron_type: s.bron_type,
      bron_id: s.bron_id,
      meting: s.meting,
      bedragen_omkeren: s.bedragen_omkeren,
    })),
  });
}

export function updateVolgorde(panelIds: number[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE trend_panels SET volgorde = ? WHERE id = ?');
  const tx = db.transaction(() => {
    panelIds.forEach((id, idx) => stmt.run(idx, id));
  });
  tx();
}

export interface GridLayoutItem { id: number; x: number; y: number; w: number; h: number; frac_y?: number | null; frac_h?: number | null }

// Update grid-positie + frac_y/h in één transactie. grid_* zijn kolommen
// (performance), frac_y/h leven in ui_config en vereisen parse+merge+stringify
// per rij. Dat is acceptabel: deze call gebeurt alleen bij drag/resize/verdelen,
// niet continu.
export function updateGridLayout(items: GridLayoutItem[]): void {
  const db = getDb();
  const gridStmt = db.prepare('UPDATE trend_panels SET grid_x = ?, grid_y = ?, grid_w = ?, grid_h = ? WHERE id = ?');
  const uiRead = db.prepare('SELECT ui_config FROM trend_panels WHERE id = ?');
  const uiWrite = db.prepare('UPDATE trend_panels SET ui_config = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const it of items) {
      gridStmt.run(it.x, it.y, it.w, it.h, it.id);
      if (it.frac_y !== undefined || it.frac_h !== undefined) {
        const row = uiRead.get(it.id) as { ui_config: string | null } | undefined;
        if (!row) continue;
        const ui = parseUiConfig(row.ui_config);
        if (it.frac_y !== undefined) ui.frac_y = it.frac_y ?? null;
        if (it.frac_h !== undefined) ui.frac_h = it.frac_h ?? null;
        uiWrite.run(JSON.stringify(ui), it.id);
      }
    }
  });
  tx();
}
