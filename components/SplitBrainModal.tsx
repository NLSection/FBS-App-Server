// SplitBrainModal — detecteert via /api/sync-state of beide kanten (lokaal +
// extern) wijzigingen hebben sinds de laatste gezamenlijke staat, en biedt
// de gebruiker een bewuste keuze. Geen automatische merge: één kant wint,
// de ander wordt als verloren-tak archief bewaard zodat data nooit
// onomkeerbaar verdwijnt.
//
// Polls bij mount + elke 2 minuten. Modal verschijnt alleen bij
// status === 'split_brain'.

'use client';

import { useEffect, useState } from 'react';

type SyncState = {
  status: 'in_sync' | 'lokaal_voor' | 'extern_voor' | 'split_brain' | 'extern_offline' | 'geen_extern';
  lokaal_aantal?: number;
  extern_aantal?: number;
  extern_schrijver_id?: string | null;
  eigen_apparaat_naam?: string | null;
};

const POLL_MS = 2 * 60_000;

export default function SplitBrainModal() {
  const [state, setState] = useState<SyncState | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [externNaam, setExternNaam] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;
    async function load() {
      try {
        const res = await fetch('/api/sync-state');
        if (!res.ok) return;
        const data = await res.json() as SyncState;
        if (!actief) return;
        setState(data);
        // Naam van het externe apparaat ophalen via heartbeats voor betere UX
        if (data.status === 'split_brain' && data.extern_schrijver_id) {
          try {
            const hbRes = await fetch('/api/heartbeats');
            if (hbRes.ok) {
              const hb = await hbRes.json() as { apparaten: { apparaat_id: string; apparaat_naam: string | null }[] };
              const match = hb.apparaten.find(a => a.apparaat_id === data.extern_schrijver_id);
              setExternNaam(match?.apparaat_naam ?? null);
            }
          } catch { /* */ }
        }
      } catch { /* */ }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => { actief = false; clearInterval(t); };
  }, []);

  if (!state || state.status !== 'split_brain') return null;

  const externLabel = externNaam ?? `apparaat ${state.extern_schrijver_id?.slice(0, 8) ?? 'onbekend'}`;

  async function kiesMijne() {
    setBezig(true); setFout(null);
    try {
      const res = await fetch('/api/sync-state/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keuze: 'mijne' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Resolve mislukt.');
      }
      window.location.reload();
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
      setBezig(false);
    }
  }

  async function kiesAndere() {
    setBezig(true); setFout(null);
    try {
      const res = await fetch('/api/sync-state/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keuze: 'andere' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Resolve mislukt.');
      }
      const d = await res.json() as { anker_naam: string | null };
      if (!d.anker_naam) throw new Error('Geen externe anker beschikbaar voor restore.');
      // Restore vanaf extern anker — bestaande flow doet pre-restore-backup
      // van huidige staat (= verloren-tak archief van onze versie).
      const restoreRes = await fetch('/api/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestandsnaam: d.anker_naam, bron: 'extern' }),
      });
      if (!restoreRes.ok) {
        const dd = await restoreRes.json().catch(() => ({}));
        throw new Error((dd as { error?: string }).error ?? 'Restore mislukt.');
      }
      window.location.reload();
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
      setBezig(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--red)', borderRadius: 10, overflow: 'hidden', minWidth: 420, maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div style={{ background: 'var(--red)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>Synchronisatieconflict</span>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
            Beide kanten hebben wijzigingen sinds de laatste gemeenschappelijke staat. Eén kant moet winnen — de andere wordt als verloren-tak gearchiveerd zodat de data niet verdwijnt.
          </p>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--text)' }}>
            <div style={{ marginBottom: 4 }}>
              <strong style={{ color: 'var(--text-h)' }}>{state.eigen_apparaat_naam ?? 'Dit apparaat'}</strong>: <strong>{state.lokaal_aantal ?? 0}</strong> wijziging{state.lokaal_aantal === 1 ? '' : 'en'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-h)' }}>{externLabel}</strong>: <strong>{state.extern_aantal ?? 0}</strong> wijziging{state.extern_aantal === 1 ? '' : 'en'}
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            De verlorende kant wordt opgeslagen in de map <code>backup/verloren-takken/</code> zodat je hem later handmatig kunt inzien of importeren.
          </p>
          {fout && <p style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>{fout}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={kiesAndere} disabled={bezig}
              style={{ background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: bezig ? 'wait' : 'pointer' }}>
              {bezig ? 'Bezig…' : `Versie van ${externLabel} nemen`}
            </button>
            <button onClick={kiesMijne} disabled={bezig}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: bezig ? 'wait' : 'pointer', opacity: bezig ? 0.6 : 1 }}>
              {bezig ? 'Bezig…' : 'Mijn versie behouden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
