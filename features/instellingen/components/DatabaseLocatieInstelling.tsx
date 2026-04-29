'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';

type DbMode = 'local' | 'remote';
type DbModeConfig = { mode: DbMode; url: string | null };

export default function DatabaseLocatieInstelling() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const [mode, setMode] = useState<DbMode>('local');
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'ok' | 'err' | 'busy'; msg: string }>({ kind: 'idle', msg: '' });
  const [savingMsg, setSavingMsg] = useState<string>('');

  useEffect(() => {
    if (!isTauri) { setLoaded(true); return; }
    (async () => {
      try {
        const tauri = await import('@tauri-apps/api/core');
        const cfg = await tauri.invoke<DbModeConfig>('get_db_mode');
        setMode(cfg.mode || 'local');
        setUrl(cfg.url ?? '');
      } catch (e) {
        console.error('get_db_mode mislukt:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [isTauri]);

  const test = async () => {
    setTestStatus({ kind: 'busy', msg: 'Bezig met testen...' });
    try {
      const tauri = await import('@tauri-apps/api/core');
      const r = await tauri.invoke<{ ok: boolean; app: string | null; schemaVersion: number | null }>(
        'test_remote_connection',
        { url: url.trim() },
      );
      setTestStatus({ kind: 'ok', msg: `Verbonden — FBS-server, schema v${r.schemaVersion ?? '?'}` });
    } catch (e: unknown) {
      setTestStatus({ kind: 'err', msg: String(e) });
    }
  };

  const opslaanEnHerstart = async () => {
    if (mode === 'remote' && !url.trim()) {
      setSavingMsg('URL is verplicht voor "Externe NAS".');
      return;
    }
    setSavingMsg('Opslaan...');
    try {
      const tauri = await import('@tauri-apps/api/core');
      await tauri.invoke('set_db_mode', { mode, url: mode === 'remote' ? url.trim() : null });
      setSavingMsg('Opgeslagen — app wordt herstart...');
      await tauri.invoke('restart_app');
    } catch (e: unknown) {
      setSavingMsg(`Fout: ${String(e)}`);
    }
  };

  if (!isTauri) {
    return (
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <p className="section-title" style={{ margin: 0 }}>Database-locatie</p>
          <InfoTooltip volledigeBreedte tekst="Deze instelling bepaalt waar de database leeft: lokaal op deze PC, of op een externe FBS-server (NAS). Alleen beschikbaar in de Tauri-app." />
        </div>
        <p style={{ opacity: 0.7 }}>Deze instelling is alleen beschikbaar in de geïnstalleerde Tauri-app.</p>
      </section>
    );
  }

  if (!loaded) return null;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Database-locatie</p>
        <InfoTooltip volledigeBreedte tekst="Lokaal: SQLite-bestand op deze PC, geen netwerk nodig. Externe NAS: deze app verbindt met een FBS-server op een NAS — ideaal voor multi-device gebruik. Wisselen vereist een herstart." />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="radio" checked={mode === 'local'} onChange={() => setMode('local')} />
          <span><strong>Lokaal</strong> — SQLite op deze PC (huidige standaard)</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="radio" checked={mode === 'remote'} onChange={() => setMode('remote')} />
          <span><strong>Externe NAS</strong> — verbind met een FBS-server</span>
        </label>

        {mode === 'remote' && (
          <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, opacity: 0.85 }}>Server-URL</span>
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setTestStatus({ kind: 'idle', msg: '' }); }}
                placeholder="http://192.168.1.50:3210"
                style={{ padding: 8, fontFamily: 'monospace', maxWidth: 420 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={test} disabled={!url.trim() || testStatus.kind === 'busy'}>
                Test verbinding
              </button>
              {testStatus.msg && (
                <span style={{
                  fontSize: 13,
                  color: testStatus.kind === 'ok' ? 'var(--accent, #2ea043)'
                       : testStatus.kind === 'err' ? '#d73a49'
                       : undefined,
                }}>
                  {testStatus.msg}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button onClick={opslaanEnHerstart}>Opslaan & herstart app</button>
          {savingMsg && <span style={{ fontSize: 13, opacity: 0.85 }}>{savingMsg}</span>}
        </div>
      </div>
    </section>
  );
}
