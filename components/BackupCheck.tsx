'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BACKUP_TABELLEN } from '@/config/backupTabellen';

interface CheckData {
  backupIsNieuwer: boolean;
  backupDatum: string | null;
  backupBestand: string | null;
  bron: 'lokaal' | 'extern' | null;
  forkDetected: boolean;
  pendingExtern: number;
  encryptieConfigMismatch: boolean;
  encryptieConfigOntbreekt: boolean;
}

export default function BackupCheck() {
  const router = useRouter();
  const [check, setCheck] = useState<CheckData | null>(null);
  const [pending, setPending] = useState(0);
  const [bannerZichtbaar, setBannerZichtbaar] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [mismatchBezig, setMismatchBezig] = useState(false);
  const [mismatchFout, setMismatchFout] = useState<string | null>(null);
  const [koppelFase, setKoppelFase] = useState(false);
  const [koppelWachtwoord, setKoppelWachtwoord] = useState('');
  const [koppelBezig, setKoppelBezig] = useState(false);
  const [koppelFout, setKoppelFout] = useState<string | null>(null);

  useEffect(() => {
    function doCheck() {
      fetch('/api/backup/check')
        .then(r => r.json())
        .then((data: CheckData) => {
          if (data.backupIsNieuwer || data.forkDetected) setCheck(data);
          setPending(data.pendingExtern ?? 0);
        })
        .catch(() => {});
    }

    doCheck();
    const interval = setInterval(doCheck, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pending > 0) {
      setBannerZichtbaar(true);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => setBannerZichtbaar(false), 4000);
    }
    return () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); };
  }, [pending]);

  // Pending indicator (niet-blokkend)
  if (!check && pending > 0) {
    return (
      <div onClick={() => router.push('/instellingen#pending-extern')} style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9000,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)',
        cursor: 'pointer',
        opacity: bannerZichtbaar ? 1 : 0,
        transition: 'opacity 1.2s ease',
        pointerEvents: bannerZichtbaar ? 'auto' : 'none',
      }}>
        <span style={{ color: 'var(--accent)', fontSize: 14 }}>⏳</span>
        {pending} backup{pending !== 1 ? 's' : ''} wacht{pending === 1 ? '' : 'en'} op synchronisatie naar externe locatie
      </div>
    );
  }

  if (!check) return null;

  async function herstel() {
    setBezig(true);
    setFout(null);
    try {
      const restoreRes = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestandsnaam: check?.backupBestand, bron: check?.bron }),
      });
      if (!restoreRes.ok) {
        const err = await restoreRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Herstel mislukt.');
      }
      window.location.reload();
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
      setBezig(false);
    }
  }

  async function downloadLokaleBackup() {
    const res = await fetch(`/api/backup?tabellen=${BACKUP_TABELLEN.join(',')}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const datum = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fbs-backup-lokaal-${datum}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const datum = check.backupDatum
    ? new Date(check.backupDatum).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })
    : 'onbekend';

  // Encryptie mismatch modal
  if (check.encryptieConfigMismatch) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay)' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 380, maxWidth: 480, boxShadow: 'var(--shadow-md)' }}>
          <div style={{ background: 'var(--orange, #f59e0b)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>Versleutelingsconfiguratie gewijzigd</span>
          </div>
          <div style={{ padding: '20px 24px 24px' }}>
            {!koppelFase ? (<>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                De versleutelingsconfiguratie op de externe locatie is gewijzigd door een ander apparaat. De huidige instellingen op dit apparaat komen niet meer overeen.
              </p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Klik op <strong>Opnieuw koppelen</strong> om het nieuwe wachtwoord in te voeren. Bestaande versleutelde backups van dit apparaat worden hierna onleesbaar.
              </p>
              {mismatchFout && <p style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>{mismatchFout}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCheck(null)} disabled={mismatchBezig}
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Later
                </button>
                <button disabled={mismatchBezig} onClick={async () => {
                  setMismatchBezig(true); setMismatchFout(null);
                  try {
                    const res = await fetch('/api/backup/encryptie/reset', { method: 'POST' });
                    if (!res.ok) throw new Error('Reset mislukt.');
                    setKoppelFase(true);
                  } catch (err) {
                    setMismatchFout(err instanceof Error ? err.message : 'Onbekende fout.');
                  }
                  setMismatchBezig(false);
                }}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: mismatchBezig ? 'wait' : 'pointer', opacity: mismatchBezig ? 0.6 : 1 }}>
                  {mismatchBezig ? 'Bezig…' : 'Opnieuw koppelen'}
                </button>
              </div>
            </>) : (<>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                Voer het wachtwoord of de herstelsleutel in van het apparaat dat de versleuteling heeft gewijzigd.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="password" placeholder="Wachtwoord of herstelsleutel" value={koppelWachtwoord} onChange={e => setKoppelWachtwoord(e.target.value)}
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter' && koppelWachtwoord) document.getElementById('backupcheck-koppel-btn')?.click(); }}
                />
                {koppelFout && <p style={{ color: 'var(--red)', margin: 0, fontSize: 13 }}>{koppelFout}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => { setKoppelFase(false); setKoppelWachtwoord(''); setKoppelFout(null); setCheck(null); }}
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Annuleren
                </button>
                <button id="backupcheck-koppel-btn" disabled={koppelBezig || !koppelWachtwoord} onClick={async () => {
                  setKoppelBezig(true); setKoppelFout(null);
                  try {
                    const res = await fetch('/api/backup/encryptie/koppel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: koppelWachtwoord }) });
                    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error ?? 'Koppelen mislukt.'); }
                    window.location.reload();
                  } catch (err) {
                    setKoppelFout(err instanceof Error ? err.message : 'Onbekende fout.');
                    setKoppelBezig(false);
                  }
                }}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: koppelBezig ? 'wait' : 'pointer', opacity: (koppelBezig || !koppelWachtwoord) ? 0.6 : 1 }}>
                  {koppelBezig ? 'Koppelen…' : 'Koppelen'}
                </button>
              </div>
            </>)}
          </div>
        </div>
      </div>
    );
  }

  // Fork-melding
  if (check.forkDetected) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay)' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 380, maxWidth: 520, boxShadow: 'var(--shadow-md)' }}>
          <div style={{ background: 'var(--red)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>Synchronisatieconflict</span>
          </div>
          <div style={{ padding: '20px 24px 24px' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
              Er zijn wijzigingen aangebracht op zowel dit apparaat als op een ander apparaat die niet gesynchroniseerd zijn. Je hebt drie opties:
            </p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              <li><strong style={{ color: 'var(--text-h)' }}>Externe backup importeren</strong> — de data van het andere apparaat wordt geladen. Er wordt eerst een backup van de huidige staat gemaakt.</li>
              <li><strong style={{ color: 'var(--text-h)' }}>Lokale versie behouden</strong> — de huidige data blijft. Bij de volgende backup wordt het andere apparaat bijgewerkt.</li>
              <li><strong style={{ color: 'var(--text-h)' }}>Beide downloaden</strong> — download de huidige lokale data als bestand om handmatig te vergelijken.</li>
            </ul>
            {fout && <p style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>{fout}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={downloadLokaleBackup} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                Beide downloaden
              </button>
              <button disabled={bezig} onClick={async () => {
                setBezig(true);
                try { await fetch('/api/backup/check', { method: 'POST' }); } catch { /* */ }
                setBezig(false);
                setCheck(null);
              }} style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: bezig ? 'wait' : 'pointer' }}>
                Lokale versie behouden
              </button>
              <button onClick={herstel} disabled={bezig} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: bezig ? 'wait' : 'pointer', opacity: bezig ? 0.6 : 1 }}>
                {bezig ? 'Bezig…' : 'Externe backup importeren'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normale nieuwere-backup melding
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay)' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 380, maxWidth: 460, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ background: 'var(--accent)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📥</span>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>Nieuwe backup beschikbaar</span>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
            Er is een backup van{' '}
            <strong style={{ color: 'var(--text-h)' }}>{datum}</strong>{' '}
            {check.bron === 'extern' ? 'beschikbaar via de externe backup locatie' : 'gesynchroniseerd'}.
            Wil je de database bijwerken?
          </p>
          {fout && <p style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>{fout}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setCheck(null)} disabled={bezig}
              style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}>
              Later
            </button>
            <button onClick={herstel} disabled={bezig}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: bezig ? 'wait' : 'pointer', opacity: bezig ? 0.6 : 1 }}>
              {bezig ? 'Bezig…' : 'Importeren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
