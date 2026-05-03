'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList, useYAxisScale, useXAxisTicks,
} from 'recharts';
import { line as d3line, curveLinear, curveMonotoneX, type CurveFactory } from 'd3-shape';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import MaandFilter from '@/components/MaandFilter';
import InfoTooltip from '@/components/InfoTooltip';
import type { Periode } from '@/lib/maandperiodes';
import { useThemeTokens } from '@/lib/useThemeTokens';

/* ── Types ──────────────────────────────────────────────────────── */

type BronType = 'rekening' | 'rekening_groep' | 'categorie' | 'subcategorie' | 'consolidatie' | 'totaal';
type ConsolidatieBronType = 'rekening' | 'categorie' | 'subcategorie';
type Meting = 'saldo' | 'uitgaven' | 'inkomsten' | 'netto' | 'aantal';
type AsZijde = 'links' | 'rechts';
type SerieType = 'lijn' | 'staaf';
type XAsSchaal = 'maand' | 'kwartaal' | 'jaar';
type Weergave = 'per_maand' | 'cumulatief';

interface TrendPanelSerie {
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

interface TrendTab { id: number; naam: string; volgorde: number }

interface TrendPanel {
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

interface TrendSerieData {
  id: number;
  label: string;
  kleur: string;
  as_zijde: AsZijde;
  serie_type: SerieType;
  data: (number | null)[];
}
interface TrendData { buckets: string[]; series: TrendSerieData[] }

interface Rekening { id: number; naam: string; kleur: string | null }
interface Subcategorie { id: number; categorie: string; naam: string }
interface BudgetPotje { id: number; naam: string; kleur: string | null }
interface RekeningGroep { id: number; naam: string }
interface Consolidatie { id: number; naam: string; bron_type: ConsolidatieBronType; volgorde: number; leden: number[] }

/* ── Constanten ─────────────────────────────────────────────────── */

const PALETTE = ['#5b8def', '#f97066', '#12b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
// GRID_MARGIN is nu dynamisch via gridSpacing state; hier stond de default.

const MAAND_KORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function fmt(val: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
}

function bucketLabel(b: string, schaal: XAsSchaal): string {
  if (schaal === 'jaar') return b;
  if (schaal === 'kwartaal') return b;
  const [jaar, maand] = b.split('-');
  const idx = parseInt(maand, 10) - 1;
  return `${MAAND_KORT[idx] ?? maand} ${jaar.slice(-2)}`;
}

/* ── Panel Chart ────────────────────────────────────────────────── */

function LineLabelsAlongCurve({ panel, data, gridCols }: { panel: TrendPanel; data: TrendData; gridCols: number }) {
  const xTicks = useXAxisTicks();
  const yScaleLinks = useYAxisScale('links');
  const yScaleRechts = useYAxisScale('rechts');

  const xByBucket = useMemo(() => {
    const m = new Map<string, number>();
    (xTicks ?? []).forEach(t => {
      if (t.value != null && t.coordinate != null) m.set(String(t.value), t.coordinate);
    });
    return m;
  }, [xTicks]);

  const curveFn: CurveFactory = panel.lijn_curve === 'linear' ? curveLinear : curveMonotoneX;
  const gen = useMemo(
    () => d3line<{ x: number; y: number }>().x(p => p.x).y(p => p.y).curve(curveFn),
    [curveFn],
  );

  // Aantal labels afgeleid van paneel-breedte (grid_w / gridCols). 100% = 4, 25% = 1.
  const breedteFractie = panel.grid_w / gridCols;
  const labelCount = Math.max(1, Math.min(4, Math.round(breedteFractie * 4)));

  const paths = useMemo(() => {
    const lijnSeries = data.series.filter(s => s.serie_type === 'lijn');
    if (lijnSeries.length === 0 || xByBucket.size === 0) return [];
    const out: { id: string; d: string; kleur: string; label: string; targetXs: number[] }[] = [];
    for (const s of lijnSeries) {
      const yScale = s.as_zijde === 'rechts' ? yScaleRechts : yScaleLinks;
      if (!yScale) continue;
      const pts = data.buckets.map((b, i) => {
        const v = s.data[i];
        if (v == null) return null;
        const x = xByBucket.get(bucketLabel(b, panel.x_as_schaal));
        const y = yScale(v);
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      }).filter((p): p is { x: number; y: number } => p !== null);
      if (pts.length < 2) continue;
      const d = gen(pts);
      if (!d) continue;

      // Verdeel labels evenredig over de segmenten, target-x = midden tussen twee markers.
      const segments = pts.length - 1;
      const count = Math.min(labelCount, segments);
      const targetXs: number[] = [];
      const gekozenSegmenten = new Set<number>();
      for (let i = 0; i < count; i++) {
        const ideaal = (i + 1) / (count + 1);
        const segIdx = Math.min(segments - 1, Math.floor(ideaal * segments));
        if (gekozenSegmenten.has(segIdx)) continue;
        gekozenSegmenten.add(segIdx);
        targetXs.push((pts[segIdx].x + pts[segIdx + 1].x) / 2);
      }
      out.push({ id: `trendlbl-${panel.id}-${s.id}`, d, kleur: s.kleur, label: s.label, targetXs });
    }
    return out;
  }, [data, panel.id, panel.x_as_schaal, xByBucket, yScaleLinks, yScaleRechts, gen, labelCount]);

  // Ref per path voor offset-berekening; ref per text voor bbox-meting.
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const textRefs = useRef<Record<string, SVGTextElement | null>>({});
  const [offsetMap, setOffsetMap] = useState<Record<string, number[]>>({});
  // Per path: total length (px) en per label gap-breedte (px) voor dasharray.
  const [pathMeta, setPathMeta] = useState<Record<string, { total: number; gapsPx: number[] }>>({});

  useLayoutEffect(() => {
    const result: Record<string, number[]> = {};
    const meta: Record<string, { total: number; gapsPx: number[] }> = {};
    for (const p of paths) {
      const el = pathRefs.current[p.id];
      if (!el) continue;
      const total = el.getTotalLength();
      if (!total) continue;
      const offsets: number[] = [];
      for (const targetX of p.targetXs) {
        let lo = 0, hi = total;
        for (let iter = 0; iter < 24; iter++) {
          const mid = (lo + hi) / 2;
          const pt = el.getPointAtLength(mid);
          if (pt.x < targetX) lo = mid;
          else hi = mid;
        }
        offsets.push((lo + hi) / 2 / total);
      }
      result[p.id] = offsets.sort((a, b) => a - b);
      meta[p.id] = { total, gapsPx: [] };
    }
    setOffsetMap(result);
    setPathMeta(meta);
  }, [paths]);

  // Tweede useLayoutEffect: meet text-breedte per label → gap-px per offset.
  useLayoutEffect(() => {
    setPathMeta(prev => {
      const out = { ...prev };
      for (const p of paths) {
        const m = prev[p.id];
        if (!m) continue;
        const offsets = offsetMap[p.id] ?? [];
        const gapsPx: number[] = [];
        for (let oi = 0; oi < offsets.length; oi++) {
          const el = textRefs.current[`${p.id}-${oi}`];
          const textPx = el?.getComputedTextLength?.() ?? 80;
          gapsPx.push(textPx + 2);
        }
        out[p.id] = { ...m, gapsPx };
      }
      return out;
    });
  }, [offsetMap, paths]);

  // Bouw strokeDasharray per path op basis van offsets + gap-breedtes.
  function buildDash(pathId: string): string | undefined {
    const m = pathMeta[pathId];
    const offsets = offsetMap[pathId] ?? [];
    if (!m || offsets.length === 0 || m.gapsPx.length !== offsets.length) return undefined;
    const parts: number[] = [];
    let cursor = 0;
    for (let i = 0; i < offsets.length; i++) {
      const centerPx = offsets[i] * m.total;
      const gapHalf = m.gapsPx[i] / 2;
      const gapStart = centerPx - gapHalf;
      const gapEnd = centerPx + gapHalf;
      parts.push(Math.max(0, gapStart - cursor));
      parts.push(Math.max(0, gapEnd - gapStart));
      cursor = gapEnd;
    }
    parts.push(Math.max(0, m.total - cursor));
    return parts.join(' ');
  }

  if (paths.length === 0) return null;

  return (
    <g>
      {/* Zichtbare lijn met gaten op label-posities. Zelfde path is textPath-bron via id. */}
      {paths.map(p => {
        const dash = buildDash(p.id);
        return (
          <path
            key={p.id} id={p.id} d={p.d} fill="none"
            stroke={p.kleur} strokeWidth={2}
            strokeDasharray={dash} strokeLinecap="butt"
            ref={(el) => { pathRefs.current[p.id] = el; }}
          />
        );
      })}
      {/* Tekst op berekende offsets. Ref per label voor breedte-meting. */}
      {paths.flatMap(p => (offsetMap[p.id] ?? []).map((off, oi) => {
        const key = `${p.id}-${oi}`;
        return (
          <text key={`txt-${key}`} fontSize={11} fill={p.kleur} fontWeight={600} dominantBaseline="central" dy={-2}
            ref={(el) => { textRefs.current[key] = el; }}>
            <textPath href={`#${p.id}`} startOffset={`${(off * 100).toFixed(2)}%`} textAnchor="middle">
              {p.label}
            </textPath>
          </text>
        );
      }))}
    </g>
  );
}

const PanelChart = memo(function PanelChart({ panel, data, gridCols, colW }: { panel: TrendPanel; data: TrendData | null; gridCols: number; colW: number }) {
  const tokens = useThemeTokens();
  // Labeldichtheid X-as: tekst-aware. Bepaal step + rotatie-hoek samen op basis van
  //   - perBucketPx (beschikbare ruimte per bucket)
  //   - tekstW: max bucket-label-breedte horizontaal (chars × charWidth)
  //   - tekstH: tekst-hoogte = fontSize × 1.1 (= benodigde breedte als tekst verticaal staat)
  // Tussen die twee uitersten interpoleren we lineair. Past zelfs verticaal niet → step++.
  // User kan step expliciet zetten via panel.x_labels_step (overschrijft auto-step;
  // angle wordt nog steeds automatisch berekend op basis van die step).
  const FONT_X = 11;       // X-as label font
  const FONT_W = 10;       // bedrag-label font (boven markers / staven)
  const GAP_X = 4;         // vaste kleine padding voor de rotatie-formule (zorgt voor visuele lucht tussen labels).
  const minLabelSpacing = Math.max(0, panel.min_label_px || 0); // user-gewenste minimum availPx voor label-bump.
  const perBucketPx = data && data.buckets.length > 0
    ? Math.max(1, (panel.grid_w * colW - 80) / data.buckets.length)
    : 999;
  // Bucket-label dimensies: hangt af van x_as_schaal. jaar="2024" (4 chars),
  // maand="Jan 24" (6 chars), kwartaal="2024-K1" (7 chars).
  const bucketChars = panel.x_as_schaal === 'jaar' ? 4 : panel.x_as_schaal === 'kwartaal' ? 7 : 6;
  const bucketW = bucketChars * FONT_X * 0.6;
  const bucketH = FONT_X * 1.1;
  // Bedrag-label dimensies: alleen relevant als toon_waarden actief is.
  // Schat de langste fmt(value) uit de werkelijke data af.
  const toonWaardenEff = panel.toon_waarden;
  let waardeChars = 0;
  if (toonWaardenEff && data) {
    for (const s of data.series) {
      for (const v of s.data) {
        if (v == null) continue;
        const len = fmt(v).length;
        if (len > waardeChars) waardeChars = len;
      }
    }
  }
  const waardeW = waardeChars * FONT_W * 0.6;
  const waardeH = FONT_W * 1.1;
  // Bij staven met N series: bedrag-labels staan op (perBucketPx / N) afstand
  // (binnen één bucket gedeeld door de N bars). Voor lijnen blijft de pitch
  // gelijk aan perBucketPx. Combineer dit later met markerStep en waardeStep.
  const aantalStavenInData = data?.series.filter(s => s.serie_type === 'staaf').length ?? 0;
  const totalBuckets = data?.buckets.length ?? 0;
  // Rotatie nodig om horizontale projectie binnen availPx te krijgen:
  //   tekstW*cos(a) + gap ≤ availPx → a = acos((availPx-gap)/tekstW)
  // Onder availPx ≤ tekstH + gap: zelfs verticale labels overlappen — meteen -90°
  // (verder roteren heeft geen zin meer; user kan markerStep zetten als overlap
  // niet acceptabel is).
  const angleNeeded = (avail: number, w: number, h: number): number => {
    if (w <= 0 || avail >= w + GAP_X) return 0;
    if (avail <= h + GAP_X) return 90;
    return Math.round(Math.acos((avail - GAP_X) / w) * 180 / Math.PI);
  };
  let markerStep = 1;
  if (panel.x_labels_step != null && panel.x_labels_step > 0) {
    markerStep = panel.x_labels_step;
  } else if (minLabelSpacing > 0) {
    // Bump alleen op user-set min_label_px; rotatie regelt overlap voor de rest.
    while (markerStep < Math.max(1, totalBuckets) && perBucketPx * markerStep < minLabelSpacing) {
      markerStep++;
    }
  }
  const waardeStep = panel.waarde_labels_step != null && panel.waarde_labels_step > 0
    ? panel.waarde_labels_step : 1;
  // Pitches bij gekozen stappen
  const bucketAvail = perBucketPx * markerStep;
  const valuePitchBase = aantalStavenInData > 0
    ? (perBucketPx * markerStep) / aantalStavenInData
    : perBucketPx * markerStep;
  const valueAvail = valuePitchBase * waardeStep;
  // Strengste rotatie-eis tussen bucket-labels en (indien actief) bedrag-labels.
  let needed = angleNeeded(bucketAvail, bucketW, bucketH);
  if (toonWaardenEff) {
    needed = Math.max(needed, angleNeeded(valueAvail, waardeW, waardeH));
  }
  const xLabelAngle = -needed;

  // chartData wordt gefilterd tot alleen zichtbare buckets. Recharts ziet
  // dus alleen de uitgedunde set: bars vullen automatisch hun band-ruimte
  // (geen handmatige barSize-rekensom meer), lijnen lopen smooth door alle
  // (=zichtbare) punten, X-as labels matchen 1-op-1 met de data-punten.
  // Per serie krijgt elke rij ook een `lab_${id}`-veld: gelijk aan `s_${id}`
  // op rijen waar een waarde-label getoond mag worden, anders null. Aparte
  // dataKey voor LabelList laat ons labels uitdunnen onafhankelijk van de
  // chart-data zelf (die houdt alle zichtbare markers).
  const chartData = useMemo(() => {
    if (!data) return [];
    const out: Record<string, string | number | null>[] = [];
    let zichtbaarIdx = 0;
    for (let i = 0; i < data.buckets.length; i++) {
      if (i % markerStep !== 0) continue;
      const toonLabel = zichtbaarIdx % waardeStep === 0;
      const rij: Record<string, string | number | null> = { bucket: bucketLabel(data.buckets[i], panel.x_as_schaal) };
      for (const s of data.series) {
        rij[`s_${s.id}`] = s.data[i];
        rij[`lab_${s.id}`] = toonLabel ? s.data[i] : null;
      }
      out.push(rij);
      zichtbaarIdx++;
    }
    return out;
  }, [data, panel.x_as_schaal, markerStep, waardeStep]);

  if (!data || data.series.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13, userSelect: 'none', pointerEvents: 'none' }}>
        Geen series gedefinieerd. Klik op het paneel om te bewerken.
      </div>
    );
  }

  const heeftRechts = data.series.some(s => s.as_zijde === 'rechts');

  const asK = panel.as_kleur || tokens.border;
  const asTextK = tokens.text;
  // Waardelabels — aparte drempels per serietype.
  // Staaf: labels zitten boven elke staaf; per-staaf-breedte is krap bij meerdere series per bucket
  //        → agressiever roteren (en eerder 90°).
  // Lijn: labels bij datapunten; veel soepeler want ze kunnen onderling wat overlap hebben (ze
  //       zitten op verschillende y-posities) → alleen bij extreme krapte kantelen.
  // Bedragen-labels (boven markers / staven) krijgen dezelfde rotatie als de X-as labels.
  const waardeAngle = xLabelAngle;
  // Extra ruimte boven de chart voor waardelabels zodat ze niet buiten beeld vallen.
  // Bij meer rotatie hebben we meer top-marge nodig (geroteerde tekst loopt verder omhoog).
  const extraTopMargin = !toonWaardenEff
    ? 0
    : Math.round(16 + (Math.abs(waardeAngle) / 90) * 50);
  // X-as height: groeit mee met rotatie. 0° = ~28px (font + padding), -90° = tekstW + padding.
  const xAxisHeight = Math.round(28 + (Math.abs(xLabelAngle) / 90) * (bucketW + 12 - 28));

  // Helper: check of een Y-as staven heeft. Zo ja, dan min op 0 forceren zodat staaf-hoogtes
  // proportioneel zijn. Tenzij de user zelf een min heeft gezet of er negatieve data is.
  const heeftStavenOpAs = (zijde: 'links' | 'rechts') =>
    data.series.some(s => s.as_zijde === zijde && s.serie_type === 'staaf');
  const heeftNegatieveDataOpAs = (zijde: 'links' | 'rechts') =>
    data.series.some(s => s.as_zijde === zijde && s.data.some(v => v != null && v < 0));
  // Data-extent per as: nodig om het andere uiteinde numeriek te maken zodra
  // de gebruiker er één invult. Recharts honoreert `allowDataOverflow` alleen
  // betrouwbaar als beide domain-grenzen getallen zijn — met 'auto' aan één
  // kant breidt-ie de fixed kant alsnog uit naar de data.
  const dataExtent = (zijde: 'links' | 'rechts'): [number, number] | null => {
    let lo = Infinity, hi = -Infinity;
    for (const s of data.series) {
      if (s.as_zijde !== zijde) continue;
      for (const v of s.data) {
        if (v == null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
  };
  const yDomain = (min: number | null, max: number | null, zijde: 'links' | 'rechts'): [number | string, number | string] => {
    if (min == null && max == null) {
      const minVal: number | string = heeftStavenOpAs(zijde) && !heeftNegatieveDataOpAs(zijde) ? 0 : 'auto';
      return [minVal, 'auto'];
    }
    const ext = dataExtent(zijde) ?? [0, 0];
    return [min != null ? min : ext[0], max != null ? max : ext[1]];
  };
  const yTicks = (min: number | null, max: number | null, tick: number | null): number[] | undefined => {
    if (tick == null || min == null || max == null || tick <= 0) return undefined;
    const out: number[] = [];
    for (let v = min; v <= max + tick / 2; v += tick) out.push(Math.round(v * 1000) / 1000);
    return out;
  };

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
      <ComposedChart data={chartData} margin={{ top: 8 + extraTopMargin, right: 16, left: 0, bottom: 8 }}>
        {panel.toon_gridlijnen && <CartesianGrid yAxisId="links" stroke={asK} strokeOpacity={0.7} horizontal vertical={false} syncWithTicks />}
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: asTextK }}
          stroke={asK}
          interval={0}
          angle={xLabelAngle}
          textAnchor={xLabelAngle === 0 ? 'middle' : 'end'}
          height={xAxisHeight}
        />
        <YAxis
          yAxisId="links"
          tick={{ fontSize: 11, fill: asTextK }}
          stroke={asK}
          scale={panel.y_links_log ? 'log' : 'auto'}
          domain={yDomain(panel.y_links_min, panel.y_links_max, 'links')}
          ticks={yTicks(panel.y_links_min, panel.y_links_max, panel.y_links_tick)}
          allowDataOverflow={panel.y_links_min != null || panel.y_links_max != null}
          tickFormatter={(v: number) => fmt(v)}
          label={panel.y_as_links_label ? { value: panel.y_as_links_label, angle: -90, position: 'insideLeft', textAnchor: 'middle', fill: asTextK, fontSize: 11 } : undefined}
        />
        {heeftRechts && (
          <YAxis
            yAxisId="rechts"
            orientation="right"
            tick={{ fontSize: 11, fill: asTextK }}
            stroke={asK}
            scale={panel.y_rechts_log ? 'log' : 'auto'}
            domain={yDomain(panel.y_rechts_min, panel.y_rechts_max, 'rechts')}
            ticks={yTicks(panel.y_rechts_min, panel.y_rechts_max, panel.y_rechts_tick)}
            allowDataOverflow={panel.y_rechts_min != null || panel.y_rechts_max != null}
            tickFormatter={(v: number) => fmt(v)}
            label={panel.y_as_rechts_label ? { value: panel.y_as_rechts_label, angle: 90, position: 'insideRight', textAnchor: 'middle', fill: asTextK, fontSize: 11 } : undefined}
          />
        )}
        {panel.toon_nullijn && (
          <ReferenceLine y={0} yAxisId="links" stroke={asTextK} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="4 3" zIndex={-50} />
        )}
        <Tooltip
          formatter={(v) => fmt(Number(v))}
          contentStyle={{ background: tokens.bgSurface, border: `1px solid ${tokens.border}`, borderRadius: 6, color: tokens.textH }}
          labelStyle={{ color: tokens.textH }}
        />
        {panel.toon_legenda && (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value, entry) => {
            // Prefix met as-indicator alleen als er series aan beide kanten hangen.
            if (!heeftRechts) return value;
            // entry.dataKey is "s_<id>" — match terug op de juiste serie.
            const dk = (entry as { dataKey?: string } | undefined)?.dataKey;
            const id = dk?.startsWith('s_') ? Number(dk.slice(2)) : NaN;
            const s = data.series.find(ss => ss.id === id);
            if (!s) return value;
            const pijl = s.as_zijde === 'rechts' ? '→' : '←';
            return <span>{pijl} {value}</span>;
          }} />
        )}
        {(() => {
          // Context-aware legend-labels: als meerdere series dezelfde bron delen, toon de meting
          // (bv. 'Uitgaven' / 'Inkomsten') ipv de bron-naam — anders zouden labels identiek zijn.
          const bronTelling = new Map<string, number>();
          for (const ps of panel.series) {
            const k = `${ps.bron_type}:${ps.bron_id ?? ''}`;
            bronTelling.set(k, (bronTelling.get(k) ?? 0) + 1);
          }
          const labelPerId = new Map<number, string>();
          for (const ps of panel.series) {
            const k = `${ps.bron_type}:${ps.bron_id ?? ''}`;
            const gedeeld = (bronTelling.get(k) ?? 0) > 1;
            labelPerId.set(ps.id, gedeeld
              ? ps.meting.charAt(0).toUpperCase() + ps.meting.slice(1)
              : (ps.label ?? ''));
          }
          return data.series.map(s => {
          const yAxisId = s.as_zijde === 'rechts' ? 'rechts' : 'links';
          const naam = labelPerId.get(s.id) || s.label;
          const key = `s_${s.id}`;
          const labelKey = `lab_${s.id}`;
          // Driehoek-markers die naar de relevante Y-as wijzen — alleen als beide assen in gebruik.
          const richtingMarker = heeftRechts;
          // Custom dot-renderer: driehoek die naar links/rechts wijst in serie-kleur.
          // Niet-zichtbare buckets hebben value=null (zie chartData-filter), dus de
          // null-check vangt automatisch de gedunde indices af.
          const customDot = richtingMarker
            ? ((props: unknown) => {
                const p = props as { cx?: number; cy?: number; value?: number | null; key?: React.Key };
                if (p.value == null || typeof p.cx !== 'number' || typeof p.cy !== 'number'
                    || !Number.isFinite(p.cx) || !Number.isFinite(p.cy)) {
                  return <g key={p.key ?? undefined} />;
                }
                const { cx, cy } = p;
                const r = 4;
                const points = s.as_zijde === 'rechts'
                  ? `${cx - r},${cy - r} ${cx + r},${cy} ${cx - r},${cy + r}` // → wijst rechts
                  : `${cx + r},${cy - r} ${cx - r},${cy} ${cx + r},${cy + r}`; // ← wijst links
                return <polygon key={p.key ?? undefined} points={points} fill={s.kleur} stroke={s.kleur} />;
              })
            : { r: 3 };

          if (s.serie_type === 'staaf') {
            return (
              <Bar key={s.id} yAxisId={yAxisId} dataKey={key} name={naam} fill={s.kleur} isAnimationActive={false}>
                {toonWaardenEff && (
                  <LabelList dataKey={labelKey} content={(props) => {
                    const p = props as { x?: number; y?: number; width?: number; value?: number | null };
                    if (p.value == null) return null;
                    const cx = (p.x ?? 0) + (p.width ?? 0) / 2;
                    const cy = (p.y ?? 0) - 6;
                    // Bij angle=0 → midden boven staaf; bij angle<0 → onderkant van label
                    // op (cx, cy), tekst loopt schuin omhoog. textAnchor='end' bij rotatie.
                    const isRot = waardeAngle !== 0;
                    return (
                      <text x={cx} y={cy} fill={s.kleur} fontSize={10}
                        textAnchor={isRot ? 'start' : 'middle'}
                        dominantBaseline={isRot ? 'central' : 'auto'}
                        transform={isRot ? `rotate(${waardeAngle}, ${cx}, ${cy})` : undefined}>
                        {fmt(Number(p.value))}
                      </text>
                    );
                  }} />
                )}
                {panel.label_langs_lijn && (
                  <LabelList dataKey={key} content={(props) => {
                    const p = props as { x?: number; y?: number; width?: number; height?: number; value?: number | null };
                    if (p.value == null) return null;
                    const bw = p.width ?? 0;
                    const bh = p.height ?? 0;
                    // Geroteerde tekst: na -90° rotatie loopt de tekst van onder naar
                    // boven door de staaf. De font-hoogte (≈ fontSize) bepaalt hoeveel
                    // bar-breedte we minimaal nodig hebben; de tekst-lengte (chars × char-w)
                    // hoeveel bar-hoogte. Schaal font mee tussen FONT_MIN en FONT_MAX op
                    // basis van bar-breedte; verberg als zelfs FONT_MIN niet meer past.
                    const FONT_MIN = 7;
                    const FONT_MAX = 11;
                    const desired = Math.floor(bw - 2);
                    if (desired < FONT_MIN) return null;
                    const fontSize = Math.min(FONT_MAX, desired);
                    const tekstLenPx = naam.length * fontSize * 0.6;
                    if (bh < tekstLenPx + 4) return null;
                    const cx = (p.x ?? 0) + bw / 2;
                    const cy = (p.y ?? 0) + bh / 2;
                    return (
                      <text x={cx} y={cy} fill="#fff" fontSize={fontSize} fontWeight={600}
                        textAnchor="middle" dominantBaseline="central"
                        transform={`rotate(-90, ${cx}, ${cy})`}
                        style={{ paintOrder: 'stroke', stroke: s.kleur, strokeWidth: Math.max(2, fontSize / 4), strokeLinejoin: 'round' }}>
                        {naam}
                      </text>
                    );
                  }} />
                )}
              </Bar>
            );
          }
          // Als label_langs_lijn aan staat, tekenen wij zelf de lijn met gaten
          // (LineLabelsAlongCurve). Recharts-lijn wordt onzichtbaar maar houdt dots + legenda.
          return (
            <Line
              key={s.id} yAxisId={yAxisId} type={panel.lijn_curve === 'linear' ? 'linear' : 'monotone'} dataKey={key} name={naam}
              stroke={s.kleur} strokeWidth={panel.label_langs_lijn ? 0 : 2}
              dot={customDot} connectNulls isAnimationActive={false}
            >
              {toonWaardenEff && (
                <LabelList dataKey={labelKey} position="top" fontSize={10} fill={s.kleur}
                  angle={waardeAngle}
                  offset={waardeAngle === 0 ? 5 : 12}
                  formatter={(v) => v == null ? '' : fmt(Number(v))} />
              )}
            </Line>
          );
        });
        })()}
        {panel.label_langs_lijn && data && <LineLabelsAlongCurve panel={panel} data={data} gridCols={gridCols} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

/* ── Panel Editor Modal ─────────────────────────────────────────── */

function PanelEditor({
  panel, onClose, onSaved, rekeningen, subcategorieen, categorieen, rekeningGroepen, consolidaties, onConsolidatiesChanged, periodes,
}: {
  panel: TrendPanel;
  onClose: () => void;
  onSaved: () => void;
  rekeningen: Rekening[];
  subcategorieen: Subcategorie[];
  categorieen: BudgetPotje[];
  rekeningGroepen: RekeningGroep[];
  consolidaties: Consolidatie[];
  onConsolidatiesChanged: () => void;
  periodes: Periode[];
}) {
  const [beheerOpen, setBeheerOpen] = useState(false);
  const [titel, setTitel] = useState(panel.titel);
  const [weergave, setWeergave] = useState<Weergave>(panel.weergave);
  const [xAsSchaal, setXAsSchaal] = useState<XAsSchaal>(panel.x_as_schaal);
  const [ylLabel, setYlLabel] = useState(panel.y_as_links_label ?? '');
  const [yrLabel, setYrLabel] = useState(panel.y_as_rechts_label ?? '');
  // Rechter Y-as aan als het y_as_rechts_label gevuld is óf als een serie op rechts staat.
  const [tweedeYAs, setTweedeYAs] = useState<boolean>(
    !!panel.y_as_rechts_label || panel.series.some(s => s.as_zijde === 'rechts'),
  );
  const [series, setSeries] = useState<TrendPanelSerie[]>(() => panel.series.map(s => ({ ...s })));
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  // Zichtbaarheid filterknoppen op paneel (view modus) — jaar (incl. "alle jaren") en maand los aanstuurbaar.
  const [toonJaarFilter, setToonJaarFilter] = useState<boolean>(
    panel.toon_jaarknoppen || panel.toon_alle_jaren,
  );
  const [toonMaandFilter, setToonMaandFilter] = useState<boolean>(panel.toon_maandknoppen);
  const [labelLangsLijn, setLabelLangsLijn] = useState<boolean>(!!panel.label_langs_lijn);
  const [lijnCurve, setLijnCurve] = useState<'monotone' | 'linear'>(panel.lijn_curve === 'linear' ? 'linear' : 'monotone');
  const [toonNullijn, setToonNullijn] = useState<boolean>(!!panel.toon_nullijn);
  const [toonGridlijnen, setToonGridlijnen] = useState<boolean>(panel.toon_gridlijnen ?? true);
  const [toonLegenda, setToonLegenda] = useState<boolean>(panel.toon_legenda ?? true);
  const [asKleur] = useState<string>(panel.as_kleur || '#2e3148');
  const [toonWaarden, setToonWaarden] = useState<boolean>(!!panel.toon_waarden);
  const [yLinksLog, setYLinksLog] = useState<boolean>(!!panel.y_links_log);
  const [yLinksMin, setYLinksMin] = useState<string>(panel.y_links_min?.toString() ?? '');
  const [yLinksMax, setYLinksMax] = useState<string>(panel.y_links_max?.toString() ?? '');
  const [yLinksTick, setYLinksTick] = useState<string>(panel.y_links_tick?.toString() ?? '');
  const [yRechtsLog, setYRechtsLog] = useState<boolean>(!!panel.y_rechts_log);
  const [yRechtsMin, setYRechtsMin] = useState<string>(panel.y_rechts_min?.toString() ?? '');
  const [yRechtsMax, setYRechtsMax] = useState<string>(panel.y_rechts_max?.toString() ?? '');
  const [yRechtsTick, setYRechtsTick] = useState<string>(panel.y_rechts_tick?.toString() ?? '');
  const [inclActueleMaand, setInclActueleMaand] = useState<boolean>(!!panel.incl_actuele_maand);
  const [beschikbareJaren, setBeschikbareJaren] = useState<number[] | null>(panel.beschikbare_jaren);
  const [beschikbareMaanden, setBeschikbareMaanden] = useState<number[] | null>(panel.beschikbare_maanden);
  const [xLabelsStep, setXLabelsStep] = useState<string>(panel.x_labels_step != null ? panel.x_labels_step.toString() : '');
  const [waardeLabelsStep, setWaardeLabelsStep] = useState<string>(panel.waarde_labels_step != null ? panel.waarde_labels_step.toString() : '');
  const [minLabelPx, setMinLabelPx] = useState<string>(panel.min_label_px?.toString() ?? '20');
  // Schaling-secties default ingeklapt — tenzij de gebruiker al iets heeft ingesteld.
  const heeftSchalingWaarden =
    !!panel.y_links_log || panel.y_links_min != null || panel.y_links_max != null || panel.y_links_tick != null
    || !!panel.y_rechts_log || panel.y_rechts_min != null || panel.y_rechts_max != null || panel.y_rechts_tick != null;
  const [schalingOpen, setSchalingOpen] = useState<boolean>(heeftSchalingWaarden);

  const alleJarenOpties = useMemo(() => [...new Set(periodes.map(p => p.jaar))].sort((a, b) => a - b), [periodes]);
  const toggleJaar = (jaar: number) => {
    const huidig = beschikbareJaren ?? alleJarenOpties;
    const nieuw = huidig.includes(jaar) ? huidig.filter(j => j !== jaar) : [...huidig, jaar].sort((a, b) => a - b);
    setBeschikbareJaren(nieuw.length === alleJarenOpties.length ? null : nieuw);
  };
  const toggleMaand = (maand: number) => {
    const huidig = beschikbareMaanden ?? [1,2,3,4,5,6,7,8,9,10,11,12];
    const nieuw = huidig.includes(maand) ? huidig.filter(m => m !== maand) : [...huidig, maand].sort((a, b) => a - b);
    setBeschikbareMaanden(nieuw.length === 12 ? null : nieuw);
  };

  const voegSerieToe = () => {
    const nieuwe: TrendPanelSerie = {
      id: -Date.now(),
      panel_id: panel.id,
      volgorde: series.length,
      label: null,
      kleur: PALETTE[series.length % PALETTE.length],
      as_zijde: 'links',
      serie_type: 'lijn',
      bron_type: 'categorie',
      bron_id: null,
      meting: 'uitgaven',
      bedragen_omkeren: false,
    };
    setSeries([...series, nieuwe]);
  };

  const updateSerie = (idx: number, patch: Partial<TrendPanelSerie>) => {
    setSeries(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const verwijderSerie = (idx: number) => {
    setSeries(prev => prev.filter((_, i) => i !== idx));
  };

  const opslaan = async () => {
    setBezig(true);
    setFout(null);
    try {
      // Rechter-as uit: forceer alle series op 'links' en wis het rechts-label
      const effSeries = tweedeYAs ? series : series.map(s => ({ ...s, as_zijde: 'links' as const }));
      const res = await fetch(`/api/trend-panels/${panel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel,
          weergave,
          x_as_schaal: xAsSchaal,
          y_as_links_label: ylLabel || null,
          y_as_rechts_label: tweedeYAs ? (yrLabel || null) : null,
          toon_jaarknoppen: toonJaarFilter,
          toon_maandknoppen: toonMaandFilter,
          toon_alle_jaren: toonJaarFilter,
          label_langs_lijn: labelLangsLijn,
          lijn_curve: lijnCurve,
          toon_nullijn: toonNullijn,
          toon_gridlijnen: toonGridlijnen,
          toon_legenda: toonLegenda,
          as_kleur: asKleur,
          toon_waarden: toonWaarden,
          y_links_log: yLinksLog,
          y_links_min: yLinksMin === '' ? null : parseFloat(yLinksMin),
          y_links_max: yLinksMax === '' ? null : parseFloat(yLinksMax),
          y_links_tick: yLinksTick === '' ? null : parseFloat(yLinksTick),
          y_rechts_log: yRechtsLog,
          y_rechts_min: yRechtsMin === '' ? null : parseFloat(yRechtsMin),
          y_rechts_max: yRechtsMax === '' ? null : parseFloat(yRechtsMax),
          y_rechts_tick: yRechtsTick === '' ? null : parseFloat(yRechtsTick),
          incl_actuele_maand: inclActueleMaand,
          beschikbare_jaren: beschikbareJaren,
          beschikbare_maanden: beschikbareMaanden,
          x_labels_step: xLabelsStep.trim() === '' ? null : Math.max(1, parseInt(xLabelsStep, 10) || 0) || null,
          waarde_labels_step: waardeLabelsStep.trim() === '' ? null : Math.max(1, parseInt(waardeLabelsStep, 10) || 0) || null,
          min_label_px: Math.max(2, parseInt(minLabelPx, 10) || 4),
          series: effSeries.map(s => ({
            label: s.label,
            kleur: s.kleur,
            as_zijde: s.as_zijde,
            serie_type: s.serie_type,
            bron_type: s.bron_type,
            bron_id: s.bron_id,
            meting: s.meting,
            bedragen_omkeren: !!s.bedragen_omkeren,
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        setFout(e.error ?? 'Opslaan mislukt.');
        setBezig(false);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Netwerkfout.');
      setBezig(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 900,
        maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid var(--border)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        color: 'var(--text)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-h)' }}>Paneel bewerken</h2>
          <InfoTooltip volledigeBreedte tekst={<>
            <p style={{ margin: '0 0 8px' }}>Hier stel je één trend-paneel volledig in. De wijzigingen worden pas opgeslagen als je onderaan op &ldquo;Opslaan&rdquo; klikt.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Titel</strong> — naam bovenin het paneel op de trends-pagina.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Weergave</strong> — &ldquo;Per periode&rdquo; (default) toont de waarde per maand/kwartaal/jaar. &ldquo;Cumulatief&rdquo; stapelt waardes op over de tijd (saldo-meting blijft per periode).</p>
            <p style={{ margin: '0 0 8px' }}><strong>X-as schaal</strong> — de bucket-grootte voor de horizontale as: per maand, kwartaal of jaar.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Tweede Y-as</strong> — als aan, kun je series aan een rechter-as hangen (handig voor schalen die niet vergelijkbaar zijn, bv. bedragen versus aantallen).</p>
            <p style={{ margin: 0 }}><strong>Y-as labels</strong> — optionele tekst bij de assen (bv. &ldquo;€&rdquo; of &ldquo;Aantal transacties&rdquo;).</p>
          </>} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13 }}>
            Titel
            <input type="text" value={titel} onChange={e => setTitel(e.target.value)} style={inputStijl} />
          </label>
          <label style={{ fontSize: 13 }}>
            Weergave
            <select value={weergave} onChange={e => setWeergave(e.target.value as Weergave)} style={inputStijl}>
              <option value="per_maand">Per periode</option>
              <option value="cumulatief">Cumulatief</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            X-as schaal
            <select value={xAsSchaal} onChange={e => setXAsSchaal(e.target.value as XAsSchaal)} style={inputStijl}>
              <option value="maand">Maand</option>
              <option value="kwartaal">Kwartaal</option>
              <option value="jaar">Jaar</option>
            </select>
          </label>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <input type="checkbox" checked={tweedeYAs} onChange={e => setTweedeYAs(e.target.checked)} />
            Tweede Y-as (rechts)
          </label>
          <label style={{ fontSize: 13 }}>
            Y-as links label
            <input type="text" value={ylLabel} onChange={e => setYlLabel(e.target.value)} placeholder="(optioneel)" style={inputStijl} />
          </label>
          {tweedeYAs && (
            <label style={{ fontSize: 13 }}>
              Y-as rechts label
              <input type="text" value={yrLabel} onChange={e => setYrLabel(e.target.value)} placeholder="(optioneel)" style={inputStijl} />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-h)' }}>Filterknoppen</h3>
          <InfoTooltip volledigeBreedte tekst={<>
            <p style={{ margin: '0 0 8px' }}>Bepaal welke filterknoppen zichtbaar zijn op dit paneel. De geselecteerde badges worden als knoppen getoond; uitgeschakelde badges zijn niet klikbaar.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Jaarknoppen</strong>: schakelt de jaarlijst in. Klik op een jaar-badge om die knop te verbergen.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Maandknoppen</strong>: schakelt de maandlijst in. Klik op een maand-badge om die knop te verbergen.</p>
            <p style={{ margin: 0 }}><strong>Actuele maand meenemen</strong>: standaard worden alleen afgesloten periodes getoond. Aanvinken om de lopende maand óók mee te nemen — handig voor real-time inzicht, maar de waarde is nog onvolledig.</p>
          </>} />
        </div>
        <div style={{ marginBottom: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={toonJaarFilter} onChange={e => setToonJaarFilter(e.target.checked)} />
              Jaarknoppen zichtbaar op paneel
            </label>
            {toonJaarFilter && alleJarenOpties.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 20 }}>
                {alleJarenOpties.map(jaar => {
                  const aan = !beschikbareJaren || beschikbareJaren.includes(jaar);
                  return (
                    <button key={jaar} type="button" onMouseDown={e => { e.preventDefault(); toggleJaar(jaar); }} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      background: aan ? 'var(--accent-dim)' : 'var(--bg-surface)',
                      color: aan ? 'var(--accent)' : 'var(--text-dim)',
                      border: aan ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid var(--border)',
                    }}>{jaar}</button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={toonMaandFilter} onChange={e => setToonMaandFilter(e.target.checked)} />
              Maandknoppen zichtbaar op paneel
            </label>
            {toonMaandFilter && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 20 }}>
                {(['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'] as const).map((label, i) => {
                  const maand = i + 1;
                  const aan = !beschikbareMaanden || beschikbareMaanden.includes(maand);
                  return (
                    <button key={maand} type="button" onMouseDown={e => { e.preventDefault(); toggleMaand(maand); }} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      background: aan ? 'var(--accent-dim)' : 'var(--bg-surface)',
                      color: aan ? 'var(--accent)' : 'var(--text-dim)',
                      border: aan ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid var(--border)',
                    }}>{label}</button>
                  );
                })}
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={inclActueleMaand} onChange={e => setInclActueleMaand(e.target.checked)} />
            Actuele (lopende) maand meenemen
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-h)' }}>Weergave</h3>
          <InfoTooltip volledigeBreedte tekst={<>
            <p style={{ margin: '0 0 8px' }}><strong>Horizontale gridlijnen</strong> — dunne lijnen bij elke Y-tick, voor visuele referentie.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Nullijn benadrukken</strong> — markeert y = 0 met een duidelijke stippellijn.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Legenda tonen</strong> — het kleur-blokje + serie-naam overzicht onderaan.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Bedragen op markers</strong> — exacte waarde boven elke datapunt.</p>
            <p style={{ margin: 0 }}><strong>Naam op serie</strong> — de serie-naam wordt op de serie zelf getekend in plaats van als label ernaast: bij lijnen in de lijn, bij staven verticaal in de staaf.</p>
          </>} />
        </div>
        <div style={{ marginBottom: 12, fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={toonGridlijnen} onChange={e => setToonGridlijnen(e.target.checked)} />
            Horizontale gridlijnen tonen
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={toonNullijn} onChange={e => setToonNullijn(e.target.checked)} />
            Nullijn benadrukken (y = 0)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={toonLegenda} onChange={e => setToonLegenda(e.target.checked)} />
            Legenda tonen
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={toonWaarden} onChange={e => setToonWaarden(e.target.checked)} />
            Bedragen op markers tonen
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={labelLangsLijn} onChange={e => setLabelLangsLijn(e.target.checked)} />
            Naam op serie <span style={{ color: 'var(--text-dim)' }}>(in lijn / boven staven)</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-h)' }}>Labeldichtheid</h3>
          <InfoTooltip volledigeBreedte tekst={<>
            <p style={{ margin: '0 0 8px' }}><strong>Min ruimte per label (px)</strong> — minimum pixel-afstand tussen opeenvolgende X-as labels. Onder deze waarde valt elke n-de label weg (step++). De rotatie zelf wordt automatisch aan de paneelbreedte aangepast: bij genoeg ruimte horizontaal, bij krap tegen verticaal. Op 0 zetten = labels worden alleen weggelaten als zelfs verticaal niet past.</p>
            <p style={{ margin: '0 0 8px' }}><strong>X-as elke n-de</strong> — overschrijft de auto-step: 1 = alle labels, 2 = elke tweede label getoond, etc. Leeg = automatisch op basis van paneelbreedte en tekst-lengte. Auto rotatie kantelt de labels en valt indien nodig labels weg om overlap te voorkomen.</p>
            <p style={{ margin: 0 }}><strong>Bedragen elke n-de</strong> — overschrijft de step voor bedrag-labels boven markers / staven. 1 = elke zichtbare marker krijgt een bedrag. Werkt alleen als &ldquo;Bedragen op markers tonen&rdquo; aan staat. Bedragen krijgen automatisch dezelfde rotatie als de X-as labels.</p>
          </>} />
        </div>
        <div style={{ marginBottom: 20, fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 16px' }}>
          <label>
            Min ruimte per label (px)
            <input type="number" min="2" max="200" value={minLabelPx} onChange={e => setMinLabelPx(e.target.value)} style={inputStijl} />
          </label>
          <label>
            X-as elke n-de
            <input type="number" min="1" max="500" value={xLabelsStep} onChange={e => setXLabelsStep(e.target.value)} placeholder="auto" style={inputStijl} />
          </label>
          <label>
            Bedragen elke n-de
            <input type="number" min="1" max="500" value={waardeLabelsStep} onChange={e => setWaardeLabelsStep(e.target.value)} placeholder="auto" style={inputStijl} />
          </label>
        </div>

        <div style={{ fontSize: 13, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, color: 'var(--text-dim)' }}>
            Lijnvorm
            <InfoTooltip volledigeBreedte tekst={<>
              <p style={{ margin: '0 0 8px' }}><strong>Vloeiend (curve)</strong> — monotone spline tussen de datapunten. Ziet er natuurlijker uit en benadrukt trends; minder geschikt als je de precieze waarden op tussenliggende punten wilt aflezen.</p>
              <p style={{ margin: 0 }}><strong>Recht (hoekig)</strong> — linear: rechte segmenten tussen datapunten. Elke knik valt exact op een datapunt. Beter leesbaar voor wie de exacte waarden wil vergelijken.</p>
            </>} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <LijnVormTile actief={lijnCurve === 'monotone'} label="Vloeiend (curve)" type="monotone"
              onClick={() => setLijnCurve('monotone')} />
            <LijnVormTile actief={lijnCurve === 'linear'} label="Recht (hoekig)" type="linear"
              onClick={() => setLijnCurve('linear')} />
          </div>
        </div>

        {/* Log-schaal is alleen zinvol als álle series op die as altijd-positief zijn.
            saldo/netto kunnen negatief worden, dus log wordt dan geblokkeerd. */}
        {(() => {
          const POSITIEF_METINGEN = new Set(['uitgaven', 'inkomsten', 'aantal']);
          const linksPositief = series.length > 0 && series.every(s => s.as_zijde !== 'links' || POSITIEF_METINGEN.has(s.meting));
          const rechtsPositief = series.length > 0 && series.every(s => s.as_zijde !== 'rechts' || POSITIEF_METINGEN.has(s.meting));
          // Auto-uitschakelen als niet meer compatibel.
          if (yLinksLog && !linksPositief && yLinksLog) setTimeout(() => setYLinksLog(false), 0);
          if (yRechtsLog && !rechtsPositief) setTimeout(() => setYRechtsLog(false), 0);
          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setSchalingOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 15, fontWeight: 600, color: 'var(--text-h)', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{schalingOpen ? '▼' : '▶'}</span>
                  Schaling Y-as{tweedeYAs ? 'sen' : ''}
                </button>
                <InfoTooltip volledigeBreedte tekst={<>
                  <p style={{ margin: '0 0 8px' }}><strong>Log</strong> — logaritmische Y-as (elke stap = factor 10). Alleen bruikbaar bij altijd-positieve data (uitgaven, inkomsten, aantal). Voor data die ordes van grootte overspant.</p>
                  <p style={{ margin: '0 0 8px' }}><strong>Min / Max</strong> — vaste onder- en bovengrens. Leeg = automatisch uit de data afgeleid.</p>
                  <p style={{ margin: 0 }}><strong>Tick-interval</strong> — de afstand tussen labels op de as (bv. 500 voor elke €500). Leeg = recharts kiest zelf.</p>
                </>} />
              </div>
              {schalingOpen && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>Y-as links</div>
                  <div style={{ marginBottom: tweedeYAs ? 12 : 0, display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: linksPositief ? 1 : 0.5 }}
                      title={linksPositief ? 'Logaritmische Y-as' : 'Log kan niet met 0 of negatieve waarden (saldo/netto). Gebruik uitgaven/inkomsten/aantal.'}>
                      <input type="checkbox" checked={yLinksLog} onChange={e => setYLinksLog(e.target.checked)} disabled={!linksPositief} /> Log
                    </label>
                    <label>Min<input type="number" step="any" value={yLinksMin} onChange={e => setYLinksMin(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                    <label>Max<input type="number" step="any" value={yLinksMax} onChange={e => setYLinksMax(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                    <label>Tick-interval<input type="number" step="any" value={yLinksTick} onChange={e => setYLinksTick(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                  </div>
                  {tweedeYAs && (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>Y-as rechts</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: rechtsPositief ? 1 : 0.5 }}
                          title={rechtsPositief ? 'Logaritmische Y-as' : 'Log kan niet met 0 of negatieve waarden (saldo/netto). Gebruik uitgaven/inkomsten/aantal.'}>
                          <input type="checkbox" checked={yRechtsLog} onChange={e => setYRechtsLog(e.target.checked)} disabled={!rechtsPositief} /> Log
                        </label>
                        <label>Min<input type="number" step="any" value={yRechtsMin} onChange={e => setYRechtsMin(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                        <label>Max<input type="number" step="any" value={yRechtsMax} onChange={e => setYRechtsMax(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                        <label>Tick-interval<input type="number" step="any" value={yRechtsTick} onChange={e => setYRechtsTick(e.target.value)} placeholder="auto" style={inputStijl} /></label>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-h)' }}>Series</h3>
            <InfoTooltip volledigeBreedte tekst={<>
              <p style={{ margin: '0 0 8px' }}><strong>Kleur</strong> — kleur van de lijn of staaf. Wordt automatisch overgenomen van de categorie of rekening die je kiest; je kunt 'm daarna handmatig aanpassen.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Naam</strong> — label zoals het in de legenda en eventueel langs de lijn verschijnt. Standaard de naam van de bron.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Bron-type + Bron</strong> — welk datatype op de grafiek komt: een specifieke rekening, categorie of subcategorie. &ldquo;Totaal&rdquo; werkt op alle transacties samen.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Meting</strong> — welke waarde uit de bron getoond wordt:<br/>
                • <em>Saldo</em>: eindsaldo per periode (alleen bij rekening-bron).<br/>
                • <em>Uitgaven</em>: som van de uitgaande bedragen, als positieve waarde.<br/>
                • <em>Inkomsten</em>: som van de inkomende bedragen.<br/>
                • <em>Netto</em>: som van in- en uitgaven — zelfde waarde als de CAT-tabel op het dashboard.<br/>
                • <em>Aantal</em>: aantal transacties per periode.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Vorm</strong> — hoe de serie getekend wordt: als lijn (curve) of als staafdiagram per periode.</p>
              <p style={{ margin: 0 }}><strong>Y-as</strong> — aan welke verticale as de serie gekoppeld is (links of rechts). Alleen zichtbaar als de tweede Y-as aan staat.</p>
            </>} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setBeheerOpen(true)} style={knopStijlSec} type="button">Consolidaties beheren</button>
            <button onClick={voegSerieToe} style={knopStijlPrim} type="button">+ Serie toevoegen</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {series.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: tweedeYAs
                ? '28px 1fr 1fr 1fr 1fr 28px 90px 90px 32px'
                : '28px 1fr 1fr 1fr 1fr 28px 90px 32px',
              gap: 8, alignItems: 'center',
              padding: '0 10px', fontSize: 12, fontWeight: 600,
              color: 'var(--text-dim)',
            }}>
              <span>Kleur</span>
              <span>Naam</span>
              <span>Bron-type</span>
              <span>Bron</span>
              <span>Meting</span>
              <span title="Bedragen omkeren (negatief ↔ positief)" style={{ textAlign: 'center' }}>+/-</span>
              <span>Vorm</span>
              {tweedeYAs && <span>Y-as</span>}
              <span />
            </div>
          )}
          {series.map((s, idx) => (
            <SerieRij
              key={s.id}
              serie={s}
              rekeningen={rekeningen}
              subcategorieen={subcategorieen}
              categorieen={categorieen}
              rekeningGroepen={rekeningGroepen}
              consolidaties={consolidaties}
              toonAsZijde={tweedeYAs}
              onChange={patch => updateSerie(idx, patch)}
              onRemove={() => verwijderSerie(idx)}
            />
          ))}
          {series.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 12, border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
              Nog geen series. Klik op &ldquo;+ Serie toevoegen&rdquo;.
            </div>
          )}
        </div>

        {fout && (
          <div style={{ background: 'rgba(240, 82, 82, 0.15)', color: 'var(--red)', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12, border: '1px solid rgba(240, 82, 82, 0.3)' }}>
            {fout}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={knopStijlSec} disabled={bezig}>Annuleren</button>
          <button onClick={opslaan} style={knopStijlPrim} disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</button>
        </div>
      </div>

      {beheerOpen && (
        <ConsolidatieBeheerModal
          consolidaties={consolidaties}
          rekeningen={rekeningen}
          categorieen={categorieen}
          subcategorieen={subcategorieen}
          onClose={() => setBeheerOpen(false)}
          onChanged={onConsolidatiesChanged}
        />
      )}
    </div>
  );
}

/* ── Consolidatie beheer-modal ──────────────────────────────────── */

function ConsolidatieBeheerModal({
  consolidaties, rekeningen, categorieen, subcategorieen, onClose, onChanged,
}: {
  consolidaties: Consolidatie[];
  rekeningen: Rekening[];
  categorieen: BudgetPotje[];
  subcategorieen: Subcategorie[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [bewerkId, setBewerkId] = useState<number | 'nieuw' | null>(null);
  const [naam, setNaam] = useState('');
  const [bronType, setBronType] = useState<ConsolidatieBronType>('categorie');
  const [leden, setLeden] = useState<number[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const startBewerk = (c: Consolidatie) => {
    setBewerkId(c.id); setNaam(c.naam); setBronType(c.bron_type); setLeden([...c.leden]); setFout(null);
  };
  const startNieuw = () => {
    setBewerkId('nieuw'); setNaam(''); setBronType('categorie'); setLeden([]); setFout(null);
  };
  const annuleer = () => { setBewerkId(null); setFout(null); };

  const opslaan = async () => {
    const trimmed = naam.trim();
    if (!trimmed) { setFout('Naam is verplicht.'); return; }
    if (leden.length === 0) { setFout('Kies minimaal één lid.'); return; }
    setBezig(true); setFout(null);
    try {
      const url = bewerkId === 'nieuw' ? '/api/trend-consolidaties' : `/api/trend-consolidaties/${bewerkId}`;
      const method = bewerkId === 'nieuw' ? 'POST' : 'PUT';
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: trimmed, bron_type: bronType, leden }),
      });
      if (!r.ok) { setFout((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`); return; }
      onChanged();
      setBewerkId(null);
    } finally { setBezig(false); }
  };

  const verwijder = async (id: number) => {
    if (!confirm('Deze consolidatie verwijderen?')) return;
    setBezig(true);
    try {
      const r = await fetch(`/api/trend-consolidaties/${id}`, { method: 'DELETE' });
      if (r.ok) onChanged();
    } finally { setBezig(false); }
  };

  const opties: { id: number; label: string }[] = bronType === 'rekening'
    ? rekeningen.map(r => ({ id: r.id, label: r.naam }))
    : bronType === 'categorie'
      ? categorieen.map(c => ({ id: c.id, label: c.naam }))
      : subcategorieen.map(s => ({ id: s.id, label: `${s.categorie} / ${s.naam}` }));

  const toggleLid = (id: number) => {
    setLeden(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 20, width: 600, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Consolidaties beheren</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-dim)' }}>×</button>
        </div>

        {bewerkId === null ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {consolidaties.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 12, border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                  Nog geen consolidaties.
                </div>
              )}
              {consolidaties.map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.naam}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.bron_type} · {c.leden.length} leden</div>
                  </div>
                  <button onClick={() => startBewerk(c)} style={knopStijlSec} type="button">Bewerk</button>
                  <button onClick={() => verwijder(c.id)} disabled={bezig} style={{ ...knopStijlSec, color: 'var(--red)', borderColor: 'var(--red)' }} type="button">Verwijder</button>
                  <span />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={startNieuw} style={knopStijlPrim} type="button">+ Nieuwe consolidatie</button>
              <button onClick={onClose} style={knopStijlSec} type="button">Sluiten</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>
                Naam
                <input value={naam} onChange={e => setNaam(e.target.value)} style={inputStijl} />
              </label>
              <label style={{ fontSize: 12 }}>
                Bron-type
                <select value={bronType} onChange={e => { setBronType(e.target.value as ConsolidatieBronType); setLeden([]); }} style={inputStijl} disabled={bewerkId !== 'nieuw'}>
                  <option value="rekening">Rekening</option>
                  <option value="categorie">Categorie</option>
                  <option value="subcategorie">Subcategorie</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Leden ({leden.length})</div>
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                {opties.map(o => (
                  <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={leden.includes(o.id)} onChange={() => toggleLid(o.id)} />
                    <span>{o.label}</span>
                  </label>
                ))}
                {opties.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>Geen opties.</div>}
              </div>
            </div>
            {fout && <div style={{ background: 'rgba(240, 82, 82, 0.15)', color: 'var(--red)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 8 }}>{fout}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={annuleer} style={knopStijlSec} disabled={bezig} type="button">Annuleren</button>
              <button onClick={opslaan} style={knopStijlPrim} disabled={bezig} type="button">{bezig ? 'Bezig…' : 'Opslaan'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Lijnvorm keuzetegel met SVG preview ────────────────────────── */

function LijnVormTile({ actief, label, type, onClick }: { actief: boolean; label: string; type: 'monotone' | 'linear'; onClick: () => void }) {
  // Sample-punten: grote y-uitslagen zodat curve vs hoekig duidelijk contrasteert.
  const punten: { x: number; y: number }[] = [
    { x: 10,  y: 17 },
    { x: 62,  y: 3  },
    { x: 114, y: 17 },
    { x: 166, y: 3  },
    { x: 198, y: 10 },
  ];
  const gen = d3line<{ x: number; y: number }>().x(p => p.x).y(p => p.y)
    .curve(type === 'monotone' ? curveMonotoneX : curveLinear);
  const d = gen(punten) ?? '';
  const accent = actief ? 'var(--accent)' : 'var(--text-dim)';
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: 10, cursor: 'pointer',
      background: actief ? 'var(--accent-dim)' : 'var(--bg-surface)',
      border: actief
        ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
        : '1px solid var(--border)',
      borderRadius: 8,
      color: actief ? 'var(--accent)' : 'var(--text)',
      fontSize: 13, fontWeight: 500,
    }}>
      <svg width="100%" viewBox="0 0 208 20" style={{ display: 'block', maxWidth: 260 }}>
        <path d={d} fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {punten.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--bg-card)" stroke={accent} strokeWidth={1.5} />
        ))}
      </svg>
      <span>{label}</span>
    </button>
  );
}

function SerieRij({
  serie, rekeningen, subcategorieen, categorieen, rekeningGroepen, consolidaties, toonAsZijde, onChange, onRemove,
}: {
  serie: TrendPanelSerie;
  rekeningen: Rekening[];
  subcategorieen: Subcategorie[];
  categorieen: BudgetPotje[];
  rekeningGroepen: RekeningGroep[];
  consolidaties: Consolidatie[];
  toonAsZijde: boolean;
  onChange: (patch: Partial<TrendPanelSerie>) => void;
  onRemove: () => void;
}) {
  const toonBron = serie.bron_type !== 'totaal';

  // Auto-fill kleur + label vanuit de geselecteerde bron (rekening/categorie/subcategorie).
  const kiesBron = (bron_type: BronType, bron_id: number | null) => {
    const patch: Partial<TrendPanelSerie> = { bron_type, bron_id };
    if (bron_type === 'rekening' && bron_id != null) {
      const r = rekeningen.find(x => x.id === bron_id);
      if (r) { patch.kleur = r.kleur ?? serie.kleur; patch.label = r.naam; }
    } else if (bron_type === 'rekening_groep' && bron_id != null) {
      const g = rekeningGroepen.find(x => x.id === bron_id);
      if (g) patch.label = g.naam;
    } else if (bron_type === 'categorie' && bron_id != null) {
      const c = categorieen.find(x => x.id === bron_id);
      if (c) { patch.kleur = c.kleur ?? serie.kleur; patch.label = c.naam; }
    } else if (bron_type === 'subcategorie' && bron_id != null) {
      const s = subcategorieen.find(x => x.id === bron_id);
      if (s) {
        const parent = categorieen.find(c => c.naam === s.categorie);
        if (parent?.kleur) patch.kleur = parent.kleur;
        patch.label = s.naam;
      }
    } else if (bron_type === 'consolidatie' && bron_id != null) {
      const c = consolidaties.find(x => x.id === bron_id);
      if (c) patch.label = c.naam;
    } else if (bron_type === 'totaal') {
      patch.label = 'Totaal';
    }
    onChange(patch);
  };

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: 10,
      background: 'var(--bg-surface)',
      display: 'grid',
      gridTemplateColumns: toonAsZijde
        ? '28px 1fr 1fr 1fr 1fr 28px 90px 90px 32px'
        : '28px 1fr 1fr 1fr 1fr 28px 90px 32px',
      gap: 8, alignItems: 'center', fontSize: 12,
    }}>
      <input
        type="color" value={serie.kleur}
        onChange={e => onChange({ kleur: e.target.value })}
        style={{ width: 28, height: 28, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}
        title="Kleur"
      />

      <input
        type="text" value={serie.label ?? ''}
        onChange={e => onChange({ label: e.target.value || null })}
        placeholder="Label (optioneel)"
        style={inputStijl}
      />

      <select value={serie.bron_type} onChange={e => {
        const bt = e.target.value as BronType;
        kiesBron(bt, bt === 'totaal' ? null : null);
      }} style={inputStijl}>
        <option value="rekening">Rekening</option>
        <option value="rekening_groep">Rekeninggroep</option>
        <option value="categorie">Categorie</option>
        <option value="subcategorie">Subcategorie</option>
        <option value="consolidatie">Consolidatie</option>
        <option value="totaal">Totaal (alles)</option>
      </select>

      {toonBron ? (
        serie.bron_type === 'rekening' ? (
          <select value={serie.bron_id ?? ''} onChange={e => kiesBron('rekening', e.target.value ? Number(e.target.value) : null)} style={inputStijl}>
            <option value="">— kies rekening —</option>
            {rekeningen.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
          </select>
        ) : serie.bron_type === 'rekening_groep' ? (
          <select value={serie.bron_id ?? ''} onChange={e => kiesBron('rekening_groep', e.target.value ? Number(e.target.value) : null)} style={inputStijl}>
            <option value="">— kies groep —</option>
            {rekeningGroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
          </select>
        ) : serie.bron_type === 'categorie' ? (
          <select value={serie.bron_id ?? ''} onChange={e => kiesBron('categorie', e.target.value ? Number(e.target.value) : null)} style={inputStijl}>
            <option value="">— kies categorie —</option>
            {categorieen.map(c => (
              <option key={c.id} value={c.id}>{c.naam}</option>
            ))}
          </select>
        ) : serie.bron_type === 'subcategorie' ? (
          <select value={serie.bron_id ?? ''} onChange={e => kiesBron('subcategorie', e.target.value ? Number(e.target.value) : null)} style={inputStijl}>
            <option value="">— kies subcategorie —</option>
            {subcategorieen.map(s => <option key={s.id} value={s.id}>{s.categorie} / {s.naam}</option>)}
          </select>
        ) : (
          <select value={serie.bron_id ?? ''} onChange={e => kiesBron('consolidatie', e.target.value ? Number(e.target.value) : null)} style={inputStijl}>
            <option value="">— kies consolidatie —</option>
            {consolidaties.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
          </select>
        )
      ) : (
        <div style={{ color: 'var(--text-dim)' }}>&mdash;</div>
      )}

      <select value={serie.meting} onChange={e => onChange({ meting: e.target.value as Meting })} style={inputStijl}>
        <option value="saldo">Saldo</option>
        <option value="uitgaven">Uitgaven</option>
        <option value="inkomsten">Inkomsten</option>
        <option value="netto">Netto</option>
        <option value="aantal">Aantal</option>
      </select>

      <label title="Bedragen omkeren (negatief ↔ positief). Niet van toepassing op meting 'Aantal'."
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
        <input type="checkbox" checked={!!serie.bedragen_omkeren && serie.meting !== 'aantal'}
          disabled={serie.meting === 'aantal'}
          onChange={e => onChange({ bedragen_omkeren: e.target.checked })} />
      </label>

      <select value={serie.serie_type} onChange={e => onChange({ serie_type: e.target.value as SerieType })} style={inputStijl}>
        <option value="lijn">Lijn</option>
        <option value="staaf">Staaf</option>
      </select>

      {toonAsZijde && (
        <select value={serie.as_zijde} onChange={e => onChange({ as_zijde: e.target.value as AsZijde })} style={inputStijl}>
          <option value="links">Y links</option>
          <option value="rechts">Y rechts</option>
        </select>
      )}

      <button onClick={onRemove} title="Verwijder" style={{
        width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--red)', fontSize: 18, lineHeight: 1,
      }}>&times;</button>
    </div>
  );
}

/* ── Per-paneel filter (view mode) ──────────────────────────────── */

function PaneelFilter({
  paneel, periodes, huidig, setHuidig,
}: {
  paneel: TrendPanel;
  periodes: Periode[];
  huidig: { jaar: number; maand: number | null; alle: boolean } | undefined;
  setHuidig: (v: { jaar: number; maand: number | null; alle: boolean }) => void;
}) {
  const alle  = huidig ? huidig.alle : paneel.standaard_alle_jaren;
  const jaar  = huidig ? huidig.jaar : (paneel.standaard_jaar ?? new Date().getFullYear());
  const maand = huidig ? huidig.maand : paneel.standaard_maand;
  const geselP = useMemo(() => (maand != null ? periodes.find(p => p.jaar === jaar && p.maand === maand) ?? null : null), [periodes, jaar, maand]);

  return (
    <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <MaandFilter
        periodes={periodes}
        geselecteerdJaar={jaar}
        geselecteerdePeriode={geselP}
        toonAlle={paneel.toon_maandknoppen}
        toonAlleJaren={paneel.toon_alle_jaren}
        toonJaren={paneel.toon_jaarknoppen}
        toonMaanden={paneel.toon_maandknoppen}
        alleJarenActief={alle}
        onAlleJaren={() => setHuidig({ jaar, maand: null, alle: true })}
        onJaarChange={(j) => setHuidig({ jaar: j, maand: null, alle: false })}
        onPeriodeChange={(p) => {
          if (p) setHuidig({ jaar: p.jaar, maand: p.maand, alle: false });
          else setHuidig({ jaar, maand: null, alle });
        }}
        beschikbareJaren={paneel.beschikbare_jaren ?? undefined}
        beschikbareMaanden={paneel.beschikbare_maanden ?? undefined}
      />
    </div>
  );
}

/* ── Stijlen ────────────────────────────────────────────────────── */

const inputStijl: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg-surface)', color: 'var(--text-h)', marginTop: 2,
};
const knopStijlPrim: React.CSSProperties = {
  padding: '7px 16px', background: 'var(--accent-dim)', color: 'var(--accent)',
  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const knopStijlSec: React.CSSProperties = {
  padding: '7px 16px', background: 'var(--bg-base)', color: 'var(--text-h)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};

/* ── Hoofdpagina ────────────────────────────────────────────────── */

export default function TrendsPage() {
  const [panels, setPanels] = useState<TrendPanel[]>([]);
  const [dataPerPanel, setDataPerPanel] = useState<Record<number, TrendData | null>>({});
  const [rekeningen, setRekeningen] = useState<Rekening[]>([]);
  const [subcategorieen, setSubcategorieen] = useState<Subcategorie[]>([]);
  const [categorieen, setCategorieen] = useState<BudgetPotje[]>([]);
  const [rekeningGroepen, setRekeningGroepen] = useState<RekeningGroep[]>([]);
  const [consolidaties, setConsolidaties] = useState<Consolidatie[]>([]);
  const [editPanel, setEditPanel] = useState<TrendPanel | null>(null);
  // 0 betekent "nog niet gemeten" — GridLayout wordt niet gerenderd tot eerste meting.
  // Voorkomt dat panelen op fallback-breedte 1200 renderen en visueel te klein blijven
  // omdat RGL positie-transforms cachet bij eerste paint.
  const [breedte, setBreedte] = useState(0);
  const [vensterHoogte, setVensterHoogte] = useState(0);
  const [laadfout, setLaadfout] = useState<string | null>(null);
  const [bewerkModus, setBewerkModus] = useState(false);
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  // Per-paneel periode-keuze (runtime; default = panel.standaard_*)
  const [paneelPeriode, setPaneelPeriode] = useState<Record<number, { jaar: number; maand: number | null; alle: boolean }>>({});
  const [gridCols, setGridCols] = useState<number>(48);
  const [instLoaded, setInstLoaded] = useState<boolean>(false);
  const [gridSpacing, setGridSpacing] = useState<number>(1);
  const [geselecteerdeIds, setGeselecteerdeIds] = useState<Set<number>>(new Set());
  const [selecteerModus, setSelecteerModus] = useState<boolean>(false);
  const [extraRijen, setExtraRijen] = useState<number>(0);
  const [tabs, setTabs] = useState<TrendTab[]>([]);
  const [actieveTabId, setActieveTabId] = useState<number | null>(null);
  const [hernoemTabId, setHernoemTabId] = useState<number | null>(null);
  const [hernoemNaam, setHernoemNaam] = useState<string>('');

  // Klik buiten een paneel (of toolbar) heft selectie op.
  useEffect(() => {
    if (geselecteerdeIds.size === 0) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      // Panelen: wel respecteren (ctrl+klik werkt daar). Toolbar-knoppen: ook niet clearen.
      if (el.closest('.react-grid-item') || el.closest('button') || el.closest('input') || el.closest('label')) return;
      setGeselecteerdeIds(new Set());
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [geselecteerdeIds]);

  // Bepaalt datum-range voor een paneel op basis van runtime-state of default.
  const berekenPeriodeRange = useCallback((p: TrendPanel): { van?: string; tot?: string } => {
    const override = paneelPeriode[p.id];
    const alle = override ? override.alle : p.standaard_alle_jaren;
    const jaar = override ? override.jaar : (p.standaard_jaar ?? new Date().getFullYear());
    const maand = override ? override.maand : p.standaard_maand;
    if (alle && maand == null) return {};
    if (maand != null) {
      const pMatch = periodes.find(pp => pp.jaar === jaar && pp.maand === maand);
      if (pMatch) return { van: pMatch.start, tot: pMatch.eind };
      return {};
    }
    const jaarPeriodes = periodes.filter(pp => pp.jaar === jaar && pp.status !== 'toekomstig');
    if (jaarPeriodes.length === 0) return {};
    return { van: jaarPeriodes[0].start, tot: jaarPeriodes[jaarPeriodes.length - 1].eind };
  }, [paneelPeriode, periodes]);

  // Eén bulk-fetch voor alle panelen ipv N parallelle calls (browser cap = 6 concurrent).
  // Bij "alle jaren" stuurt de API geen datum-range, dus uitgesloten jaren
  // (beschikbare_jaren-lijst uit de trend-builder) komen toch mee. De API
  // kent geen jaar-lijst-filter, dus hier client-side buckets droppen en
  // de bijbehorende waarden uit elke serie knippen. Bucket-string begint
  // altijd met YYYY (zie formatXLabel r110-114).
  const laadAllePanelData = useCallback(async (lijst: TrendPanel[]) => {
    if (lijst.length === 0) return;
    const items = lijst.map(p => {
      const range = berekenPeriodeRange(p);
      return { id: p.id, datum_van: range.van, datum_tot: range.tot };
    });
    try {
      const r = await fetch('/api/trend-data/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items), cache: 'no-store',
      });
      if (!r.ok) return;
      const resp = await r.json() as { data: Record<string, TrendData> };
      setDataPerPanel(prev => {
        const next = { ...prev };
        for (const p of lijst) {
          const d = resp.data[p.id];
          if (!d) continue;
          const override = paneelPeriode[p.id];
          const alle = override ? override.alle : p.standaard_alle_jaren;
          if (alle && p.beschikbare_jaren && p.beschikbare_jaren.length > 0) {
            const toegestaan = new Set(p.beschikbare_jaren);
            const houdIdx: number[] = [];
            const filteredBuckets: string[] = [];
            d.buckets.forEach((b, i) => {
              if (toegestaan.has(parseInt(b.slice(0, 4), 10))) {
                houdIdx.push(i);
                filteredBuckets.push(b);
              }
            });
            const filteredSeries = d.series.map(s => ({ ...s, data: houdIdx.map(i => s.data[i]) }));
            next[p.id] = { buckets: filteredBuckets, series: filteredSeries };
          } else {
            next[p.id] = d;
          }
        }
        return next;
      });
    } catch { /* stil */ }
  }, [berekenPeriodeRange, paneelPeriode]);

  const laadPanels = useCallback(async () => {
    try {
      const res = await fetch('/api/trend-panels', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as TrendPanel[];
      setPanels(data);
      setLaadfout(null);
    } catch (err) {
      setLaadfout(err instanceof Error ? err.message : 'Laden mislukt.');
    }
  }, []);

  // Fetch data voor alle panelen als panels of periode-config wijzigen
  useEffect(() => {
    laadAllePanelData(panels);
  }, [panels, laadAllePanelData]);

  // Mount-eenmalig: alle statische data via één bootstrap-roundtrip
  // (lookupData + tabs + periodes + instellingen + panels). Vervangt 5 losse fetches.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/trends/bootstrap', { cache: 'no-store' });
        if (!r.ok) { setLaadfout(`HTTP ${r.status}`); return; }
        const d = await r.json() as {
          lookupData?: { rekeningen?: typeof rekeningen | null; subcategorieen?: typeof subcategorieen | null; budgettenPotjes?: typeof categorieen | null; rekeningGroepen?: RekeningGroep[] | null } | null;
          tabs?: TrendTab[] | null;
          periodes?: Periode[] | null;
          instellingen?: { trendsGridCols?: number; trendsGridSpacing?: number } | null;
          panels?: TrendPanel[] | null;
          consolidaties?: Consolidatie[] | null;
        };

        if (d.lookupData) {
          setRekeningen(d.lookupData.rekeningen ?? []);
          setSubcategorieen(d.lookupData.subcategorieen ?? []);
          setCategorieen(d.lookupData.budgettenPotjes ?? []);
          setRekeningGroepen(d.lookupData.rekeningGroepen ?? []);
        }
        setConsolidaties(d.consolidaties ?? []);

        // Zorg dat er altijd minstens één tab is (eerste keer dat deze versie draait zonder migratie-panelen).
        let tabs: TrendTab[] = d.tabs ?? [];
        if (tabs.length === 0) {
          try {
            const res = await fetch('/api/trend-tabs', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ naam: 'Trends Dashboard' }),
            });
            if (res.ok) tabs = [await res.json() as TrendTab];
          } catch { /* stil */ }
        }
        setTabs(tabs);
        if (tabs.length > 0) setActieveTabId(prev => prev ?? tabs[0].id);

        setPeriodes(d.periodes ?? []);

        const inst = d.instellingen;
        if (inst?.trendsGridCols) setGridCols(inst.trendsGridCols);
        // Semantiek gewijzigd van pixels naar gridcellen. Oude waarden > 5 resetten naar default (1).
        if (typeof inst?.trendsGridSpacing === 'number') {
          const v = inst.trendsGridSpacing;
          setGridSpacing(v > 5 ? 1 : Math.max(0, v));
          if (v > 5) {
            fetch('/api/instellingen', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trendsGridSpacing: 1 }) }).catch(() => {});
          }
        }

        setPanels(d.panels ?? []);
        setLaadfout(null);
      } catch (err) {
        setLaadfout(err instanceof Error ? err.message : 'Bootstrap mislukt.');
      } finally {
        setInstLoaded(true);
      }
    })();
  }, []);

  const updateGridCols = (n: number) => {
    setGridCols(n);
    fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trendsGridCols: n }),
    }).catch(() => {});
  };
  const updateGridSpacing = (n: number) => {
    setGridSpacing(n);
    fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trendsGridSpacing: n }),
    }).catch(() => {});
  };

  // Verdeel geselecteerde (of alle) panelen evenredig over hun gezamenlijke bounding-box.
  const verdeelPanelen = (richting: 'horizontaal' | 'verticaal') => {
    const doelIds = geselecteerdeIds.size > 0 ? geselecteerdeIds : new Set(zichtbarePanels.map(p => p.id));
    const doelen = zichtbarePanels.filter(p => doelIds.has(p.id));
    if (doelen.length === 0) return;
    // Horizontaal verdelen gebruikt volledige grid-breedte. Verticaal verdelen respecteert de
    // bounding-box van de selectie — anders overlappen verdeelde panelen andere panelen erboven.
    const bx    = 0;
    const bxEnd = gridCols;
    const by    = 0;
    const byEnd = basisRijen + extraRijen;
    // Groepeer panelen op rij (overlap in y-range) voor verticaal verdelen — zodat
    // de huidige layout-structuur (bv. 1 full-width top + 2 side-by-side onder) behouden blijft.
    const groepeerRijen = (lijst: typeof doelen) => {
      const sorted = [...lijst].sort((a, b) => a.grid_y - b.grid_y);
      const rijen: (typeof doelen)[] = [];
      for (const p of sorted) {
        const rij = rijen.find(r => r.some(q =>
          !(q.grid_y + q.grid_h <= p.grid_y || p.grid_y + p.grid_h <= q.grid_y)
        ));
        if (rij) rij.push(p); else rijen.push([p]);
      }
      return rijen;
    };
    // Idem voor kolommen op basis van x-overlap.
    const groepeerKolommen = (lijst: typeof doelen) => {
      const sorted = [...lijst].sort((a, b) => a.grid_x - b.grid_x);
      const kolommen: (typeof doelen)[] = [];
      for (const p of sorted) {
        const kolom = kolommen.find(k => k.some(q =>
          !(q.grid_x + q.grid_w <= p.grid_x || p.grid_x + p.grid_w <= q.grid_x)
        ));
        if (kolom) kolom.push(p); else kolommen.push([p]);
      }
      return kolommen;
    };

    const tr = totalRijenRef.current;
    const nieuweLayout: { id: number; x: number; y: number; w: number; h: number; frac_y: number; frac_h: number }[] = [];
    if (richting === 'horizontaal') {
      const kolommen = groepeerKolommen(doelen);
      const K = kolommen.length;
      const gaps = (K - 1) * gridSpacing;
      const beschikbaar = Math.max(K, bxEnd - bx - gaps);
      kolommen.forEach((kolom, i) => {
        const wStart = Math.round(i * beschikbaar / K);
        const wEnd = Math.round((i + 1) * beschikbaar / K);
        const kX = bx + wStart + i * gridSpacing;
        const kW = Math.max(1, wEnd - wStart);
        for (const p of kolom) {
          const scaledY = p.frac_y != null ? Math.round(p.frac_y * tr) : p.grid_y;
          const scaledH = p.frac_h != null ? Math.max(1, Math.round(p.frac_h * tr)) : p.grid_h;
          nieuweLayout.push({ id: p.id, x: kX, y: scaledY, w: kW, h: scaledH, frac_y: scaledY / tr, frac_h: scaledH / tr });
        }
      });
    } else {
      const rijen = groepeerRijen(doelen);
      const R = rijen.length;
      const gaps = (R - 1) * gridSpacing;
      const beschikbaar = Math.max(R, byEnd - by - gaps);
      rijen.forEach((rij, i) => {
        const hStart = Math.round(i * beschikbaar / R);
        const hEnd = Math.round((i + 1) * beschikbaar / R);
        const rY = by + hStart + i * gridSpacing;
        const rH = Math.max(1, hEnd - hStart);
        for (const p of rij) {
          nieuweLayout.push({ id: p.id, x: p.grid_x, y: rY, w: p.grid_w, h: rH, frac_y: rY / tr, frac_h: rH / tr });
        }
      });
    }
    setPanels(prev => prev.map(p => {
      const l = nieuweLayout.find(ll => ll.id === p.id);
      return l ? { ...p, grid_x: l.x, grid_y: l.y, grid_w: l.w, grid_h: l.h, frac_y: l.frac_y, frac_h: l.frac_h } : p;
    }));
    fetch('/api/trend-panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: nieuweLayout }),
    }).catch(() => {});
  };

  // Panels worden initieel geladen via /api/trends/bootstrap (mount-useEffect hierboven).
  // `laadPanels` blijft als callback voor refresh na CRUD-acties (create/delete/update panel).

  // useLayoutEffect zodat meting vóór eerste paint gebeurt — anders rendert GridLayout
  // met breedte=0 (skip) en paint-dan-meet geeft 1-frame verkeerde afmetingen.
  // ResizeObserver i.p.v. alleen window.resize: vangt ook sidebar-toggle op (geen resize-event).
  useLayoutEffect(() => {
    const el = document.getElementById('trends-grid-container');
    const meet = () => {
      const w = el ? el.clientWidth : 0;
      if (w > 0) setBreedte(w);
      setVensterHoogte(window.innerHeight);
    };
    meet();
    const ro = new ResizeObserver(meet);
    if (el) ro.observe(el);
    window.addEventListener('resize', meet);
    return () => { ro.disconnect(); window.removeEventListener('resize', meet); };
  }, []);

  // Kolombreedte exact volgens react-grid-layout formule. Vierkante cellen: rowHeight = colW.
  // colW = (width - 2*containerPadding - margin*(cols-1)) / cols. Met margin=0, padding=2: (breedte - 4) / cols.
  // Zichtbare panelen = panelen van de actieve tab.
  const zichtbarePanels = useMemo(
    () => actieveTabId != null ? panels.filter(p => p.tab_id === actieveTabId) : panels,
    [panels, actieveTabId],
  );

  // colW staat los van gridSpacing — het raster blijft gewoon gridCols kolommen.
  // gridSpacing wordt alleen gebruikt bij de automatische Verdeel/Stapel-functie
  // als aantal cellen tussen panelen.
  const colW = useMemo(() => (breedte - 4) / gridCols, [breedte, gridCols]);
  // Aantal rijen dat past op het scherm: (viewport - header/toolbar/tabbalk) / celhoogte.
  // 200px dekt app-header + trend-toolbar + tabbalk + marges. Minimum 12 voor kleine schermen.
  const basisRijen = useMemo(
    () => colW > 0 ? Math.max(12, Math.floor((vensterHoogte - 200) / colW)) : 20,
    [vensterHoogte, colW],
  );
  const totalRijen = useMemo(() => basisRijen + extraRijen, [basisRijen, extraRijen]);
  // Ref zodat slaLayoutOp altijd de actuele totalRijen leest vanuit de closure.
  const totalRijenRef = useRef(totalRijen);
  useEffect(() => { totalRijenRef.current = totalRijen; }, [totalRijen]);

  // Panelen zonder frac_y/frac_h krijgen bij eerste render (na breedte-meting) fracs op basis van
  // huidige totalRijen. Daarna schaalt de layout automatisch mee bij resize.
  useEffect(() => {
    if (breedte === 0) return;
    const todo = panels.filter(p => p.frac_y == null && p.grid_h > 0);
    if (todo.length === 0) return;
    const tr = totalRijen;
    const items = todo.map(p => ({
      id: p.id, x: p.grid_x, y: p.grid_y, w: p.grid_w, h: p.grid_h,
      frac_y: p.grid_y / tr,
      frac_h: p.grid_h / tr,
    }));
    setPanels(prev => prev.map(p => {
      const it = items.find(i => i.id === p.id);
      return it ? { ...p, frac_y: it.frac_y, frac_h: it.frac_h } : p;
    }));
    fetch('/api/trend-panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: items }),
    }).catch(() => {});
  }, [panels, totalRijen, breedte]);

  // Schaal grid_y/grid_h vanuit fracs zodra totalRijen stabiliseert (debounced).
  // RGL pikt echte state-wijzigingen betrouwbaarder op dan berekende layout-prop.
  const totalRijenVorigeRef = useRef<number | null>(null);
  useEffect(() => {
    if (breedte === 0) return;
    const timer = setTimeout(() => {
      if (totalRijenVorigeRef.current === totalRijen) return;
      totalRijenVorigeRef.current = totalRijen;
      const tr = totalRijen;
      const gewijzigde = panels.filter(p => p.frac_y != null && p.frac_h != null);
      if (gewijzigde.length === 0) return;
      setPanels(prev => prev.map(p => {
        if (p.frac_y == null || p.frac_h == null) return p;
        return {
          ...p,
          grid_y: Math.round(p.frac_y * tr),
          grid_h: Math.max(1, Math.round(p.frac_h * tr)),
        };
      }));
    }, 150);
    return () => clearTimeout(timer);
  }, [totalRijen, breedte, panels]);

  const layout: Layout[] = useMemo(() => zichtbarePanels.map(p => ({
    i: String(p.id),
    x: p.grid_x,
    y: p.grid_y,
    w: p.grid_w,
    h: p.grid_h,
    minW: 3, minH: 3,
    resizeHandles: ['n', 's', 'w', 'e', 'sw', 'nw', 'se', 'ne'],
  })), [zichtbarePanels]);

  // Zoek een vrije (x, y) in het raster waar een nieuw paneel van w×h past zonder overlap.
  const zoekVrijePositie = (w: number, h: number): { x: number; y: number } => {
    const bezet = (x: number, y: number) => zichtbarePanels.some(p =>
      x < p.grid_x + p.grid_w && x + w > p.grid_x &&
      y < p.grid_y + p.grid_h && y + h > p.grid_y,
    );
    const maxZoekY = Math.max(40, ...zichtbarePanels.map(p => p.grid_y + p.grid_h), 0) + h;
    for (let y = 0; y <= maxZoekY; y++) {
      for (let x = 0; x + w <= gridCols; x++) {
        if (!bezet(x, y)) return { x, y };
      }
    }
    // Fallback: onder alles
    const maxY = zichtbarePanels.length > 0 ? Math.max(...zichtbarePanels.map(p => p.grid_y + p.grid_h)) : 0;
    return { x: 0, y: maxY };
  };

  const nieuwPanel = async () => {
    if (actieveTabId == null) return;
    const w = 24, h = 12;
    const { x, y } = zoekVrijePositie(w, h);
    const res = await fetch('/api/trend-panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab_id: actieveTabId, titel: 'Nieuw paneel', grid_x: x, grid_y: y, grid_w: w, grid_h: h }),
    });
    if (res.ok) laadPanels();
  };

  const verwijderPanel = async (id: number) => {
    if (!confirm('Paneel verwijderen?')) return;
    const res = await fetch(`/api/trend-panels/${id}`, { method: 'DELETE' });
    if (res.ok) laadPanels();
  };

  // Alleen opslaan na drag/resize STOP — tijdens slepen voorkomt state-update + server POST lag.
  const slaLayoutOp = (newLayout: Layout[]) => {
    const gewijzigd = newLayout.some(l => {
      const p = panels.find(pp => String(pp.id) === l.i);
      return !p || p.grid_x !== l.x || p.grid_y !== l.y || p.grid_w !== l.w || p.grid_h !== l.h;
    });
    if (!gewijzigd) return;

    const tr = totalRijenRef.current;
    setPanels(prev => prev.map(p => {
      const l = newLayout.find(ll => ll.i === String(p.id));
      if (!l) return p;
      return { ...p, grid_x: l.x, grid_y: l.y, grid_w: l.w, grid_h: l.h, frac_y: l.y / tr, frac_h: l.h / tr };
    }));

    fetch('/api/trend-panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layout: newLayout.map(l => ({ id: Number(l.i), x: l.x, y: l.y, w: l.w, h: l.h, frac_y: l.y / tr, frac_h: l.h / tr })),
      }),
    }).catch(() => {});
  };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .bewerk-modus .react-resizable-handle {
          position: absolute !important;
          background: transparent !important;
          background-image: none !important;
          z-index: 100 !important;
          pointer-events: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
        }
        /* Paneel-wrapper mag geen eigen stacking context zijn in bewerk-modus */
        .bewerk-modus .react-grid-item > div:first-child { isolation: auto; }
        /* Drag-lag weg: geen CSS-easing tijdens bewerken */
        .bewerk-modus .react-grid-item,
        .bewerk-modus .react-grid-placeholder {
          transition: none !important;
        }
        /* Tijdens slepen/resizen chart visueel uit — browser skipt paint van de SVG */
        .react-grid-item.react-draggable-dragging .recharts-responsive-container,
        .react-grid-item.resizing .recharts-responsive-container {
          visibility: hidden;
        }
        .bewerk-modus .react-resizable-handle::after { display: none !important; }
        /* Randen: volledige lengte binnen de paneelrand, cursor signaleert de affordance */
        .bewerk-modus .react-resizable-handle-n,
        .bewerk-modus .react-resizable-handle-s {
          left: 0 !important; right: 0 !important; width: 100% !important;
          height: 8px !important; cursor: ns-resize !important;
        }
        .bewerk-modus .react-resizable-handle-n { top: 0 !important; }
        .bewerk-modus .react-resizable-handle-s { bottom: 0 !important; }
        .bewerk-modus .react-resizable-handle-w,
        .bewerk-modus .react-resizable-handle-e {
          top: 0 !important; bottom: 0 !important; height: 100% !important;
          width: 8px !important; cursor: ew-resize !important;
        }
        .bewerk-modus .react-resizable-handle-w { left: 0 !important; }
        .bewerk-modus .react-resizable-handle-e { right: 0 !important; }
        /* Hoeken: 14x14 hit-area binnen de paneelbounds, overschrijft edge-handles via z-index */
        .bewerk-modus .react-resizable-handle-nw,
        .bewerk-modus .react-resizable-handle-ne,
        .bewerk-modus .react-resizable-handle-sw,
        .bewerk-modus .react-resizable-handle-se {
          width: 14px; height: 14px; transform: none; z-index: 4;
        }
        .bewerk-modus .react-resizable-handle-nw { top: 0; left: 0; cursor: nwse-resize; }
        .bewerk-modus .react-resizable-handle-ne { top: 0; right: 0; cursor: nesw-resize; }
        .bewerk-modus .react-resizable-handle-sw { bottom: 0; left: 0; cursor: nesw-resize; }
        .bewerk-modus .react-resizable-handle-se { bottom: 0; right: 0; cursor: nwse-resize; }
        /* Hover paneel: accent border iets duidelijker — als enige visuele feedback */
        .bewerk-modus .react-grid-item:hover {
          box-shadow: 0 0 0 1px var(--accent), 0 8px 20px rgba(0,0,0,0.3);
        }
        .bewerk-modus .react-grid-placeholder {
          background: var(--accent) !important;
          opacity: 0.2 !important;
          border-radius: 10px;
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-h)' }}>Trends</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {bewerkModus ? (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                Raster
                <select
                  value={gridCols}
                  onChange={e => updateGridCols(Number(e.target.value))}
                  style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-h)', cursor: 'pointer' }}
                >
                  {[...new Set([12, 24, 36, 48, 60, 72, 96, gridCols])].sort((a, b) => a - b).map(n => (
                    <option key={n} value={n}>{n}×{n}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                Spacing
                <select
                  value={gridSpacing}
                  onChange={e => updateGridSpacing(Number(e.target.value))}
                  style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-h)', cursor: 'pointer' }}
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              {(() => {
                const actief = selecteerModus || geselecteerdeIds.size > 0;
                return (
                  <button
                    onClick={() => setSelecteerModus(v => !v)}
                    style={actief
                      ? { ...knopStijlSec, display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: 'var(--accent-dim)', color: 'var(--accent)',
                          borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
                      : { ...knopStijlSec, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    title="Selectie-modus aan/uit — klik op panelen om te selecteren (ctrl+klik werkt altijd)">
                    ☑ {geselecteerdeIds.size > 0 ? `${geselecteerdeIds.size} geselecteerd` : 'Selecteer'}
                    {geselecteerdeIds.size > 0 && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setGeselecteerdeIds(new Set()); }}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1, marginLeft: 2 }}
                        title="Selectie opheffen">✕</span>
                    )}
                  </button>
                );
              })()}
              <button onClick={() => verdeelPanelen('horizontaal')} style={knopStijlSec}
                title="Verdeel breedtes evenredig over de beschikbare horizontale ruimte">
                ⇔ Breedte verdelen
              </button>
              <button onClick={() => verdeelPanelen('verticaal')} style={knopStijlSec}
                title="Verdeel hoogtes evenredig over de beschikbare verticale ruimte">
                ⇕ Hoogte verdelen
              </button>
              <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => setExtraRijen(v => v + 4)}
                  style={{ ...knopStijlSec, border: 'none', borderRadius: 0, padding: '7px 10px' }}
                  title="4 rijen toevoegen aan de canvas">+ Rij</button>
                <button onClick={() => setExtraRijen(v => Math.max(0, v - 4))}
                  disabled={extraRijen === 0}
                  style={{ ...knopStijlSec, border: 'none', borderLeft: '1px solid var(--border)', borderRadius: 0, padding: '7px 10px', opacity: extraRijen === 0 ? 0.4 : 1 }}
                  title="4 rijen verwijderen van de canvas">− Rij</button>
              </div>
              <button onClick={nieuwPanel} style={knopStijlPrim}>+ Nieuwe grafiek</button>
              <button onClick={() => { setBewerkModus(false); setSelecteerModus(false); setGeselecteerdeIds(new Set()); }} style={knopStijlSec}>Klaar</button>
            </>
          ) : (
            <button onClick={() => setBewerkModus(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 60%, transparent), color-mix(in srgb, #8b5cf6 50%, transparent))',
              color: 'var(--text-h)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', borderRadius: 999,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              boxShadow: '0 1px 4px color-mix(in srgb, var(--accent) 20%, transparent)',
              letterSpacing: 0.2,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1"/>
                <rect x="14" y="3" width="7" height="5" rx="1"/>
                <rect x="14" y="12" width="7" height="9" rx="1"/>
                <rect x="3" y="16" width="7" height="5" rx="1"/>
              </svg>
              Naar trend builder
            </button>
          )}
        </div>
      </div>

      {laadfout && (
        <div style={{ background: 'rgba(240, 82, 82, 0.15)', color: 'var(--red)', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13, border: '1px solid rgba(240, 82, 82, 0.3)' }}>
          {laadfout}
        </div>
      )}

      {/* Tabbalk — alleen zichtbaar bij meerdere tabs of in bewerk-modus */}
      {(tabs.length > 1 || bewerkModus) && tabs.length > 0 && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)', alignItems: 'flex-end' }}>
          {tabs.map(t => {
            const actief = t.id === actieveTabId;
            const wordtHernoemd = hernoemTabId === t.id;
            return (
              <div key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                borderBottom: actief ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2, cursor: wordtHernoemd ? 'default' : 'pointer',
                color: actief ? 'var(--accent)' : 'var(--text-dim)',
                fontWeight: actief ? 600 : 400, fontSize: 13,
              }}
              onClick={() => { if (!wordtHernoemd) { setActieveTabId(t.id); setSelecteerModus(false); setGeselecteerdeIds(new Set()); } }}>
                {wordtHernoemd ? (
                  <input autoFocus value={hernoemNaam}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setHernoemNaam(e.target.value)}
                    onBlur={async () => {
                      const naam = hernoemNaam.trim();
                      if (naam && naam !== t.naam) {
                        await fetch(`/api/trend-tabs/${t.id}`, { method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ naam }) }).catch(() => {});
                        setTabs(prev => prev.map(x => x.id === t.id ? { ...x, naam } : x));
                      }
                      setHernoemTabId(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setHernoemTabId(null); }}
                    style={{ ...inputStijl, width: 120, marginTop: 0, padding: '2px 6px' }}
                  />
                ) : (
                  <span>{t.naam}</span>
                )}
                {bewerkModus && !wordtHernoemd && (
                  <>
                    <button onClick={e => { e.stopPropagation(); setHernoemTabId(t.id); setHernoemNaam(t.naam); }}
                      title="Hernoem tabblad"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'inline-flex' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    </button>
                    {tabs.length > 1 && (
                      <button onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`Tabblad "${t.naam}" verwijderen? Panelen worden verplaatst naar een ander tabblad.`)) return;
                        const res = await fetch(`/api/trend-tabs/${t.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          const nieuwe = tabs.filter(x => x.id !== t.id);
                          setTabs(nieuwe);
                          if (actieveTabId === t.id) setActieveTabId(nieuwe[0]?.id ?? null);
                          laadPanels();
                        }
                      }} title="Verwijder tabblad"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'inline-flex', fontSize: 14, lineHeight: 1 }}>
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {bewerkModus && (
            <button onClick={async () => {
              const res = await fetch('/api/trend-tabs', { method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ naam: 'Nieuw tabblad' }) });
              if (res.ok) {
                const nieuw = await res.json() as TrendTab;
                setTabs(prev => [...prev, nieuw]);
                setActieveTabId(nieuw.id);
                setSelecteerModus(false);
                setGeselecteerdeIds(new Set());
                setHernoemTabId(nieuw.id);
                setHernoemNaam(nieuw.naam);
              }
            }} title="Nieuw tabblad"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '6px 10px', fontSize: 16, fontWeight: 600 }}>
              +
            </button>
          )}
        </div>
      )}

      {zichtbarePanels.length === 0 && !laadfout && !bewerkModus && (
        <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          Nog geen panelen op dit tabblad. Klik op &ldquo;Naar trend builder&rdquo; om te beginnen.
        </div>
      )}

      <div
        id="trends-grid-container"
        className={bewerkModus ? 'bewerk-modus' : ''}
        onClick={bewerkModus ? (e) => {
          // Klik op grid-achtergrond (niet op een paneel) heft selectie op.
          if (e.target === e.currentTarget && geselecteerdeIds.size > 0) {
            setGeselecteerdeIds(new Set());
          }
        } : undefined}
        style={bewerkModus ? {
          // React-grid-layout formule (v1, containerPadding = margin):
          //   colW   = (width - margin * (cols + 1)) / cols
          //   period = colW + margin   (afstand tussen opeenvolgende cel-linkerkanten)
          //   start  = margin          (positie van eerste cel-linkerkant)
          // Rasterlijnen vallen exact op cel-grenzen → paneelranden zitten op het raster.
          // Voor vierkante cellen: rowHeight = colW.
          backgroundImage: `
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: `${colW}px ${colW}px`,
          backgroundPosition: `2px 2px`,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          minHeight: `calc(100vh - 200px + ${extraRijen * colW}px)`,
          padding: 0,
        } : undefined}
      >
        {(bewerkModus || zichtbarePanels.length > 0) && breedte > 0 && instLoaded && (
          <GridLayout
            className="layout"
            layout={layout}
            cols={gridCols}
            rowHeight={colW}
            width={breedte}
            draggableHandle=".panel-drag-handle"
            onDragStop={slaLayoutOp}
            onResizeStop={slaLayoutOp}
            compactType={null}
            allowOverlap
            autoSize={false}
            maxRows={Math.max(basisRijen + extraRijen, ...zichtbarePanels.map(p => p.grid_y + p.grid_h))}
            margin={[0, 0]}
            containerPadding={[2, 2]}
            isDraggable={bewerkModus}
            isResizable={bewerkModus}
          >
            {zichtbarePanels.map(p => {
              const isGeselecteerd = geselecteerdeIds.has(p.id);
              return (
              <div key={String(p.id)}
                onMouseDownCapture={bewerkModus ? (e) => {
                  if (e.ctrlKey) {
                    e.stopPropagation();
                    e.preventDefault();
                    setGeselecteerdeIds(prev => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                      return next;
                    });
                  }
                } : undefined}
                style={{
                background: 'var(--bg-card)',
                border: bewerkModus
                  ? (isGeselecteerd ? '2px solid var(--accent)' : '1px dashed var(--accent)')
                  : '1px solid var(--border)',
                boxShadow: isGeselecteerd ? '0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent), 0 6px 20px color-mix(in srgb, var(--accent) 25%, transparent)' : undefined,
                borderRadius: 10,
                display: 'flex', flexDirection: 'column',
                overflow: bewerkModus ? 'visible' : 'hidden',
                height: '100%', width: '100%',
                position: 'relative',
                userSelect: bewerkModus ? 'none' : undefined,
              }}>
                <div className="panel-drag-handle"
                  onMouseDownCapture={bewerkModus ? (e) => {
                    // Shift+klik of selecteer-modus: selecteer ipv drag (stop event voor rgl).
                    if (e.ctrlKey || selecteerModus) {
                      e.stopPropagation();
                      e.preventDefault();
                      setGeselecteerdeIds(prev => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        return next;
                      });
                    }
                  } : undefined}
                  style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: bewerkModus ? 'move' : 'default',
                  background: 'var(--bg-surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {bewerkModus && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setGeselecteerdeIds(prev => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                            return next;
                          });
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        title={isGeselecteerd ? 'Selectie opheffen' : 'Selecteren'}
                        style={{
                          width: 18, height: 18, padding: 0, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 4,
                          border: isGeselecteerd ? '2px solid var(--accent)' : '2px solid var(--border)',
                          background: isGeselecteerd ? 'var(--accent)' : 'transparent',
                          color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700,
                        }}>
                        {isGeselecteerd ? '✓' : ''}
                      </button>
                    )}
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>{p.titel}</span>
                  </div>
                  {bewerkModus && (
                    <button
                      onClick={e => { e.stopPropagation(); verwijderPanel(p.id); }}
                      onMouseDown={e => e.stopPropagation()}
                      title="Paneel verwijderen"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  )}
                </div>
                {(p.toon_jaarknoppen || p.toon_maandknoppen || p.toon_alle_jaren) && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                  >
                    <PaneelFilter
                      paneel={p}
                      periodes={periodes}
                      huidig={paneelPeriode[p.id]}
                      setHuidig={(v) => {
                        setPaneelPeriode(prev => ({ ...prev, [p.id]: v }));
                        // Persist: update panel defaults zodat keuze overleefd wordt bij reload / multi-device.
                        setPanels(prev => prev.map(pp => pp.id === p.id
                          ? { ...pp, standaard_jaar: v.jaar, standaard_maand: v.maand, standaard_alle_jaren: v.alle }
                          : pp));
                        fetch(`/api/trend-panels/${p.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            standaard_jaar: v.alle && v.maand == null ? null : v.jaar,
                            standaard_maand: v.maand,
                            standaard_alle_jaren: v.alle,
                          }),
                        }).catch(() => {});
                      }}
                    />
                  </div>
                )}
                <div
                  style={{ flex: 1, padding: 8, minHeight: 0, cursor: bewerkModus ? 'pointer' : 'default',
                    userSelect: bewerkModus ? 'none' : undefined }}
                  onClick={bewerkModus ? (e) => {
                    if (selecteerModus) {
                      e.stopPropagation();
                      e.preventDefault();
                      setGeselecteerdeIds(prev => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        return next;
                      });
                    } else if (!e.ctrlKey) {
                      setEditPanel(p);
                    }
                  } : undefined}
                  title={bewerkModus ? (selecteerModus ? 'Klik om te (de)selecteren' : 'Klik om te bewerken — ctrl+klik om te selecteren') : undefined}
                >
                  <PanelChart panel={p} data={dataPerPanel[p.id] ?? null} gridCols={gridCols} colW={colW} />
                </div>
              </div>
              );
            })}
          </GridLayout>
        )}
      </div>

      {editPanel && (
        <PanelEditor
          panel={editPanel}
          onClose={() => setEditPanel(null)}
          onSaved={laadPanels}
          rekeningen={rekeningen}
          subcategorieen={subcategorieen}
          categorieen={categorieen}
          rekeningGroepen={rekeningGroepen}
          consolidaties={consolidaties}
          onConsolidatiesChanged={async () => {
            try {
              const r = await fetch('/api/trend-consolidaties', { cache: 'no-store' });
              if (r.ok) setConsolidaties(await r.json());
            } catch { /* stil */ }
          }}
          periodes={periodes}
        />
      )}
    </div>
  );
}
