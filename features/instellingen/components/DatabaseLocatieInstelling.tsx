'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';
import WipBadge from '@/components/WipBadge';

type DbMode = 'local' | 'remote';
type DbModeConfig = { mode: DbMode; url: string | null };
type ProbeResp = { ok: boolean; app?: string; schemaVersion?: number | null; error?: string };
type ScanResp = {
  ok: boolean;
  subnet?: string;
  iface?: string;
  port?: number;
  servers?: { ip: string; schemaVersion: number | null }[];
  error?: string;
};

const knopPrimair: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
  padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};
const knopSecundair: React.CSSProperties = {
  background: 'transparent', color: 'var(--text-h)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function DatabaseLocatieInstelling() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const [mode, setMode] = useState<DbMode>('local');
  const [url, setUrl] = useState('');
  const [laden, setLaden] = useState(true);

  const [testBezig, setTestBezig] = useState(false);
  const [testResultaat, setTestResultaat] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const [scanBezig, setScanBezig] = useState(false);
  const [scanResultaat, setScanResultaat] = useState<ScanResp | null>(null);

  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [opslaanMsg, setOpslaanMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) { setLaden(false); return; }
    (async () => {
      try {
        const tauri = await import('@tauri-apps/api/core');
        const cfg = await tauri.invoke<DbModeConfig>('get_db_mode');
        setMode(cfg.mode || 'local');
        setUrl(cfg.url ?? '');
      } catch (e) {
        console.error('get_db_mode mislukt:', e);
      } finally {
        setLaden(false);
      }
    })();
  }, [isTauri]);

  async function testVerbinding() {
    if (!url.trim()) return;
    setTestBezig(true);
    setTestResultaat(null);
    try {
      const r = await fetch('/api/probe-fbs-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await r.json()) as ProbeResp;
      if (data.ok) {
        setTestResultaat({ kind: 'ok', msg: `Verbonden — FBS-server, schema v${data.schemaVersion ?? '?'}` });
      } else {
        setTestResultaat({ kind: 'err', msg: `Niet bereikbaar (${data.error ?? 'onbekend'})` });
      }
    } catch (e) {
      setTestResultaat({ kind: 'err', msg: String(e) });
    } finally {
      setTestBezig(false);
    }
  }

  async function scanNetwerk() {
    setScanBezig(true);
    setScanResultaat(null);
    try {
      const r = await fetch('/api/lan-scan', { cache: 'no-store' });
      const data = (await r.json()) as ScanResp;
      setScanResultaat(data);
    } catch (e) {
      setScanResultaat({ ok: false, error: String(e) });
    } finally {
      setScanBezig(false);
    }
  }

  function kiesGevondenServer(ip: string, port: number) {
    setUrl(`http://${ip}:${port}`);
    setTestResultaat(null);
    setScanResultaat(null);
  }

  async function opslaanEnHerstart() {
    if (mode === 'remote' && !url.trim()) {
      setOpslaanMsg('URL is verplicht voor "Externe NAS".');
      return;
    }
    if (!isTauri) {
      if (mode === 'remote') {
        setOpslaanBezig(true);
        setOpslaanMsg('Browser navigeert naar NAS-server…');
        window.location.href = url.trim();
        return;
      }
      setOpslaanMsg('Lokale modus is in de browser al actief — geen herstart nodig.');
      return;
    }
    setOpslaanBezig(true);
    setOpslaanMsg('Opslaan…');
    try {
      const tauri = await import('@tauri-apps/api/core');
      await tauri.invoke('set_db_mode', { mode, url: mode === 'remote' ? url.trim() : null });
      setOpslaanMsg('Opgeslagen — app wordt herstart…');
      await tauri.invoke('restart_app');
    } catch (e) {
      setOpslaanMsg(`Fout: ${String(e)}`);
      setOpslaanBezig(false);
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Database-locatie</p>
        <WipBadge tekst="De Database-locatie instelling is nog in ontwikkeling en kan onverwacht gedrag vertonen." />
        <InfoTooltip volledigeBreedte tekst="Lokaal: SQLite-bestand op deze PC, geen netwerk nodig. Externe NAS: deze app verbindt met een FBS-server op een NAS — ideaal voor multi-device gebruik. Wisselen vereist een herstart van de app." />
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        {laden ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Laden…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="db-locatie" checked={mode === 'local'} onChange={() => setMode('local')} style={{ marginTop: 3 }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Lokaal <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>(standaard)</span></p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>SQLite-bestand op deze PC. Geen netwerkverbinding nodig.</p>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="db-locatie" checked={mode === 'remote'} onChange={() => setMode('remote')} style={{ marginTop: 3 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Externe NAS</p>
                  <WipBadge tekst="De Externe NAS-modus is nog in ontwikkeling en kan onverwacht gedrag vertonen." />
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>Verbind met een FBS-server op een NAS in het lokale netwerk. De database leeft daar — alle apparaten zien dezelfde data.</p>
              </div>
            </label>

            {mode === 'remote' && (
              <div style={{ marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <details style={{ background: 'var(--bg-page, transparent)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--text-dim)' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-h)', fontWeight: 500 }}>Hoe werkt deze modus?</summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.5 }}>
                    <p style={{ margin: 0 }}>
                      Externe NAS gebruikt de <strong>FBS-Server</strong> applicatie die je via Docker draait — bijvoorbeeld op een Synology of QNAP NAS. De database (`fbs.db`) leeft op de NAS; alle apparaten met deze app verbinden ernaartoe en zien dezelfde data.
                    </p>
                    <p style={{ margin: 0 }}>
                      Installatie via Container Manager met een <code>docker-compose.yml</code>:
                    </p>
                    <p style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <a href="https://raw.githubusercontent.com/NLSection/FBS-App-Server/main/docker-compose.yml" download="docker-compose.yml" style={{ color: 'var(--accent)' }}>
                        ⬇ Download docker-compose.yml
                      </a>
                      <a href="https://github.com/NLSection/FBS-App-Server" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                        Volledige instructies (FBS-Server repo) →
                      </a>
                    </p>
                  </div>
                </details>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Server-URL</span>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setTestResultaat(null); }}
                    placeholder="http://192.168.1.50:3210"
                    style={{
                      padding: '8px 10px', fontFamily: 'monospace', fontSize: 13, maxWidth: 460,
                      background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-h)',
                      border: '1px solid var(--border)', borderRadius: 6,
                    }}
                  />
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={testVerbinding} disabled={!url.trim() || testBezig} style={{ ...knopSecundair, opacity: !url.trim() || testBezig ? 0.5 : 1, cursor: testBezig ? 'wait' : 'pointer' }}>
                    {testBezig ? 'Testen…' : 'Test verbinding'}
                  </button>
                  <button type="button" onClick={scanNetwerk} disabled={scanBezig} style={{ ...knopSecundair, cursor: scanBezig ? 'wait' : 'pointer' }}>
                    {scanBezig ? 'Scannen…' : 'Scan netwerk'}
                  </button>
                  {testResultaat && (
                    <span style={{
                      fontSize: 12,
                      color: testResultaat.kind === 'ok' ? 'var(--accent)' : 'var(--danger, #d73a49)',
                    }}>
                      {testResultaat.msg}
                    </span>
                  )}
                </div>

                {scanResultaat && (
                  <div style={{ background: 'var(--bg-page, transparent)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 12 }}>
                    {!scanResultaat.ok ? (
                      <span style={{ color: 'var(--danger, #d73a49)' }}>Scan mislukt: {scanResultaat.error}</span>
                    ) : !scanResultaat.servers || scanResultaat.servers.length === 0 ? (
                      <span style={{ color: 'var(--text-dim)' }}>
                        Geen FBS-server gevonden in <code>{scanResultaat.subnet}</code> (poort {scanResultaat.port}). Controleer of de container draait en de firewall poort {scanResultaat.port} toelaat.
                      </span>
                    ) : (
                      <div>
                        <p style={{ margin: '0 0 6px', color: 'var(--text-dim)' }}>
                          Gevonden in <code>{scanResultaat.subnet}</code> (interface <code>{scanResultaat.iface}</code>):
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {scanResultaat.servers.map((s) => (
                            <button
                              key={s.ip}
                              type="button"
                              onClick={() => kiesGevondenServer(s.ip, scanResultaat.port ?? 3210)}
                              style={{
                                textAlign: 'left', padding: '6px 10px', fontFamily: 'monospace',
                                background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                                color: 'var(--text-h)', cursor: 'pointer', fontSize: 13,
                              }}
                            >
                              http://{s.ip}:{scanResultaat.port} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>— schema v{s.schemaVersion ?? '?'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={opslaanEnHerstart}
                disabled={opslaanBezig}
                style={{ ...knopPrimair, cursor: opslaanBezig ? 'wait' : 'pointer', opacity: opslaanBezig ? 0.7 : 1 }}
              >
                {opslaanBezig ? 'Bezig…' : 'Opslaan & herstart app'}
              </button>
              {opslaanMsg && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{opslaanMsg}</span>}
              {!isTauri && !opslaanMsg && (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  In de browser navigeert deze knop direct naar de NAS-URL (zelfde effect als Tauri-webview-redirect).
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
