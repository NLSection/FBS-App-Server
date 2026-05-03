'use client';

import { useEffect, useState } from 'react';
import InfoTooltip from '@/components/InfoTooltip';

type Kanaal = 'main' | 'test' | 'uit';

export default function UpdateKanaalInstelling() {
  const [kanaal, setKanaal] = useState<Kanaal>('main');
  const [laden, setLaden] = useState(true);
  const [controleert, setControleert] = useState(false);
  const [resultaat, setResultaat] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/instellingen')
      .then(r => r.json())
      .then((data: { updateKanaal?: Kanaal }) => {
        const k = data.updateKanaal;
        setKanaal(k === 'test' || k === 'uit' ? k : 'main');
      })
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  function wisCache() {
    try {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('fbs-update-check-')) localStorage.removeItem(k); });
    } catch {}
  }

  async function wijzig(nieuw: Kanaal) {
    if (nieuw === kanaal) return;
    const vorig = kanaal;
    setKanaal(nieuw);
    setResultaat(null);
    wisCache();
    const res = await fetch('/api/instellingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateKanaal: nieuw }),
    });
    if (!res.ok) {
      setKanaal(vorig);
      alert('Update-kanaal kon niet opgeslagen worden.');
    }
  }

  async function controleerNu() {
    setControleert(true);
    setResultaat(null);
    wisCache();
    try {
      const res = await fetch('/api/updates/check?forceer=1', { cache: 'no-store' });
      const data: { updateBeschikbaar?: boolean; nieuwste?: string; huidig?: string } = await res.json();
      if (data.updateBeschikbaar) {
        setResultaat(`Nieuwe versie beschikbaar: ${data.nieuwste}. Ga naar de updatemelding bovenaan om te installeren.`);
      } else {
        setResultaat(`Je gebruikt de nieuwste versie (${data.huidig ?? 'onbekend'}).`);
      }
      // Notify UpdateMelding banner-component zodat die direct refresht (anders
      // verschijnt de banner pas na een app-herstart — gebruikersfeedback 02-05-2026).
      window.dispatchEvent(new CustomEvent('updates-checked'));
    } catch {
      setResultaat('Kon niet controleren — geen verbinding of server niet bereikbaar.');
    } finally {
      setControleert(false);
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Updates</p>
        <InfoTooltip volledigeBreedte tekst="Bepaalt hoe de app met updates omgaat. Stabiel (standaard) toont alleen publieke releases. Test-kanaal toont test-builds — alleen voor actieve testers. Uitgeschakeld controleert helemaal niet meer; met 'Nu controleren' kun je zelf zoeken naar een nieuwe versie." />
      </div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        {laden ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Laden…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="update-kanaal" checked={kanaal === 'main'} onChange={() => wijzig('main')} style={{ marginTop: 3 }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Stabiel <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>(aanbevolen)</span></p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>Updates uit FBS-App-Main. Alleen vrijgegeven versies.</p>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="update-kanaal" checked={kanaal === 'test'} onChange={() => wijzig('test')} style={{ marginTop: 3 }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Test-kanaal</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>Updates uit FBS-App-Test. Nog niet vrijgegeven builds — kan instabiel zijn. De updatemelding krijgt een TEST-badge; installatie verloopt identiek aan het stabiele kanaal.</p>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="update-kanaal" checked={kanaal === 'uit'} onChange={() => wijzig('uit')} style={{ marginTop: 3 }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Uitgeschakeld</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>Geen automatische controle op nieuwe versies. Gebruik &quot;Nu controleren&quot; hieronder als je handmatig wilt kijken of er een update beschikbaar is.</p>
              </div>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={controleerNu}
                disabled={controleert}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '6px 14px', fontSize: 13, fontWeight: 600,
                  cursor: controleert ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {controleert ? 'Controleren…' : 'Nu controleren'}
              </button>
              {resultaat && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{resultaat}</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
