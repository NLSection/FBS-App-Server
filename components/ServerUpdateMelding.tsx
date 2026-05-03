'use client';
import { useEffect, useState } from 'react';

interface ServerUpdateInfo {
  huidig: string;
  nieuwste: string;
  updateBeschikbaar: boolean;
  ondersteund: boolean;
  releaseUrl?: string | null;
  changelog?: string | null;
}

type Fase = 'idle' | 'triggering' | 'wachten' | 'klaar' | 'fout';

export default function ServerUpdateMelding() {
  const [update, setUpdate] = useState<ServerUpdateInfo | null>(null);
  const [fase, setFase] = useState<Fase>('idle');
  const [foutMsg, setFoutMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/server-update-check', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: ServerUpdateInfo) => {
        if (data.ondersteund && data.updateBeschikbaar) setUpdate(data);
      })
      .catch(() => {});
  }, []);

  if (!update || fase === 'klaar') return null;

  async function pollVoorMatch(doelversie: string) {
    const start = Date.now();
    const max = 90000;
    while (Date.now() - start < max) {
      try {
        const r = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        if (r.ok) {
          const d = (await r.json()) as { version?: string | null };
          if (d.version && `v${d.version}` === doelversie) return true;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 2000));
    }
    return false;
  }

  async function bijwerken() {
    setFase('triggering');
    setFoutMsg(null);
    try {
      const r = await fetch('/api/server-update', { method: 'POST' });
      const data = (await r.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setFase('fout');
        setFoutMsg(data.error ?? 'onbekend');
        return;
      }
      setFase('wachten');
      const ok = update ? await pollVoorMatch(update.nieuwste) : false;
      if (ok) {
        setFase('klaar');
        window.location.reload();
      } else {
        setFase('fout');
        setFoutMsg('time_out — server kwam niet terug op nieuwe versie');
      }
    } catch (e) {
      setFase('fout');
      setFoutMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const bezig = fase === 'triggering' || fase === 'wachten';

  return (
    <div style={{ background: 'var(--green-dim)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-h)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>
            SERVER
          </span>
          {fase === 'wachten' ? (
            <>Server wordt bijgewerkt naar <strong>{update.nieuwste}</strong>… (kan ~30s duren)</>
          ) : fase === 'fout' ? (
            <>Server-update mislukt: <span style={{ color: 'var(--red)' }}>{foutMsg}</span></>
          ) : (
            <>Server-update beschikbaar: <strong>{update.huidig}</strong> → <strong>{update.nieuwste}</strong></>
          )}
        </span>
        <button
          onClick={bijwerken}
          disabled={bezig}
          style={{
            background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6,
            padding: '4px 14px', cursor: bezig ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13,
            opacity: bezig ? 0.7 : 1,
          }}
        >
          {fase === 'triggering' ? 'Starten…' : fase === 'wachten' ? 'Bezig…' : fase === 'fout' ? 'Opnieuw proberen' : 'Server bijwerken'}
        </button>
      </div>
    </div>
  );
}
