'use client';

import { useEffect, useRef, useState } from 'react';
import { redirect } from 'next/navigation';
import {
  STAP_LIBRARY,
  MINI_TOURS,
  DEV_STAP_OVERRIDES_KEY,
  tourstappenVoorProfiel,
  type Stap,
  type StapOverride,
  type TekenGebied,
} from '@/features/onboarding/components/OnboardingWizard';
import { DEV_PICK_RESULT_KEY } from '@/components/DevPickModus';
import { DEV_TEKEN_RESULT_KEY } from '@/components/DevTekenModus';

// Alleen beschikbaar in development
if (process.env.NODE_ENV !== 'development') {
  redirect('/');
}

type Profiel = 'potjesbeheer' | 'uitgavenbeheer';
type ViewMode = Profiel | 'beide';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveVoorProfiel(
  val: string | Partial<Record<Profiel, string>> | undefined,
  profiel: Profiel,
): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  return val[profiel] ?? Object.values(val)[0] ?? '';
}

function mergeVarianten(val: string | Partial<Record<Profiel, string>>): string {
  if (typeof val === 'string') return val;
  return Object.values(val).join('\n\n--- uitgavenbeheer ---\n\n');
}

function heeftProfielVariant(val: unknown): boolean {
  return typeof val === 'object' && val !== null;
}

const TOUR_LABELS: Record<string, string> = {
  'onboarding-volledig': 'Volledige onboarding',
  'inst-startdag': 'Startdag',
  'dashboard': 'Dashboard (volledig)',
  'dashboard-bls': 'Dashboard BLS',
  'dashboard-cat': 'Dashboard Categorie',
  'vaste-posten': 'Vaste Posten',
  'rekeningen': 'Rekeningen',
  'rekeninggroepen': 'Rekeninggroepen',
  'categorieen': 'Categorieën',
  'backup': 'Backup',
  'import': 'Import',
  'transacties': 'Transacties',
  'categorisatie': 'Categorisatie',
  'trends': 'Trends',
  'instellingen': 'Instellingen',
};

// ── UI helpers ────────────────────────────────────────────────────────────────

function Chip({ children, kleur = 'neutraal' }: { children: React.ReactNode; kleur?: 'neutraal' | 'accent' | 'oranje' | 'rood' }) {
  const kleuren = {
    neutraal: { bg: 'var(--bg)', fg: 'var(--text-dim)', br: 'var(--border)' },
    accent:   { bg: 'rgba(92,124,250,0.12)', fg: 'var(--accent)', br: 'rgba(92,124,250,0.30)' },
    oranje:   { bg: 'rgba(230,119,0,0.15)', fg: '#e67700', br: 'rgba(230,119,0,0.35)' },
    rood:     { bg: 'rgba(224,49,49,0.12)', fg: '#e03131', br: 'rgba(224,49,49,0.30)' },
  }[kleur];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
      background: kleuren.bg, color: kleuren.fg, border: `1px solid ${kleuren.br}`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function ScreenshotThumb({ pad }: { pad: string | undefined }) {
  if (!pad) return <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>geen screenshot</span>;
  return (
    <div style={{
      display: 'inline-block',
      border: '1px solid var(--border)', borderRadius: 4,
      background: 'var(--bg)', padding: 2, lineHeight: 0,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pad}
        alt={pad}
        style={{ maxHeight: 60, maxWidth: 140, objectFit: 'contain', display: 'block' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

// Inline input met subtiele styling — verschijnt als platte tekst, accent-border bij focus
const inlineInputStijl: React.CSSProperties = {
  width: '100%', padding: '4px 6px', background: 'transparent',
  border: '1px solid transparent', borderRadius: 4, color: 'var(--text)',
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none', transition: 'border-color 120ms, background 120ms',
};

function InlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inlineInputStijl, ...props.style }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.background = 'var(--bg)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.background = 'transparent';
        props.onBlur?.(e);
      }}
    />
  );
}

function InlineTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...inlineInputStijl, resize: 'vertical', minHeight: 60, lineHeight: 1.5, ...props.style }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.background = 'var(--bg)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.background = 'transparent';
        props.onBlur?.(e);
      }}
    />
  );
}

// ── Statische ballon-preview ──────────────────────────────────────────────────

function BallonPreview({ titel, tekst, afbeelding, selector, knop, compact }: {
  titel: string;
  tekst: string;
  afbeelding: string;
  selector: string | null | undefined;
  knop: string | null;
  compact: boolean;
}) {
  const breedte = compact ? 200 : 260;
  return (
    <div style={{
      width: breedte, flexShrink: 0,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 12, overflow: 'hidden',
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.3 }}>
        {titel || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>geen titel</span>}
      </p>
      <p style={{
        margin: 0, fontSize: 11, color: 'var(--text)', lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}>
        {tekst}
      </p>
      {afbeelding && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={afbeelding} alt="" style={{ width: '100%', borderRadius: 5, display: 'block' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {selector && (
        <div style={{
          fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)',
          background: 'rgba(92,124,250,0.10)',
          border: '1px solid rgba(92,124,250,0.25)',
          borderRadius: 4, padding: '2px 6px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selector}
        </div>
      )}
      {knop !== null && (
        <div style={{ textAlign: 'right' }}>
          <span style={{
            fontSize: 10, background: 'var(--accent)', color: '#fff',
            borderRadius: 5, padding: '3px 10px', display: 'inline-block',
          }}>
            {knop || 'Volgende →'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Stap-kaart met inline bewerken ────────────────────────────────────────────

type BewerkbareVelden = {
  titel: string;
  tekst: string;
  href: string;
  knop: string;
  selector: string;
  afbeeldingPad: string;
  padding: string;
};

function StapKaart({
  idx, id, stap, profiel, tourId,
  override, voorlopig, compact,
  onVeldWijzig, onVeldCommit, onReset, onWisTekenGebied,
}: {
  idx: number;
  id: string;
  stap: Stap;
  profiel: Profiel;
  tourId: string;
  override: StapOverride | undefined;
  voorlopig: Partial<BewerkbareVelden> | undefined;
  compact: boolean;
  onVeldWijzig: (field: keyof BewerkbareVelden, value: string) => void;
  onVeldCommit: (field: keyof BewerkbareVelden) => void;
  onReset: () => void;
  onWisTekenGebied: () => void;
}) {
  const heeftOverride = !!override;
  const titelVariant = heeftProfielVariant(stap.titel);
  const tekstVariant = heeftProfielVariant(stap.tekst);
  const afbeeldingVariant = !!stap.afbeelding
    && Object.keys(stap.afbeelding).length > 1
    && stap.afbeelding.potjesbeheer !== stap.afbeelding.uitgavenbeheer;

  // Display-waarde per veld: voorlopig > override > stap (profiel-resolved)
  function display(field: keyof BewerkbareVelden): string {
    if (voorlopig?.[field] !== undefined) return voorlopig[field]!;
    if (field === 'titel') {
      if (override?.titel !== undefined) return String(override.titel);
      return resolveVoorProfiel(stap.titel, profiel);
    }
    if (field === 'tekst') {
      if (override?.tekst !== undefined) return String(override.tekst);
      return resolveVoorProfiel(stap.tekst, profiel);
    }
    if (field === 'href') return String(override?.href ?? stap.href ?? '');
    if (field === 'knop') {
      const k = override?.knop !== undefined ? override.knop : stap.knop;
      return k === null ? '' : String(k ?? '');
    }
    if (field === 'selector') {
      const s = override?.selector !== undefined ? override.selector : stap.selector;
      return s == null ? '' : String(s);
    }
    if (field === 'afbeeldingPad') {
      return String(override?.afbeeldingPad ?? stap.afbeeldingPad ?? '');
    }
    if (field === 'padding') {
      const p = override?.padding ?? stap.padding;
      return p === undefined ? '' : String(p);
    }
    return '';
  }

  const screenshotPreview = resolveVoorProfiel(stap.afbeelding, profiel) || display('afbeeldingPad');

  function bekijkStap() {
    fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gebruikersProfiel: profiel }),
    }).catch(() => {});
    const stapIds = tourstappenVoorProfiel(tourId, profiel);
    const targetIndex = stapIds.indexOf(id);
    if (targetIndex === -1) return;
    window.dispatchEvent(new CustomEvent('dev-start-tour', {
      detail: { tourId, stapIndex: targetIndex },
    }));
  }

  function startPick() {
    const href = stap.href ?? '';
    const base = window.location.origin;
    window.open(`${base}${href}?dev-pick=${id}`, '_blank', 'width=1280,height=900');
  }

  function startTeken() {
    const href = stap.href ?? '';
    const base = window.location.origin;
    window.open(`${base}${href}?dev-teken=${id}`, '_blank', 'width=1280,height=900');
  }

  const tekenGebied: TekenGebied | undefined = override?.tekenGebied ?? stap.tekenGebied;

  return (
    <div style={{
      border: heeftOverride
        ? '1px solid rgba(230,119,0,0.40)'
        : '1px solid var(--border)',
      borderRadius: 8, background: 'var(--bg-card)', padding: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Kop — index, id, badges, acties */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 22, flexShrink: 0 }}>{idx + 1}</span>
        <span style={{
          fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)',
          background: 'var(--bg)', padding: '2px 6px', borderRadius: 4,
          border: '1px solid var(--border)', flexShrink: 0,
        }}>
          {id}
        </span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {heeftOverride && <Chip kleur="oranje">override</Chip>}
          {titelVariant && <Chip kleur="accent">titel-variant</Chip>}
          {tekstVariant && <Chip kleur="accent">tekst-variant</Chip>}
          {afbeeldingVariant && <Chip kleur="accent">screenshot-variant</Chip>}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={bekijkStap}
          title="Start de tour op deze stap"
          style={{
            padding: '3px 10px', fontSize: 11, background: 'var(--accent)',
            border: 'none', borderRadius: 4, color: '#fff',
            cursor: 'pointer', flexShrink: 0, fontWeight: 600,
          }}
        >
          👁 Bekijk
        </button>
        {heeftOverride && (
          <button
            onClick={onReset}
            title="Verwijder alle overrides voor deze stap"
            style={{
              padding: '3px 10px', fontSize: 11,
              background: 'rgba(224,49,49,0.10)',
              border: '1px solid rgba(224,49,49,0.30)',
              borderRadius: 4, color: '#e03131', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Body: links content, rechts iframe */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Linker kolom: alle bewerkbare velden */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {/* Titel */}
          <div>
            <InlineInput
              value={display('titel')}
              onChange={(e) => onVeldWijzig('titel', e.target.value)}
              onBlur={() => onVeldCommit('titel')}
              placeholder="Titel"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)' }}
            />
            {titelVariant && (
              <p style={{ margin: '2px 6px 0', fontSize: 10, color: '#e67700', fontStyle: 'italic' }}>
                profiel-variant — opslaan vervangt beide varianten
              </p>
            )}
          </div>

          {/* Tekst */}
          <div>
            <InlineTextarea
              value={display('tekst')}
              onChange={(e) => onVeldWijzig('tekst', e.target.value)}
              onBlur={() => onVeldCommit('tekst')}
              placeholder="Stap-tekst"
              rows={3}
            />
            {tekstVariant && (
              <p style={{ margin: '2px 6px 0', fontSize: 10, color: '#e67700', fontStyle: 'italic' }}>
                profiel-variant — opslaan vervangt beide varianten
              </p>
            )}
          </div>

          {/* Meta-veldengrid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', paddingTop: 4, borderTop: '1px dashed var(--border)', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Highlight</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <InlineInput
                value={display('selector')}
                onChange={(e) => onVeldWijzig('selector', e.target.value)}
                onBlur={() => onVeldCommit('selector')}
                placeholder="CSS-selector"
                style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}
              />
              <button onClick={startPick} title="Pick element" style={{ padding: '3px 7px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0 }}>
                ⊕ Pick
              </button>
              <button onClick={startTeken} title="Teken gebied" style={{ padding: '3px 7px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0 }}>
                ✏ Teken
              </button>
            </div>

            {tekenGebied && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Tekengebied</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent)', background: 'rgba(92,124,250,0.10)', border: '1px solid rgba(92,124,250,0.25)', borderRadius: 4, padding: '2px 6px' }}>
                    {tekenGebied.ankerSelector}
                  </code>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    +{Math.round(tekenGebied.relLeft)},{Math.round(tekenGebied.relTop)} {Math.round(tekenGebied.width)}×{Math.round(tekenGebied.height)}
                  </span>
                  <button onClick={onWisTekenGebied} style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(224,49,49,0.10)', border: '1px solid rgba(224,49,49,0.30)', borderRadius: 4, color: '#e03131', cursor: 'pointer' }}>
                    Wis
                  </button>
                </div>
              </>
            )}

            <label style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Route</label>
            <InlineInput
              value={display('href')}
              onChange={(e) => onVeldWijzig('href', e.target.value)}
              onBlur={() => onVeldCommit('href')}
              placeholder="/pagina"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />

            <label style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Knop</label>
            <InlineInput
              value={display('knop')}
              onChange={(e) => onVeldWijzig('knop', e.target.value)}
              onBlur={() => onVeldCommit('knop')}
              placeholder={stap.knop === null ? '(wacht op actie)' : 'Volgende →'}
              style={{ fontSize: 12 }}
            />

            <label style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, alignSelf: 'flex-start', paddingTop: 6 }}>Screenshot</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ScreenshotThumb pad={screenshotPreview} />
              <InlineInput
                value={display('afbeeldingPad')}
                onChange={(e) => onVeldWijzig('afbeeldingPad', e.target.value)}
                onBlur={() => onVeldCommit('afbeeldingPad')}
                placeholder="/pad-naar-afbeelding.png"
                style={{ fontFamily: 'monospace', fontSize: 12, flex: 1, minWidth: 120 }}
              />
            </div>

            <label style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Padding</label>
            <InlineInput
              value={display('padding')}
              onChange={(e) => onVeldWijzig('padding', e.target.value)}
              onBlur={() => onVeldCommit('padding')}
              placeholder="10"
              type="number"
              style={{ fontSize: 12, maxWidth: 80 }}
            />

            {stap.wachtOp && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Wacht op</span>
                <code style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 6px' }}>{stap.wachtOp}</code>
              </>
            )}
            {stap.extraSelectors && stap.extraSelectors.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Extra</span>
                <code style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 6px', fontFamily: 'monospace' }}>
                  {stap.extraSelectors.join(', ')}
                </code>
              </>
            )}
          </div>
        </div>

        {/* Rechter kolom: ballon-preview */}
        <BallonPreview
          titel={display('titel')}
          tekst={display('tekst')}
          afbeelding={screenshotPreview}
          selector={display('selector') || (stap.selector ?? null)}
          knop={override?.knop !== undefined ? override.knop : stap.knop}
          compact={compact}
        />
      </div>
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function TourStappenPage() {
  const [geselecteerdeTour, setGeselecteerdeTour] = useState('onboarding-volledig');
  const [viewMode, setViewMode] = useState<ViewMode>('beide');
  const [overrides, setOverrides] = useState<Record<string, StapOverride>>({});
  const [voorlopig, setVoorlopig] = useState<Record<string, Partial<BewerkbareVelden>>>({});
  const overridesRef = useRef(overrides);

  useEffect(() => { overridesRef.current = overrides; }, [overrides]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEV_STAP_OVERRIDES_KEY);
      if (raw) setOverrides(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Luister op pick- en teken-resultaten van popup vensters
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === DEV_PICK_RESULT_KEY && e.newValue) {
        try {
          const { stapId, selector } = JSON.parse(e.newValue) as { stapId: string; selector: string };
          const stap = STAP_LIBRARY[stapId];
          if (!stap) return;
          const origSelector = stap.selector == null ? '' : String(stap.selector);
          const bijgewerkt = { ...overridesRef.current };
          const huidige = { ...(bijgewerkt[stapId] ?? {}) };
          if (selector === origSelector) delete huidige.selector;
          else huidige.selector = selector === '' ? null : selector;
          if (Object.keys(huidige).length > 0) bijgewerkt[stapId] = huidige;
          else delete bijgewerkt[stapId];
          slaOverridesOp(bijgewerkt);
          localStorage.removeItem(DEV_PICK_RESULT_KEY);
        } catch { /* ignore */ }
      }
      if (e.key === DEV_TEKEN_RESULT_KEY && e.newValue) {
        try {
          const { stapId, tekenGebied } = JSON.parse(e.newValue) as { stapId: string; tekenGebied: TekenGebied };
          const bijgewerkt = { ...overridesRef.current };
          bijgewerkt[stapId] = { ...(bijgewerkt[stapId] ?? {}), tekenGebied };
          slaOverridesOp(bijgewerkt);
          localStorage.removeItem(DEV_TEKEN_RESULT_KEY);
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function slaOverridesOp(nieuw: Record<string, StapOverride>) {
    setOverrides(nieuw);
    localStorage.setItem(DEV_STAP_OVERRIDES_KEY, JSON.stringify(nieuw));
  }

  function veldWijzig(id: string, field: keyof BewerkbareVelden, value: string) {
    setVoorlopig(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function veldCommit(id: string, field: keyof BewerkbareVelden) {
    const nieuweWaarde = voorlopig[id]?.[field];
    if (nieuweWaarde === undefined) return;

    const stap = STAP_LIBRARY[id];
    if (!stap) return;

    // Bepaal originele waarde (zonder override)
    let origineel = '';
    if (field === 'titel')           origineel = mergeVarianten(stap.titel);
    else if (field === 'tekst')      origineel = mergeVarianten(stap.tekst);
    else if (field === 'href')       origineel = stap.href ?? '';
    else if (field === 'knop')       origineel = stap.knop === null ? '' : (stap.knop ?? '');
    else if (field === 'selector')   origineel = stap.selector == null ? '' : String(stap.selector);
    else if (field === 'afbeeldingPad') origineel = stap.afbeeldingPad ?? '';
    else if (field === 'padding')    origineel = stap.padding === undefined ? '' : String(stap.padding);

    const bijgewerkt = { ...overrides };
    const huidige = { ...(bijgewerkt[id] ?? {}) };

    if (nieuweWaarde === origineel || (nieuweWaarde === '' && origineel === '')) {
      // Match origineel — verwijder veld uit override
      delete (huidige as Record<string, unknown>)[field];
    } else {
      // Afwijkend — zet als override
      if (field === 'knop') {
        huidige.knop = nieuweWaarde === '' ? null : nieuweWaarde;
      } else if (field === 'padding') {
        const n = parseInt(nieuweWaarde, 10);
        if (isNaN(n)) delete (huidige as Record<string, unknown>)[field];
        else huidige.padding = n;
      } else if (field === 'href' || field === 'afbeeldingPad') {
        if (nieuweWaarde === '') delete (huidige as Record<string, unknown>)[field];
        else (huidige as Record<string, unknown>)[field] = nieuweWaarde;
      } else if (field === 'selector') {
        huidige.selector = nieuweWaarde === '' ? null : nieuweWaarde;
      } else {
        (huidige as Record<string, unknown>)[field] = nieuweWaarde;
      }
    }

    if (Object.keys(huidige).length > 0) bijgewerkt[id] = huidige;
    else delete bijgewerkt[id];

    slaOverridesOp(bijgewerkt);

    // Wis voorlopig voor dit veld
    setVoorlopig(prev => {
      const copy = { ...prev };
      if (copy[id]) {
        const zonderVeld = { ...copy[id] };
        delete zonderVeld[field];
        if (Object.keys(zonderVeld).length === 0) delete copy[id];
        else copy[id] = zonderVeld;
      }
      return copy;
    });
  }

  function resetStap(id: string) {
    const bijgewerkt = { ...overrides };
    delete bijgewerkt[id];
    slaOverridesOp(bijgewerkt);
    setVoorlopig(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function resetAlles() {
    slaOverridesOp({});
    setVoorlopig({});
  }

  function wisTekenGebied(id: string) {
    const bijgewerkt = { ...overrides };
    if (bijgewerkt[id]) {
      const huidige = { ...bijgewerkt[id] };
      delete huidige.tekenGebied;
      if (Object.keys(huidige).length > 0) bijgewerkt[id] = huidige;
      else delete bijgewerkt[id];
      slaOverridesOp(bijgewerkt);
    }
  }

  const tourIds = Object.keys(MINI_TOURS);
  const stappenPotjes = tourstappenVoorProfiel(geselecteerdeTour, 'potjesbeheer');
  const stappenUitgaven = tourstappenVoorProfiel(geselecteerdeTour, 'uitgavenbeheer');
  const aantalOverrides = Object.keys(overrides).length;
  const volgordeWijktAf = stappenPotjes.join('|') !== stappenUitgaven.join('|');

  function renderKolom(profiel: Profiel, stapIds: string[], compact = false) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stapIds.map((id, idx) => {
          const stap = STAP_LIBRARY[id];
          if (!stap) return (
            <div key={id} style={{ padding: '10px 16px', background: 'rgba(224,49,49,0.08)', border: '1px solid rgba(224,49,49,0.25)', borderRadius: 8, fontSize: 12, color: '#e03131' }}>
              <strong>{idx + 1}. {id}</strong> — stap niet gevonden in STAP_LIBRARY
            </div>
          );
          return (
            <StapKaart
              key={id}
              idx={idx}
              id={id}
              stap={stap}
              profiel={profiel}
              tourId={geselecteerdeTour}
              override={overrides[id]}
              voorlopig={voorlopig[id]}
              compact={compact}
              onVeldWijzig={(field, value) => veldWijzig(id, field, value)}
              onVeldCommit={(field) => veldCommit(id, field)}
              onReset={() => resetStap(id)}
              onWisTekenGebied={() => wisTekenGebied(id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'inherit', fontSize: 13 }}>
      {/* Linkerpaneel — tours */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--bg-card)', overflowY: 'auto', padding: '16px 0',
      }}>
        <div style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Tours
          </p>
        </div>
        {tourIds.map(id => (
          <button
            key={id}
            onClick={() => setGeselecteerdeTour(id)}
            style={{
              display: 'block', width: '100%', padding: '8px 16px',
              background: geselecteerdeTour === id ? 'var(--accent-dim)' : 'transparent',
              border: 'none', borderLeft: geselecteerdeTour === id ? '3px solid var(--accent)' : '3px solid transparent',
              textAlign: 'left', cursor: 'pointer',
              color: geselecteerdeTour === id ? 'var(--accent)' : 'var(--text)',
              fontWeight: geselecteerdeTour === id ? 600 : 400,
              fontSize: 13,
            }}
          >
            {TOUR_LABELS[id] ?? id}
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
              ({MINI_TOURS[id].length})
            </span>
          </button>
        ))}
      </div>

      {/* Rechterpaneel — stappen */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-h)' }}>
              [DEV] Tour stappen
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
              {TOUR_LABELS[geselecteerdeTour] ?? geselecteerdeTour} — {MINI_TOURS[geselecteerdeTour]?.length ?? 0} stappen
              {aantalOverrides > 0 && (
                <span style={{ marginLeft: 12, color: '#e67700', fontWeight: 600 }}>
                  {aantalOverrides} override{aantalOverrides !== 1 ? 's' : ''} actief
                </span>
              )}
            </p>
          </div>
          {aantalOverrides > 0 && (
            <button
              onClick={resetAlles}
              style={{
                padding: '6px 14px', background: 'rgba(224,49,49,0.12)',
                border: '1px solid rgba(224,49,49,0.30)',
                borderRadius: 6, color: '#e03131', fontSize: 12, cursor: 'pointer',
              }}
            >
              Reset alle overrides
            </button>
          )}
        </div>

        {/* Profiel-toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-card)', padding: 4, borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content' }}>
          {([
            { mode: 'potjesbeheer',  label: 'Potjesbeheer' },
            { mode: 'uitgavenbeheer', label: 'Uitgavenbeheer' },
            { mode: 'beide',          label: 'Beide naast elkaar' },
          ] as const).map(opt => (
            <button
              key={opt.mode}
              onClick={() => setViewMode(opt.mode)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: viewMode === opt.mode ? 'var(--accent)' : 'transparent',
                color: viewMode === opt.mode ? '#fff' : 'var(--text)',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {viewMode === 'beide' && volgordeWijktAf && (
          <p style={{
            margin: '0 0 12px', fontSize: 11, color: '#e67700',
            background: 'rgba(230,119,0,0.08)',
            border: '1px solid rgba(230,119,0,0.25)',
            borderRadius: 6, padding: '6px 10px',
          }}>
            De volgorde van de stappen verschilt tussen de profielen — vergelijk daarom per rij met zorg.
          </p>
        )}

        {/* Inhoud */}
        {viewMode === 'beide' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                Potjesbeheer <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({stappenPotjes.length})</span>
              </h2>
              {renderKolom('potjesbeheer', stappenPotjes, true)}
            </div>
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                Uitgavenbeheer <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({stappenUitgaven.length})</span>
              </h2>
              {renderKolom('uitgavenbeheer', stappenUitgaven, true)}
            </div>
          </div>
        ) : (
          renderKolom(viewMode, viewMode === 'potjesbeheer' ? stappenPotjes : stappenUitgaven)
        )}
      </div>
    </div>
  );
}
