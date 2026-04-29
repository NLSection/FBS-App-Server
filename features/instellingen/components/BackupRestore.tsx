// FILE: BackupRestore.tsx
// AANGEMAAKT: 29-03-2026 15:00
// VERSIE: 1
// GEWIJZIGD: 31-03-2026 12:00
//
// WIJZIGINGEN (31-03-2026 12:00):
// - Importeer backup flow vervangen door 2-staps popup: selectie + bevestiging
// WIJZIGINGEN (30-03-2026 13:00):
// - btnGrijs kleur gewijzigd van --text-dim naar --text-h (knoppen waren onleesbaar in modal)
// - btnGrijs gestyled als echte knop: solide achtergrond, zelfde padding/weight als btnPrimary
// - Fix: file picker via <label htmlFor> i.p.v. programmatische .click() (blokkeerde Chrome)
// WIJZIGINGEN (29-03-2026 15:00):
// - Initiële aanmaak: Backup & Restore sectie met download en importeer functionaliteit
// - Importeer backup knop altijd zichtbaar (disabled tot bestand geladen)
// - Knop opent bestandspicker; na selectie doet knop de import; hint tekst onder de knop
// - Alles Wissen functie toegevoegd: rode knop, waarschuwingsmodal (stap 2) en bevestigingsmodal (stap 3)

'use client';

import { useEffect, useState, useRef } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import MiniTourKnop from '@/components/MiniTourKnop';

const TABEL_GROEPEN = [
  { label: 'Transacties',     tabellen: ['transacties', 'imports', 'transactie_aanpassingen', 'transacties_tabs'] },
  { label: 'Categorieregels', tabellen: ['categorieen'] },
  { label: 'Categorieën',     tabellen: ['budgetten_potjes', 'budgetten_potjes_rekeningen', 'subcategorieen'] },
  { label: 'Rekeningen',      tabellen: ['rekeningen', 'genegeerde_rekeningen', 'rekening_groepen', 'rekening_groep_rekeningen', 'omboeking_uitzonderingen'] },
  { label: 'Dashboard',       tabellen: ['dashboard_tabs'] },
  { label: 'Vaste Posten',    tabellen: ['vaste_posten_config', 'vp_groepen', 'vp_groep_subcategorieen', 'vp_volgorde', 'vp_negeer'] },
  { label: 'Trends',          tabellen: ['trend_tabs', 'trend_panels', 'trend_panel_series'] },
  { label: 'Instellingen',    tabellen: ['instellingen', 'periode_configuraties'] },
];

const btnPrimary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnDanger: React.CSSProperties  = { background: 'var(--red)',    color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalBase: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 28, maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16,
};
const modalRood: React.CSSProperties = { ...modalBase, borderColor: 'var(--red)' };
const btnGrijs: React.CSSProperties = {
  background: 'var(--bg)', color: 'var(--text-h)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default function BackupRestore() {
  const [backupBezig, setBackupBezig] = useState(false);
  const [backupFout,  setBackupFout]  = useState<string | null>(null);
  const [bewaarDagen, setBewaarDagen] = useState(7);
  const [externPad, setExternPad]     = useState('');
  const [externPadOpgeslagen, setExternPadOpgeslagen] = useState(false);
  const [externInterval, setExternInterval] = useState(60);

  // Encryptie state
  const [encryptieIngesteld, setEncryptieIngesteld] = useState(false);
  const [encryptieHint, setEncryptieHint]           = useState<string | null>(null);
  const [encWachtwoord, setEncWachtwoord]           = useState('');
  const [encHint, setEncHint]                       = useState('');
  const [encHuidig, setEncHuidig]                   = useState('');
  const [laatsteBackup, setLaatsteBackup]             = useState<{ naam: string; datum: string; grootte: number } | null>(null);
  const [encBezig, setEncBezig]                     = useState(false);
  const [encFout, setEncFout]                       = useState<string | null>(null);
  const [encSucces, setEncSucces]                   = useState(false);
  const [herstelsleutel, setHerstelsleutel]         = useState<string | null>(null);

  const [encryptieUitgeklapt, setEncryptieUitgeklapt] = useState(false);
  const [publicerenBezig, setPublicerenBezig] = useState(false);
  const [publicerenSucces, setPublicerenSucces] = useState(false);
  const [resetBezig, setResetBezig] = useState(false);
  const [resetBevestig, setResetBevestig] = useState(false);

  // Pending extern state
  const [pendingBestanden, setPendingBestanden] = useState<{ naam: string; grootte: number; datum: string }[]>([]);
  const [pendingHighlight, setPendingHighlight] = useState(false);

  // Multi-device koppel state
  const [externConfigBestaat, setExternConfigBestaat] = useState(false);
  const [externConfigHint, setExternConfigHint]       = useState<string | null>(null);
  const [koppelWachtwoord, setKoppelWachtwoord]       = useState('');
  const [koppelBezig, setKoppelBezig]                 = useState(false);
  const [koppelFout, setKoppelFout]                   = useState<string | null>(null);
  const [koppelSucces, setKoppelSucces]               = useState(false);

  // Apparaat-identificatie + multi-device zichtbaarheid
  const [andereApparaten, setAndereApparaten] = useState<{ apparaat_id: string; apparaat_naam: string | null; minuten_geleden: number; actief: boolean; is_eigen?: boolean }[]>([]);

  // Initiële bundle-load fout (mount-tijd) — toont een banner als de hele
  // page-state niet geladen kon worden. Refresh-helpers (heartbeats/pending/
  // lijst) loggen alleen naar console: dat is opzettelijk, want falen daar
  // is niet kritiek voor de UI (oude data blijft zichtbaar).
  const [bundleLaadFout, setBundleLaadFout] = useState<string | null>(null);

  function laadHeartbeats() {
    fetch('/api/heartbeats').then(r => r.ok ? r.json() : null).then((d: { apparaten: typeof andereApparaten } | null) => {
      if (d) setAndereApparaten(d.apparaten ?? []);
    }).catch(err => { console.warn('heartbeats laden mislukt:', err); });
  }

  async function checkExternConfig() {
    try {
      const res = await fetch('/api/backup/extern-config');
      if (res.ok) {
        const d = await res.json() as { exists: boolean; hint: string | null };
        setExternConfigBestaat(d.exists);
        setExternConfigHint(d.hint);
      }
    } catch (err) {
      // Extern niet bereikbaar — geen blocker voor de page, alleen log voor debug.
      console.warn('extern-config check mislukt:', err);
    }
  }

  function laadPending() {
    fetch('/api/backup/pending-extern').then(r => r.ok ? r.json() : []).then((data: { naam: string; grootte: number; datum: string }[]) => {
      setPendingBestanden(data);
      if (data.length > 0 && window.location.hash === '#pending-extern') {
        setPendingHighlight(true);
        setTimeout(() => setPendingHighlight(false), 3000);
        setTimeout(() => document.getElementById('pending-extern')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
    }).catch(err => { console.warn('pending-extern laden mislukt:', err); });
  }

  function refreshLaatsteBackup() {
    fetch('/api/backup/lijst?bron=lokaal').then(r => r.ok ? r.json() : null).then((d: { bestanden: { naam: string; datum: string; grootte: number }[] } | null) => {
      if (d?.bestanden?.length) setLaatsteBackup(d.bestanden[0]);
    }).catch(err => { console.warn('laatste backup laden mislukt:', err); });
  }

  useEffect(() => {
    // Eén bundle-fetch ipv 6 losse mount-calls. Mutaties + refresh blijven
    // wel via de individuele endpoints lopen.
    fetch('/api/instellingen/backup-bundle').then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d: {
      instellingen: { backupBewaarDagen: number; backupExternPad: string | null; backupExternInterval: number };
      encryptie: { ingesteld: boolean; hint: string | null };
      laatsteBackup: { naam: string; datum: string; grootte: number } | null;
      pending: { naam: string; grootte: number; datum: string }[];
      externConfig: { exists: boolean; hint: string | null } | null;
      heartbeats: { apparaten: typeof andereApparaten } | null;
    }) => {
      setBundleLaadFout(null);
      setBewaarDagen(d.instellingen.backupBewaarDagen ?? 7);
      setExternPad(d.instellingen.backupExternPad ?? '');
      setExternInterval(d.instellingen.backupExternInterval ?? 60);
      setEncryptieIngesteld(d.encryptie.ingesteld);
      setEncryptieHint(d.encryptie.hint);
      if (d.laatsteBackup) setLaatsteBackup(d.laatsteBackup);
      setPendingBestanden(d.pending);
      if (d.pending.length > 0 && window.location.hash === '#pending-extern') {
        setPendingHighlight(true);
        setTimeout(() => setPendingHighlight(false), 3000);
        setTimeout(() => document.getElementById('pending-extern')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
      if (d.externConfig) {
        setExternConfigBestaat(d.externConfig.exists);
        setExternConfigHint(d.externConfig.hint);
      }
      if (d.heartbeats) setAndereApparaten(d.heartbeats.apparaten ?? []);
    }).catch(err => {
      console.error('backup-bundle laden mislukt:', err);
      setBundleLaadFout(err instanceof Error ? err.message : String(err));
    });

    const heartbeatTimer = setInterval(() => { laadHeartbeats(); }, 30_000);

    const onVisible = () => { if (document.visibilityState === 'visible') { refreshLaatsteBackup(); laadPending(); laadHeartbeats(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function opslaanBackupInst(update: { backupBewaarDagen?: number; backupExternPad?: string | null; backupExternInterval?: number }) {
    await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  // Alles Wissen state
  const [wissenModal,    setWissenModal]    = useState(false);
  const [bevestigenModal,setBevestigenModal]= useState(false);
  const [wissenBackupBezig, setWissenBackupBezig] = useState(false);
  const [wissenTekst,    setWissenTekst]    = useState('');
  const [wissenBezig,    setWissenBezig]    = useState(false);
  const [wissenFout,     setWissenFout]     = useState<string | null>(null);

  // Import modal state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importModal,       setImportModal]       = useState<'activiteit' | 'bron' | 'bestanden' | 'bevestig' | 'encrypted' | null>(null);
  const [groepen,           setGroepen]           = useState<{ ankerId: number; actie_id: string; timestamp_ms: number; type: string; beschrijving: string; tabellen: string[]; aantal_mutaties: number; teruggedraaid: boolean }[]>([]);
  const [activiteitLaden,   setActiviteitLaden]   = useState(false);
  const [bezigActieId,      setBezigActieId]      = useState<string | null>(null);
  const [conflictModal,     setConflictModal]     = useState<{ actieId: string; conflicten: { entryId: number; tabel: string; rij_id: number | null; latereActieId: string }[] } | null>(null);
  const [restoreNaarPuntBevestig, setRestoreNaarPuntBevestig] = useState<{ ankerId: number; beschrijving: string } | null>(null);
  const [actieFout,         setActieFout]         = useState<string | null>(null);
  const [importBron,        setImportBron]         = useState<'lokaal' | 'extern' | null>(null);
  const [backupLijst,       setBackupLijst]        = useState<{ naam: string; grootte: number; datum: string; versleuteld: boolean; type?: string; beschrijving?: string; schema_versie?: number | null; diff_aantal?: number; diff_laatste_timestamp_ms?: number | null }[]>([]);
  const [huidigeDiff,       setHuidigeDiff]        = useState<{ aantal: number; laatste_timestamp_ms: number } | null>(null);
  const [huidigeSchemaVersie, setHuidigeSchemaVersie] = useState<number | null>(null);
  const [backupTypeFilter,  setBackupTypeFilter]   = useState<string>('');
  const [backupZoek,        setBackupZoek]         = useState<string>('');
  const [backupBestandNaam, setBackupBestandNaam] = useState<string>('');
  const [restoreBezig,      setRestoreBezig]      = useState(false);
  const [restoreFout,       setRestoreFout]       = useState<string | null>(null);
  const [restoreResultaat,  setRestoreResultaat]  = useState<Record<string, number> | null>(null);

  // Encrypted backup import flow state
  const [encFile,                setEncFile]                = useState<File | null>(null);
  const [encImportWachtwoord,    setEncImportWachtwoord]    = useState('');
  const [encExternPad,           setEncExternPad]           = useState('');
  const [encImportFout,          setEncImportFout]          = useState<string | null>(null);
  const [encImportBezig,         setEncImportBezig]         = useState(false);

  function openImportModal() {
    setBackupBestandNaam('');
    setRestoreFout(null);
    setRestoreResultaat(null);
    setBackupLijst([]);
    setBackupTypeFilter('');
    setBackupZoek('');
    setImportBron(null);
    setImportModal('activiteit');
    laadActiviteit();
  }

  async function laadActiviteit() {
    setActiviteitLaden(true);
    setActieFout(null);
    try {
      const res = await fetch('/api/wijziging-log?limit=200');
      if (res.ok) {
        const data = await res.json() as { groepen: typeof groepen };
        setGroepen(data.groepen ?? []);
      }
    } catch { /* */ }
    setActiviteitLaden(false);
  }

  async function undoActie(actieId: string, forceer: boolean) {
    setBezigActieId(actieId);
    setActieFout(null);
    try {
      const res = await fetch('/api/wijziging-log/undo-actie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actieId, forceer }),
      });
      if (res.status === 409) {
        const d = await res.json() as { conflicten: { entryId: number; tabel: string; rij_id: number | null; latereActieId: string }[] };
        setConflictModal({ actieId, conflicten: d.conflicten ?? [] });
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActieFout((d as { error?: string }).error ?? 'Undo mislukt.');
        return;
      }
      setConflictModal(null);
      await laadActiviteit();
      window.location.reload();
    } finally {
      setBezigActieId(null);
    }
  }

  async function restoreNaarPuntActie(ankerId: number) {
    setBezigActieId(`anker-${ankerId}`);
    setActieFout(null);
    try {
      const res = await fetch('/api/wijziging-log/restore-naar-punt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ankerId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActieFout((d as { error?: string }).error ?? 'Terugdraaien mislukt.');
        return;
      }
      setRestoreNaarPuntBevestig(null);
      window.location.reload();
    } finally {
      setBezigActieId(null);
    }
  }

  async function kiesBron(bron: 'lokaal' | 'extern') {
    setImportBron(bron);
    const res = await fetch(`/api/backup/lijst?bron=${bron}`);
    if (res.ok) {
      const data = await res.json();
      setBackupLijst(data.bestanden ?? []);
      setHuidigeDiff(data.huidige_diff ?? null);
      setHuidigeSchemaVersie(data.huidige_schema_versie ?? null);
      setImportModal('bestanden');
    } else {
      const d = await res.json().catch(() => ({}));
      setRestoreFout((d as { error?: string }).error ?? 'Laden mislukt.');
    }
  }

  async function kiesBestand(naam: string) {
    setRestoreFout(null);
    setBackupBestandNaam(naam);
    setImportModal('bevestig');
  }

  function sluitImportModal() {
    setImportModal(null);
    setBackupBestandNaam('');
    setRestoreFout(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDownload() {
    setBackupBezig(true); setBackupFout(null);
    const res = await fetch('/api/backup');
    setBackupBezig(false);
    if (!res.ok) { setBackupFout('Download mislukt.'); return; }
    const blob = await res.blob();
    const datum = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).replace(' ', '_').replace(/:/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fbs-backup-${datum}.sqlite.gz`; a.click();
    URL.revokeObjectURL(url);
  }

  function verwerkBackupBestand(file: File) {
    setRestoreFout(null);
    setBackupBestandNaam(file.name);

    // Versleutelde backup: open prompt voor wachtwoord (en eventueel externe pad).
    // De multipart upload-flow stuurt het bestand zelf naar /api/restore.
    if (file.name.endsWith('.enc.gz') || file.name.endsWith('.sqlite.enc.gz')) {
      setEncFile(file);
      setEncImportWachtwoord('');
      setEncExternPad(externPad.trim());
      setEncImportFout(null);
      setImportModal('encrypted');
      return;
    }

    // Onversleutelde binary backup: bewaar als pending upload en open bevestig-modal.
    // /api/restore accepteert dezelfde multipart-flow zonder wachtwoord.
    setEncFile(file);
    setImportBron(null);
    setImportModal('bevestig');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    verwerkBackupBestand(file);
  }

  async function kiesAnderBestand() {
    setRestoreFout(null);
    // Tauri-context: native bestandsdialog via plugin-dialog + plugin-fs
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const pad = await open({
        multiple: false,
        directory: false,
        title: 'Kies backup bestand',
        filters: [{ name: 'Backup', extensions: ['gz'] }],
      });
      if (!pad || typeof pad !== 'string') return; // gebruiker annuleerde
      const res = await fetch(`/api/backup/lees-pad?pad=${encodeURIComponent(pad)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRestoreFout((d as { error?: string }).error ?? 'Bestand kon niet gelezen worden.');
        return;
      }
      const blob = await res.blob();
      const naam = pad.split(/[\\/]/).pop() ?? 'backup';
      const file = new File([blob], naam);
      verwerkBackupBestand(file);
      return;
    } catch {
      // Tauri niet beschikbaar (dev/browser) — programmatische click op verborgen input
    }
    fileRef.current?.click();
  }

  async function handleWissenBackup() {
    setWissenBackupBezig(true);
    const res = await fetch('/api/backup');
    setWissenBackupBezig(false);
    if (!res.ok) return;
    const blob = await res.blob();
    const datum = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).replace(' ', '_').replace(/:/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `fbs-backup-${datum}.sqlite.gz`; a.click();
    URL.revokeObjectURL(url);
    setWissenModal(false); setBevestigenModal(true); setWissenTekst(''); setWissenFout(null);
  }

  function handleDoorgaanZonderBackup() {
    setWissenModal(false); setBevestigenModal(true); setWissenTekst(''); setWissenFout(null);
  }

  async function handleDefinitieWissen() {
    if (wissenTekst !== 'WISSEN') return;
    setWissenBezig(true); setWissenFout(null);
    const res = await fetch('/api/reset', { method: 'POST' });
    setWissenBezig(false);
    if (!res.ok) { const d = await res.json(); setWissenFout(d.error ?? 'Reset mislukt.'); return; }
    setBevestigenModal(false);
    window.location.reload();
  }

  async function handleImportBevestigd() {
    setRestoreBezig(true); setRestoreFout(null);
    let res: Response;
    if (encFile && importBron === null) {
      // File-upload flow (onversleuteld): stuur het bestand mee als multipart.
      const fd = new FormData();
      fd.append('file', encFile);
      res = await fetch('/api/restore', { method: 'POST', body: fd });
    } else {
      // Activiteit/lijst-flow: server haalt backup op uit lokaal of extern pad.
      res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestandsnaam: backupBestandNaam, bron: importBron ?? 'lokaal' }),
      });
    }
    setRestoreBezig(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setRestoreFout((d as { error?: string }).error ?? 'Import mislukt.'); return; }
    setRestoreResultaat(await res.json());
    sluitImportModal();
    window.location.reload();
  }

  async function handleEncryptedImport() {
    if (!encFile || !encImportWachtwoord.trim()) return;
    setEncImportBezig(true); setEncImportFout(null);
    // Veiligheidsnet: maak eerst een automatische backup
    try { await fetch('/api/backup/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'pre-restore', beschrijving: 'Veiligheidsbackup vóór restore' }) }); } catch { /* ga toch door */ }
    const fd = new FormData();
    fd.append('file', encFile);
    fd.append('wachtwoord', encImportWachtwoord);
    if (encExternPad.trim()) fd.append('extern_pad', encExternPad.trim());
    const res = await fetch('/api/restore', { method: 'POST', body: fd });
    setEncImportBezig(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setEncImportFout((d as { error?: string }).error ?? 'Ontsleutelen of import mislukt.');
      return;
    }
    setRestoreResultaat(await res.json());
    setEncFile(null); setEncImportWachtwoord(''); setEncImportFout(null);
    sluitImportModal();
    window.location.reload();
  }

  return (
    <section data-onboarding="inst-backup">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Backup &amp; Restore</p>
        <MiniTourKnop tourId="backup" type="instelling" />
      </div>
      {bundleLaadFout && (
        <div style={{ background: 'var(--red-dim, #5a2424)', border: '1px solid var(--red, #d73a49)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--text-h)' }}>
          <strong>Backup-instellingen konden niet geladen worden:</strong> {bundleLaadFout}.{' '}
          <button type="button" onClick={() => window.location.reload()} style={{ background: 'none', border: 'none', color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13 }}>
            Pagina herladen
          </button>
        </div>
      )}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Backup &amp; Restore</p>
          <InfoTooltip volledigeBreedte tekst={<>
            <p style={{ margin: '0 0 8px' }}>De app houdt twee soorten herstelpunten bij van je data — transacties, categorieën, rekeningen en instellingen.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Wijzigingenlog:</strong> elke afzonderlijke wijziging wordt opgeslagen, zodat je via &quot;Importeer backup&quot; één specifieke wijziging ongedaan kunt maken zonder de rest te raken. Dit blijft beschikbaar binnen de bewaartermijn die je hieronder instelt.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Ankerpunten:</strong> net voordat een wijziging de bewaartermijn overschrijdt wordt automatisch een volledig backupbestand vastgelegd. Ankerpunten vallen onder dezelfde bewaartermijn — oude worden opgeruimd zodra ze ouder zijn dan ingesteld. Het meest recente ankerpunt blijft echter altijd staan: dat is de basis waarop de losse wijzigingen worden teruggespeeld, dus zonder dat ankerpunt kan er niets hersteld worden.</p>
            <p style={{ margin: '0 0 8px' }}><strong>Lokale backup:</strong> wordt automatisch aangemaakt naast de database op dit apparaat. Altijd beschikbaar, ook zonder internetverbinding of extern opslagmedium.</p>
            <p style={{ margin: 0 }}><strong>Externe backup:</strong> een tweede kopie op een andere locatie, zoals een NAS of OneDrive-map. Gebruik dit voor extra veiligheid of om meerdere apparaten gesynchroniseerd te houden.</p>
          </>} />
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Laatste backup info */}
        {laatsteBackup && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            <span style={{ color: 'var(--green)' }}>✓</span>
            Laatste backup: {new Date(laatsteBackup.datum).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })} ({(laatsteBackup.grootte / 1024).toFixed(0)} KB)
          </div>
        )}

        {/* Auto-backup instellingen */}
        <div>
          <div data-onboarding="backup-auto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Wijzigingen ongedaan maken</p>
            <InfoTooltip volledigeBreedte tekst="Bepaalt hoe lang afzonderlijke wijzigingen individueel ongedaan kunnen worden gemaakt via &quot;Importeer backup&quot;. Binnen de termijn kun je elke wijziging losstaand terugdraaien zonder de rest te raken. Zodra een wijziging de termijn overschrijdt wordt automatisch een ankerpunt vastgelegd. Ankerpunten en backupbestanden ouder dan deze termijn worden opgeruimd; alleen het meest recente ankerpunt blijft altijd staan als basis voor herstel." />
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--text)' }}>
              Bewaartermijn
              <select value={bewaarDagen} onChange={e => { const v = parseInt(e.target.value); setBewaarDagen(v); opslaanBackupInst({ backupBewaarDagen: v }); }}
                style={{ marginLeft: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 13, color: 'var(--text-h)' }}>
                {[1, 3, 7, 14, 30, 60, 90].map(d => (
                  <option key={d} value={d}>{d} {d === 1 ? 'dag' : 'dagen'}</option>
                ))}
              </select>
            </label>
          </div>
          </div>
          <div data-onboarding="backup-extern" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Externe backup locatie</label>
              <InfoTooltip volledigeBreedte tekst={<>
                <p style={{ margin: '0 0 8px' }}>Stel een tweede locatie in waar automatische backups naartoe gekopieerd worden — bijvoorbeeld een netwerkschijf (NAS), een USB-schijf of een map in OneDrive/Dropbox. Lokale backups naast de database blijven altijd bewaard.</p>
                <p style={{ margin: '0 0 8px' }}><strong>Eén apparaat:</strong> gebruik dit als extra beveiliging. Backups staan dan op twee plekken, zodat je data veilig is als je harde schijf uitvalt.</p>
                <p style={{ margin: '0 0 8px' }}><strong>Meerdere apparaten:</strong> stel op elk apparaat dezelfde externe locatie in. De app controleert bij elke start of er een nieuwere backup beschikbaar is en vraagt of je wilt bijwerken. Het eerste apparaat dat de locatie instelt is het primaire apparaat. Extra apparaten koppel je via de versleutelingsinstelling hieronder.</p>
                <p style={{ margin: 0 }}><strong>Synchronisatieconflict:</strong> als de externe locatie tijdelijk niet bereikbaar was en je op meerdere apparaten wijzigingen hebt gemaakt, detecteert de app dit automatisch. Je kunt dan kiezen welke versie je wilt behouden.</p>
              </>} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, color: 'var(--text)' }}>
                  Sync-interval
                  <select
                    value={externInterval}
                    onChange={e => { const v = parseInt(e.target.value); setExternInterval(v); opslaanBackupInst({ backupExternInterval: v }); }}
                    style={{ marginLeft: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 13, color: 'var(--text-h)' }}>
                    <option value={30}>30 seconden</option>
                    <option value={60}>1 minuut</option>
                    <option value={120}>2 minuten</option>
                    <option value={300}>5 minuten</option>
                    <option value={600}>10 minuten</option>
                    <option value={1800}>30 minuten</option>
                  </select>
                </label>
                <InfoTooltip volledigeBreedte tekst="Hoe vaak dit apparaat lokale wachtende backups naar de externe locatie pusht en controleert of een ander apparaat een nieuwere backup heeft achtergelaten. Bij multi-device gebruik bepaalt dit hoe snel wijzigingen op het andere apparaat hier zichtbaar worden. Korte intervallen (30s–1min) reageren sneller; langere intervallen (10–30min) zijn zuiniger met netwerkverkeer maar duren langer om conflicten of nieuwe data te detecteren. Standaard 1 minuut." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={externPad}
                onChange={e => { setExternPad(e.target.value); setExternPadOpgeslagen(false); }}
                placeholder={String.raw`\\NAS\Backup\FBS of C:\Users\Naam\OneDrive\FBS-Backup`}
                style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }}
              />
              <button
                onClick={async () => {
                  try {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const pad = await open({ directory: true, title: 'Kies externe backup locatie' });
                    if (pad && typeof pad === 'string') { setExternPad(pad); setExternPadOpgeslagen(false); }
                  } catch {
                    // Tauri niet beschikbaar — pad handmatig invoeren
                  }
                }}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Bladeren…
              </button>
              <button
                onClick={async () => {
                  await opslaanBackupInst({ backupExternPad: externPad.trim() || null });
                  setExternPadOpgeslagen(true);
                  setTimeout(() => setExternPadOpgeslagen(false), 3000);
                  if (externPad.trim()) { await checkExternConfig(); laadHeartbeats(); } else { setExternConfigBestaat(false); setExternConfigHint(null); }
                }}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {externPadOpgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
              </button>
            </div>

            {externPad.trim() && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Apparaten</label>
                  <InfoTooltip volledigeBreedte tekst="Elk apparaat dat deze externe locatie gebruikt schrijft een heartbeat. Hieronder zie je welke apparaten momenteel actief zijn (binnen 90 seconden) of recent waren. Zo kun je controleren dat alleen jouw eigen apparaten gebruikmaken van deze locatie. De apparaatnaam is altijd de hostname van het systeem en wordt automatisch gesynchroniseerd — niet handmatig instelbaar zodat hij niet via backup tussen apparaten kan lekken." />
                </div>
                {andereApparaten.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Nog geen apparaten gedetecteerd.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {andereApparaten.map(a => (
                      <div key={a.apparaat_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 10px', background: 'var(--bg-base)', border: a.is_eigen ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.actief ? 'var(--green)' : 'var(--text-dim)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-h)', fontWeight: 500 }}>{a.apparaat_naam ?? `apparaat_${a.apparaat_id.slice(0, 8)}`}</span>
                        {a.is_eigen && <span style={{ fontSize: 11, color: 'var(--accent)', fontStyle: 'italic' }}>(dit apparaat)</span>}
                        <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 11 }}>{a.apparaat_id.slice(0, 8)}</span>
                        <span style={{ marginLeft: 'auto', color: a.actief ? 'var(--green)' : 'var(--text-dim)' }}>
                          {a.is_eigen ? 'actief' : (a.actief ? `actief — ${a.minuten_geleden} min geleden` : `${a.minuten_geleden} min geleden`)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Encryptie — alleen tonen als externe locatie is ingesteld */}
        {externPad.trim() && <>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <div data-onboarding="backup-encryptie">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Versleuteling externe backups</p>
            <InfoTooltip volledigeBreedte tekst={<>
              <p style={{ margin: '0 0 8px' }}>Versleutelt de backups op de externe locatie met AES-256, zodat niemand zonder wachtwoord de inhoud kan lezen. Nuttig als de externe locatie gedeeld is of buiten je eigen netwerk staat. Lokale backups naast de database blijven altijd onversleuteld — zodat je altijd toegang hebt tot je data.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Wachtwoord:</strong> stel een sterk wachtwoord in en bewaar de geheugensteun op een veilige plek.</p>
              <p style={{ margin: '0 0 8px' }}><strong>Herstelsleutel:</strong> bij het instellen wordt eenmalig een herstelsleutel gegenereerd. Bewaar deze goed — je kunt hem gebruiken als vervanging voor het wachtwoord bij het ontsleutelen van backups of het koppelen van een extra apparaat. Als je zowel het wachtwoord als de herstelsleutel kwijtraakt zijn de versleutelde externe backups niet meer te openen.</p>
              <p style={{ margin: 0 }}><strong>Meerdere apparaten:</strong> het eerste apparaat stelt het wachtwoord in. Extra apparaten gebruiken de koppelfunctie — je voert daar het wachtwoord of de herstelsleutel in van het eerste apparaat, zodat alle apparaten dezelfde versleuteling gebruiken.</p>
            </>} />
            <span style={{ fontSize: 12, color: encryptieIngesteld ? 'var(--green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {encryptieIngesteld
                ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Actief</>
                : 'Niet ingesteld'}
            </span>
            {encryptieIngesteld && !externConfigBestaat && (
              <button disabled={publicerenBezig} onClick={async () => {
                setPublicerenBezig(true); setPublicerenSucces(false);
                const res = await fetch('/api/backup/encryptie/publiceer', { method: 'POST' });
                setPublicerenBezig(false);
                if (res.ok) { setPublicerenSucces(true); setExternConfigBestaat(true); setTimeout(() => setPublicerenSucces(false), 3000); }
              }} style={{ background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>
                {publicerenBezig ? 'Bezig…' : publicerenSucces ? '✓ Gepubliceerd' : 'Publiceren naar extern'}
              </button>
            )}
            <button onClick={() => setEncryptieUitgeklapt(v => !v)}
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
              {encryptieUitgeklapt ? 'Inklappen' : 'Wijzigen'}
            </button>
          </div>
          {encryptieUitgeklapt && <div style={{ marginTop: 12 }}>
          {encryptieIngesteld ? (
            <div>
              <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Versleuteling is actief
              </p>
              {!resetBevestig ? (
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                  <button onClick={() => setResetBevestig(true)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Wachtwoord vergeten?
                  </button>
                </p>
              ) : (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12 }}>
                  {encryptieHint && (
                    <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, marginBottom: 12 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.04em' }}>Geheugensteun</p>
                      <p style={{ margin: 0, color: 'var(--text-h)', fontStyle: 'italic', fontSize: 13 }}>{encryptieHint}</p>
                    </div>
                  )}
                  <p style={{ margin: '0 0 8px', color: 'var(--text)' }}>Bestaande versleutelde backups worden hierna onleesbaar. Lokale backups blijven beschikbaar.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setResetBevestig(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}>Annuleren</button>
                    <button disabled={resetBezig} onClick={async () => {
                      setResetBezig(true);
                      const res = await fetch('/api/backup/encryptie/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verwijderExternConfig: true }) });
                      setResetBezig(false);
                      if (res.ok) { setEncryptieIngesteld(false); setEncryptieHint(null); setExternConfigBestaat(false); setResetBevestig(false); setEncryptieUitgeklapt(false); }
                    }} style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', opacity: resetBezig ? 0.6 : 1 }}>
                      {resetBezig ? 'Bezig…' : 'Instellingen wissen'}
                    </button>
                  </div>
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Wachtwoord wijzigen:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 350 }}>
                <input type="password" placeholder="Huidig wachtwoord of herstelsleutel" value={encHuidig} onChange={e => setEncHuidig(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                <input type="password" placeholder="Nieuw wachtwoord" value={encWachtwoord} onChange={e => setEncWachtwoord(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                <input type="text" placeholder="Nieuwe geheugensteun" value={encHint} onChange={e => setEncHint(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                {encFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{encFout}</p>}
                {encSucces && <p style={{ color: 'var(--green)', fontSize: 12, margin: 0 }}>Wachtwoord gewijzigd.</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={encBezig || !encHuidig || !encWachtwoord || !encHint}
                    onClick={async () => {
                      setEncBezig(true); setEncFout(null); setEncSucces(false);
                      const res = await fetch('/api/backup/encryptie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: encWachtwoord, hint: encHint, huidigWachtwoord: encHuidig }) });
                      setEncBezig(false);
                      if (!res.ok) { const d = await res.json().catch(() => ({})); setEncFout((d as { error?: string }).error ?? 'Wijzigen mislukt.'); }
                      else { const d = await res.json(); setEncSucces(true); setEncHuidig(''); setEncWachtwoord(''); setEncHint(''); setEncryptieHint(encHint); if (d.herstelsleutel) setHerstelsleutel(d.herstelsleutel); }
                    }}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !encHuidig || !encWachtwoord || !encHint ? 0.5 : 1 }}>
                    Wijzigen
                  </button>
                  <button disabled={encBezig || !encHuidig}
                    onClick={async () => {
                      setEncBezig(true); setEncFout(null);
                      const res = await fetch('/api/backup/encryptie', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: encHuidig }) });
                      setEncBezig(false);
                      if (!res.ok) { const d = await res.json().catch(() => ({})); setEncFout((d as { error?: string }).error ?? 'Uitschakelen mislukt.'); }
                      else { setEncryptieIngesteld(false); setEncryptieHint(null); setEncHuidig(''); }
                    }}
                    style={{ background: 'none', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', opacity: !encHuidig ? 0.5 : 1 }}>
                    Uitschakelen
                  </button>
                </div>
              </div>
            </div>
          ) : externConfigBestaat ? (
            /* Secondary device: koppelen aan bestaande configuratie */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                  Op de externe locatie is al een versleutelde configuratie gevonden van een ander apparaat. Voer het wachtwoord of de herstelsleutel in om dit apparaat te koppelen. Er wordt geen nieuwe herstelsleutel aangemaakt — die heb je al van het eerste apparaat.
                </p>
                <InfoTooltip volledigeBreedte tekst="Door te koppelen gebruik je dezelfde versleuteling als het eerste apparaat. Daarna kunnen backups van dat apparaat op dit apparaat gelezen worden en andersom. Gebruik het wachtwoord dat je hebt ingesteld op het eerste apparaat, of de herstelsleutel die je bij het instellen hebt gekregen." />
              </div>
              {externConfigHint && <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Hint: {externConfigHint}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 350 }}>
                <input type="password" placeholder="Wachtwoord of herstelsleutel" value={koppelWachtwoord} onChange={e => setKoppelWachtwoord(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                {koppelFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{koppelFout}</p>}
                {koppelSucces && <p style={{ color: 'var(--green)', fontSize: 12, margin: 0 }}>Gekoppeld — versleuteling is actief.</p>}
                <button disabled={koppelBezig || !koppelWachtwoord}
                  onClick={async () => {
                    setKoppelBezig(true); setKoppelFout(null); setKoppelSucces(false);
                    const res = await fetch('/api/backup/encryptie/koppel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: koppelWachtwoord }) });
                    setKoppelBezig(false);
                    if (!res.ok) { const d = await res.json().catch(() => ({})); setKoppelFout((d as { error?: string }).error ?? 'Koppelen mislukt.'); }
                    else { setKoppelSucces(true); setKoppelWachtwoord(''); setEncryptieIngesteld(true); setEncryptieHint(externConfigHint); }
                  }}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !koppelWachtwoord ? 0.5 : 1, alignSelf: 'flex-start' }}>
                  {koppelBezig ? 'Koppelen…' : 'Koppelen'}
                </button>
              </div>
            </div>
          ) : (
            /* Primary device: nieuwe encryptie instellen */
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                Stel een wachtwoord in om externe backups te versleutelen met AES-256. Lokale backups blijven onversleuteld. Het wachtwoord kan niet hersteld worden — bewaar de geheugensteun goed.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 350 }}>
                <input type="password" placeholder="Wachtwoord" value={encWachtwoord} onChange={e => setEncWachtwoord(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                <input type="text" placeholder="Geheugensteun (verplicht)" value={encHint} onChange={e => setEncHint(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
                {encFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{encFout}</p>}
                <button disabled={encBezig || !encWachtwoord || !encHint}
                  onClick={async () => {
                    setEncBezig(true); setEncFout(null);
                    const res = await fetch('/api/backup/encryptie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: encWachtwoord, hint: encHint }) });
                    setEncBezig(false);
                    if (!res.ok) { const d = await res.json().catch(() => ({})); setEncFout((d as { error?: string }).error ?? 'Instellen mislukt.'); }
                    else { const d = await res.json(); setEncryptieIngesteld(true); setEncryptieHint(encHint); setEncWachtwoord(''); setEncHint(''); setExternConfigBestaat(true); if (d.herstelsleutel) setHerstelsleutel(d.herstelsleutel); }
                  }}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !encWachtwoord || !encHint ? 0.5 : 1, alignSelf: 'flex-start' }}>
                  Versleuteling inschakelen
                </button>
              </div>
            </div>
          )}
          </div>}
        </div>
        </>}

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Backup */}
        <div data-onboarding="backup-download">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', margin: 0 }}>Download backup</p>
            <InfoTooltip volledigeBreedte tekst="Maakt een volledige momentopname van je database (.sqlite.gz) en biedt deze aan om op te slaan. Bevat alle gegevens — transacties, categorieën, instellingen — en kan later via de import-knop teruggezet worden." />
          </div>
          {backupFout && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{backupFout}</p>}
          <button onClick={handleDownload} disabled={backupBezig}
            style={{ ...btnPrimary, opacity: backupBezig ? 0.6 : 1, cursor: backupBezig ? 'not-allowed' : 'pointer' }}>
            {backupBezig ? 'Downloaden…' : 'Download backup'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Restore */}
        <div data-onboarding="backup-restore">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 12 }}>Importeer backup</p>
          {restoreResultaat && (
            <p style={{ color: 'var(--green)', fontSize: 12, marginBottom: 12 }}>
              Import geslaagd:{' '}
              {Object.entries(restoreResultaat).map(([t, n]) => `${t} (${n} records)`).join(', ')}
            </p>
          )}
          <input id="vrije-backup-picker" ref={fileRef} type="file" accept=".json,.json.gz,.gz" onChange={handleFileChange}
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
          <button onClick={openImportModal} style={btnDanger}>Importeer backup</button>
        </div>

        {pendingBestanden.length > 0 && <>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <div id="pending-extern">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', margin: 0, borderRadius: 6, padding: '2px 6px', ...(pendingHighlight ? { animation: 'highlight-pulse 1s ease-in-out 3' } : {}) }}>Wachtende externe backups</p>
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', fontWeight: 600 }}>{pendingBestanden.length}</span>
                <InfoTooltip tekst="Deze backups konden niet naar de externe locatie gekopieerd worden omdat die tijdelijk niet bereikbaar was. Ze worden automatisch gesynchroniseerd zodra de externe locatie weer beschikbaar is. Je kunt ze hier handmatig verwijderen als ze niet meer nodig zijn." />
              </div>
              <button onClick={async () => { await fetch('/api/backup/pending-extern?alle=1', { method: 'DELETE' }); laadPending(); }}
                style={{ ...btnDanger, fontSize: 12, padding: '4px 12px' }}>Verwijder alles</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 500 }}>Bestand</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>Grootte</th>
                  <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>Aangemaakt</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {pendingBestanden.map(b => (
                  <tr key={b.naam} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 8px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>{b.naam}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{(b.grootte / 1024).toFixed(1)} KB</td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{new Date(b.datum).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      <button onClick={async () => { await fetch(`/api/backup/pending-extern?bestand=${encodeURIComponent(b.naam)}`, { method: 'DELETE' }); laadPending(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2, display: 'flex', alignItems: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Alles Wissen */}
        <div data-onboarding="backup-wissen">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>Gevaarzone</p>
          <button onClick={() => setWissenModal(true)} style={{ ...btnDanger, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>☠️</span> Alles Wissen
          </button>
        </div>

        </div>
      </div>

      {/* IMPORT MODAL — Activiteitenlog (primair) */}
      {importModal === 'activiteit' && (
        <div style={overlayStyle} onClick={sluitImportModal}>
          <div style={{ ...modalBase, maxWidth: 860, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Herstel naar eerder moment</p>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '3px 0 0' }}>
                  Kies een wijziging uit het log om de app naar die toestand te herstellen.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={backupTypeFilter} onChange={e => setBackupTypeFilter(e.target.value)}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }}>
                <option value="">Alle types</option>
                {Array.from(new Set(groepen.map(g => g.type))).sort().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input type="text" placeholder="Zoek in beschrijving…" value={backupZoek} onChange={e => setBackupZoek(e.target.value)}
                style={{ flex: 1, minWidth: 180, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }} />
            </div>

            {activiteitLaden ? (
              <p className="empty">Laden…</p>
            ) : groepen.length === 0 ? (
              <p className="empty">Nog geen activiteit.</p>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(() => {
                  const gefilterd = groepen
                    .filter(g => !backupTypeFilter || g.type === backupTypeFilter)
                    .filter(g => {
                      if (!backupZoek.trim()) return true;
                      const q = backupZoek.toLowerCase();
                      return g.beschrijving.toLowerCase().includes(q) || g.type.toLowerCase().includes(q) || g.tabellen.some(t => t.toLowerCase().includes(q));
                    });
                  return gefilterd.map(g => {
                    const bezig = bezigActieId === g.actie_id || bezigActieId === `anker-${g.ankerId}`;
                    const isSysteem = g.actie_id === 'systeem';
                    return (
                  <div key={`${g.actie_id}-${g.ankerId}`}
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, opacity: g.teruggedraaid ? 0.5 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-h)', fontWeight: 500 }}>
                          {new Date(g.timestamp_ms).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {g.type}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
                          {g.aantal_mutaties} {g.aantal_mutaties === 1 ? 'mutatie' : 'mutaties'} · {g.tabellen.join(', ')}
                        </span>
                        {g.teruggedraaid && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>teruggedraaid</span>
                        )}
                      </div>
                      {g.beschrijving && (
                        <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                          {g.beschrijving}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!g.teruggedraaid && !isSysteem && (
                        <button onClick={() => undoActie(g.actie_id, false)} disabled={bezig}
                          title="Maak alleen deze actie ongedaan"
                          style={{ background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: bezig ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                          Ongedaan maken
                        </button>
                      )}
                      {!g.teruggedraaid && (
                        <button onClick={() => setRestoreNaarPuntBevestig({ ankerId: g.ankerId, beschrijving: g.beschrijving || g.type })} disabled={bezig}
                          title="Draai deze en alle latere wijzigingen terug"
                          style={{ background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: bezig ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                          Terug naar dit punt
                        </button>
                      )}
                    </div>
                  </div>
                    );
                  });
                })()}
              </div>
            )}

            {actieFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{actieFout}</p>}
            {restoreFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{restoreFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => { setImportModal('bron'); setImportBron(null); }} style={{ ...btnGrijs, fontSize: 11 }}>
                Geavanceerd: alle backup-bestanden…
              </button>
              <button onClick={sluitImportModal} style={btnGrijs}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFLICT MODAL — undo-actie 409 */}
      {conflictModal && (
        <div style={overlayStyle} onClick={() => setConflictModal(null)}>
          <div style={modalRood} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Latere wijziging in de weg</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
              Een latere actie heeft <strong>{conflictModal.conflicten.length}</strong> {conflictModal.conflicten.length === 1 ? 'rij' : 'rijen'} aangeraakt die ook in deze actie zaten. Als je nu doorzet, worden die latere wijzigingen <strong>niet</strong> meegedraaid — ze blijven staan en gaan over de teruggezette versie heen.
            </p>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)', maxHeight: 140, overflowY: 'auto' }}>
              {conflictModal.conflicten.slice(0, 20).map(c => (
                <div key={c.entryId}>{c.tabel} (rij {c.rij_id ?? '—'}) — latere actie {c.latereActieId.slice(0, 8)}</div>
              ))}
              {conflictModal.conflicten.length > 20 && <div>… en {conflictModal.conflicten.length - 20} meer</div>}
            </div>
            {actieFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{actieFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConflictModal(null)} disabled={bezigActieId !== null} style={btnGrijs}>Annuleer</button>
              <button onClick={() => undoActie(conflictModal.actieId, true)} disabled={bezigActieId !== null} style={btnDanger}>
                {bezigActieId !== null ? 'Bezig…' : 'Toch ongedaan maken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE-NAAR-PUNT BEVESTIG MODAL */}
      {restoreNaarPuntBevestig && (
        <div style={overlayStyle} onClick={() => setRestoreNaarPuntBevestig(null)}>
          <div style={modalRood} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Terug naar dit punt?</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
              Alle wijzigingen vanaf <strong>{restoreNaarPuntBevestig.beschrijving}</strong> en alles daarná worden teruggedraaid. Dit kan niet eenvoudig ongedaan worden gemaakt.
            </p>
            {actieFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{actieFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setRestoreNaarPuntBevestig(null)} disabled={bezigActieId !== null} style={btnGrijs}>Annuleer</button>
              <button onClick={() => restoreNaarPuntActie(restoreNaarPuntBevestig.ankerId)} disabled={bezigActieId !== null} style={btnDanger}>
                {bezigActieId !== null ? 'Bezig…' : 'Terugdraaien'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL — Bron keuze */}
      {importModal === 'bron' && (
        <div style={overlayStyle} onClick={sluitImportModal}>
          <div style={modalBase} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Importeer backup</p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Kies de locatie van het backup bestand:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => kiesBron('lokaal')}
                style={{ ...btnPrimary, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>💾</span> Lokale backups
              </button>
              {externPad.trim() && (
                <button onClick={() => kiesBron('extern')}
                  style={{ ...btnPrimary, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🌐</span> Externe locatie
                </button>
              )}
              <button onClick={kiesAnderBestand}
                style={{ ...btnGrijs, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span style={{ fontSize: 16 }}>📂</span> Ander bestand kiezen…
              </button>
            </div>
            {restoreFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{restoreFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={sluitImportModal} style={btnGrijs}>Annuleer</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL — Bestanden lijst */}
      {importModal === 'bestanden' && (
        <div style={overlayStyle} onClick={sluitImportModal}>
          <div style={{ ...modalBase, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>
              {importBron === 'extern' ? 'Externe backups' : 'Lokale backups'}
            </p>
            {huidigeDiff && (
              <div style={{ fontSize: 12, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid var(--accent)', borderRadius: 6, padding: '6px 10px' }}>
                Huidige staat: {huidigeDiff.aantal} wijziging{huidigeDiff.aantal === 1 ? '' : 'en'} sinds laatste backup-bestand — laatste op {new Date(huidigeDiff.laatste_timestamp_ms).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}. Voor losse wijzigingen ongedaan maken: gebruik het eerste scherm (terug via &quot;Sluiten&quot; → &quot;Importeer backup&quot;).
              </div>
            )}
            {backupLijst.length === 0 ? (
              <p className="empty">Geen backups gevonden op deze locatie.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <select value={backupTypeFilter} onChange={e => setBackupTypeFilter(e.target.value)}
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }}>
                    <option value="">Alle types</option>
                    {Array.from(new Set(backupLijst.map(b => b.type ?? 'onbekend'))).sort().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input type="text" placeholder="Zoek in beschrijving…" value={backupZoek} onChange={e => setBackupZoek(e.target.value)}
                    style={{ flex: 1, minWidth: 180, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)' }} />
                </div>
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {backupLijst
                    .filter(b => !backupTypeFilter || (b.type ?? 'onbekend') === backupTypeFilter)
                    .filter(b => {
                      if (!backupZoek.trim()) return true;
                      const q = backupZoek.toLowerCase();
                      return (b.beschrijving ?? '').toLowerCase().includes(q) || (b.type ?? '').toLowerCase().includes(q);
                    })
                    .map(b => {
                      const isSet = b.type === 'anker';
                      const setDatumMatch = b.naam.match(/^backup_anker_(\d{4}-\d{2}-\d{2})\./);
                      const setDatum = setDatumMatch ? setDatumMatch[1] : null;
                      const typeLabel = isSet ? 'Dagelijkse set' : (b.type ?? 'onbekend');
                      const accent = isSet ? 'var(--accent)' : 'var(--text-dim)';
                      return (
                        <button key={b.naam} onClick={() => kiesBestand(b.naam)}
                          style={{ background: 'var(--bg-base)', border: `1px solid ${isSet ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, color: 'var(--text-h)', fontWeight: 600 }}>
                                {isSet && setDatum
                                  ? new Date(`${setDatum}T00:00:00`).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                                  : new Date(b.datum).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: accent, background: 'transparent', border: `1px solid ${accent}`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {typeLabel}
                              </span>
                            </div>
                            {isSet ? (
                              <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 3 }}>
                                {b.diff_aantal != null && b.diff_aantal > 0
                                  ? <>Anker + {b.diff_aantal} wijziging{b.diff_aantal === 1 ? '' : 'en'} van die dag</>
                                  : <>Anker zonder wijzigingen</>}
                              </div>
                            ) : (
                              b.beschrijving && (
                                <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {b.beschrijving}
                                </div>
                              )
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                              {b.naam} — {(b.grootte / 1024).toFixed(0)} KB
                              {b.versleuteld && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>🔒</span>}
                              {b.schema_versie != null && (
                                <span
                                  title={huidigeSchemaVersie != null && b.schema_versie > huidigeSchemaVersie
                                    ? `Backup is van een nieuwere appversie (schema ${b.schema_versie}) dan deze installatie (schema ${huidigeSchemaVersie}). Restore zal worden geweigerd — werk eerst de app bij.`
                                    : `Schema-versie ${b.schema_versie}${huidigeSchemaVersie != null && b.schema_versie < huidigeSchemaVersie ? ` (deze installatie: ${huidigeSchemaVersie}). Restore migreert automatisch naar de huidige versie.` : ''}`}
                                  style={{
                                    marginLeft: 8,
                                    padding: '0 5px',
                                    borderRadius: 3,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: huidigeSchemaVersie != null && b.schema_versie > huidigeSchemaVersie ? 'var(--red)' : 'var(--text-dim)',
                                    border: `1px solid ${huidigeSchemaVersie != null && b.schema_versie > huidigeSchemaVersie ? 'var(--red)' : 'var(--border)'}`,
                                  }}
                                >
                                  v{b.schema_versie}
                                  {huidigeSchemaVersie != null && b.schema_versie > huidigeSchemaVersie && ' ⚠'}
                                </span>
                              )}
                            </div>
                          </div>
                          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
            {restoreFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{restoreFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => setImportModal('bron')} style={btnGrijs}>← Terug</button>
              <button onClick={sluitImportModal} style={btnGrijs}>Annuleer</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL — Bevestiging */}
      {importModal === 'bevestig' && (
        <div style={overlayStyle} onClick={sluitImportModal}>
          <div style={modalRood} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', margin: 0 }}>⚠ Importeer backup</p>

            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
              Bestand: <strong style={{ color: 'var(--text-h)' }}>{backupBestandNaam}</strong>
            </p>

            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', borderRadius: 8, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-h)', margin: 0, lineHeight: 1.5 }}>
                Je huidige database wordt <strong>volledig vervangen</strong> door de inhoud van dit backup bestand. Er wordt automatisch een veiligheidsbackup van de huidige staat gemaakt vóór de import — die kun je via de activiteit terugzetten als je wilt.
              </p>
            </div>

            {restoreFout && <p style={{ color: 'var(--red)', fontSize: 12 }}>{restoreFout}</p>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={sluitImportModal} disabled={restoreBezig} style={btnGrijs}>Annuleer</button>
              <button onClick={handleImportBevestigd} disabled={restoreBezig}
                style={{ ...btnDanger, opacity: restoreBezig ? 0.4 : 1, cursor: restoreBezig ? 'not-allowed' : 'pointer' }}>
                {restoreBezig ? 'Importeren…' : 'Importeer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL — Versleutelde backup (wachtwoord prompt) */}
      {importModal === 'encrypted' && encFile && (
        <div style={overlayStyle} onClick={sluitImportModal}>
          <div style={modalBase} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>🔒 Versleutelde backup</p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
              Bestand: <strong style={{ color: 'var(--text-h)' }}>{encFile.name}</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
              Voer het wachtwoord of de herstelsleutel in waarmee deze backup is versleuteld.
              {!encryptieIngesteld && ' Daarnaast is het pad naar de map met backup-config.json nodig (om de cryptografische metadata op te halen). Na succesvol ontsleutelen wordt dit apparaat automatisch gekoppeld.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="password" placeholder="Wachtwoord of herstelsleutel" value={encImportWachtwoord}
                onChange={e => setEncImportWachtwoord(e.target.value)} autoFocus
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
              {!encryptieIngesteld && (
                <input type="text" placeholder="Pad naar externe map (waar backup-config.json staat)" value={encExternPad}
                  onChange={e => setEncExternPad(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)' }} />
              )}
              {encImportFout && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{encImportFout}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={sluitImportModal} disabled={encImportBezig} style={btnGrijs}>Annuleer</button>
              <button onClick={handleEncryptedImport}
                disabled={encImportBezig || !encImportWachtwoord.trim() || (!encryptieIngesteld && !encExternPad.trim())}
                style={{ ...btnPrimary, opacity: (encImportBezig || !encImportWachtwoord.trim() || (!encryptieIngesteld && !encExternPad.trim())) ? 0.4 : 1, cursor: (encImportBezig || !encImportWachtwoord.trim() || (!encryptieIngesteld && !encExternPad.trim())) ? 'not-allowed' : 'pointer' }}>
                {encImportBezig ? 'Ontsleutelen…' : 'Ontsleutel & Importeer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAP 2 — Waarschuwingsmodal (Alles Wissen) */}
      {wissenModal && (
        <div style={overlayStyle} onClick={() => setWissenModal(false)}>
          <div style={modalRood} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>⚠️ Alle data wordt gewist</p>

            <div style={{ fontSize: 13, color: 'var(--text-h)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Dit verdwijnt:</p>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <li>Alle transacties en imports</li>
                  <li>Alle categorieregels</li>
                  <li>Alle categorieën en rekeningen</li>
                  <li>Alle instellingen</li>
                </ul>
              </div>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Daarna opnieuw nodig:</p>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <li>Rekeningen opnieuw instellen</li>
                  <li>Categorieën opnieuw aanmaken</li>
                  <li>CSV opnieuw importeren</li>
                </ul>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)' }}>Download backup eerst (aanbevolen)</p>
              <button onClick={handleWissenBackup} disabled={wissenBackupBezig}
                style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px', opacity: wissenBackupBezig ? 0.6 : 1, cursor: wissenBackupBezig ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
                {wissenBackupBezig ? 'Downloaden…' : 'Download backup'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => setWissenModal(false)} style={btnGrijs}>Annuleren</button>
              <button onClick={handleDoorgaanZonderBackup} style={btnGrijs}>Doorgaan zonder backup</button>
            </div>
          </div>
        </div>
      )}

      {/* STAP 3 — Bevestigingsmodal (Alles Wissen) */}
      {bevestigenModal && (
        <div style={overlayStyle}>
          <div style={modalRood}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>Definitief wissen</p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Dit kan niet ongedaan worden gemaakt. Typ <strong style={{ color: 'var(--text-h)' }}>WISSEN</strong> om te bevestigen.
            </p>
            <input
              type="text"
              value={wissenTekst}
              onChange={e => setWissenTekst(e.target.value)}
              placeholder="WISSEN"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text-h)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            {wissenFout && <p style={{ color: 'var(--red)', fontSize: 12 }}>{wissenFout}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button onClick={() => { setBevestigenModal(false); setWissenTekst(''); setWissenFout(null); }} style={btnGrijs} disabled={wissenBezig}>Annuleren</button>
              <button
                onClick={handleDefinitieWissen}
                disabled={wissenTekst !== 'WISSEN' || wissenBezig}
                style={{ ...btnDanger, opacity: wissenTekst !== 'WISSEN' || wissenBezig ? 0.4 : 1, cursor: wissenTekst !== 'WISSEN' || wissenBezig ? 'not-allowed' : 'pointer' }}>
                {wissenBezig ? 'Wissen…' : 'Definitief wissen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Herstelsleutel modal */}
      {herstelsleutel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 400, maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ background: 'var(--accent)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>Herstelsleutel</span>
            </div>
            <div style={{ padding: '20px 24px 24px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                Bewaar deze herstelsleutel op een <strong>veilige plek buiten de app</strong> — bijvoorbeeld afgedrukt in een kluis of in een wachtwoordmanager.
                <strong style={{ color: 'var(--red)' }}> Deze sleutel wordt niet meer getoond.</strong>
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Je hebt de herstelsleutel nodig als je je wachtwoord bent vergeten — als alternatief bij het uitschakelen van versleuteling of het koppelen van een extra apparaat. Zonder wachtwoord én herstelsleutel zijn versleutelde backups permanent onleesbaar.
              </p>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', textAlign: 'center', marginBottom: 16 }}>
                <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--text-h)' }}>{herstelsleutel}</code>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { navigator.clipboard.writeText(herstelsleutel); }}
                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Kopiëren
                </button>
                <button onClick={() => {
                  const w = window.open('', '_blank', 'width=500,height=300');
                  if (w) {
                    w.document.write(`<html><head><title>FBS Herstelsleutel</title><style>body{font-family:sans-serif;padding:40px;text-align:center}h2{margin-bottom:8px}code{font-size:24px;letter-spacing:2px;font-weight:bold}p{color:#666;font-size:13px}</style></head><body><h2>FBS Backup Herstelsleutel</h2><code>${herstelsleutel}</code><p>Bewaar deze sleutel op een veilige plek.</p><script>window.print();window.close();</script></body></html>`);
                    w.document.close();
                  }
                }}
                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Afdrukken
                </button>
                <button onClick={() => setHerstelsleutel(null)}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Ik heb de sleutel bewaard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
