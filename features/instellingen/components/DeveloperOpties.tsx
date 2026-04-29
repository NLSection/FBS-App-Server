'use client';

import { useEffect, useState } from 'react';

const DEV_KEY = 'dev-preview-modus';
const KEY_ANONIMISEER = 'dev-toolbar-anonimiseer';
const KEY_ANONIMISEER_MODUS = 'dev-anonimiseer-modus';
const KEY_SCREENSHOT = 'dev-toolbar-screenshot';

const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };

export default function DeveloperOpties() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <DeveloperOptiesInner />;
}

function DeveloperOptiesInner() {
  const [devPreview, setDevPreview] = useState(false);
  const [legeDb, setLegeDb] = useState(false);
  const [legeDbBezig, setLegeDbBezig] = useState(false);
  const [anonimiseerKnop, setAnonimiseerKnop] = useState(false);
  const [anonimiseerModus, setAnonimiseerModus] = useState(false);
  const [screenshotKnop, setScreenshotKnop] = useState(false);

  useEffect(() => {
    setDevPreview(localStorage.getItem(DEV_KEY) === 'true');
    setAnonimiseerKnop(localStorage.getItem(KEY_ANONIMISEER) === 'true');
    setAnonimiseerModus(localStorage.getItem(KEY_ANONIMISEER_MODUS) === 'true');
    setScreenshotKnop(localStorage.getItem(KEY_SCREENSHOT) === 'true');
    fetch('/api/dev/switch-db').then(r => r.ok ? r.json() : null).then((d: { actief: boolean } | null) => {
      if (d) setLegeDb(d.actief);
    }).catch(() => {});
  }, []);

  function toggleDevPreview() {
    const nieuw = !devPreview;
    setDevPreview(nieuw);
    localStorage.setItem(DEV_KEY, String(nieuw));
    window.dispatchEvent(new CustomEvent('dev-preview-changed', { detail: { aan: nieuw } }));
  }

  function toggleAnonimiseerKnop() {
    const nieuw = !anonimiseerKnop;
    setAnonimiseerKnop(nieuw);
    localStorage.setItem(KEY_ANONIMISEER, String(nieuw));
    window.dispatchEvent(new CustomEvent('dev-toolbar-changed'));
  }

  function toggleAnonimiseerModus() {
    const nieuw = !anonimiseerModus;
    setAnonimiseerModus(nieuw);
    localStorage.setItem(KEY_ANONIMISEER_MODUS, String(nieuw));
    window.dispatchEvent(new CustomEvent('dev-toolbar-changed'));
  }

  function toggleScreenshotKnop() {
    const nieuw = !screenshotKnop;
    setScreenshotKnop(nieuw);
    localStorage.setItem(KEY_SCREENSHOT, String(nieuw));
    window.dispatchEvent(new CustomEvent('dev-toolbar-changed'));
  }

  async function toggleLegeDb() {
    if (legeDbBezig) return;
    setLegeDbBezig(true);
    const nieuw = !legeDb;
    try {
      const r = await fetch('/api/dev/switch-db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actief: nieuw }) });
      if (r.ok) window.location.href = '/';
    } finally {
      setLegeDbBezig(false);
    }
  }

  return (
    <section data-onboarding="inst-developer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Developer opties</p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={subKop}>Preview</p>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>
                Preview knoppen tonen
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Toont per sectie knoppen om de modal- en menuweergave te bekijken.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleDevPreview}
              role="switch"
              aria-checked={devPreview}
              style={{
                position: 'relative', width: 44, height: 24, borderRadius: 12,
                border: 'none', cursor: 'pointer',
                background: devPreview ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.2s', flexShrink: 0, padding: 0,
                marginLeft: 'auto',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: devPreview ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 16 }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={subKop}>Database</p>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>
                Lege database gebruiken
                {legeDb && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'var(--red-dim, rgba(220,50,50,0.1))', border: '1px solid var(--red)', borderRadius: 4, padding: '1px 6px' }}>ACTIEF</span>}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Schakelt naar een lege testdatabase. Bij uitzetten keert de app terug naar de echte database.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleLegeDb}
              disabled={legeDbBezig}
              role="switch"
              aria-checked={legeDb}
              style={{
                position: 'relative', width: 44, height: 24, borderRadius: 12,
                border: 'none', cursor: legeDbBezig ? 'wait' : 'pointer',
                background: legeDb ? 'var(--red)' : 'var(--border)',
                transition: 'background 0.2s', flexShrink: 0, padding: 0,
                marginLeft: 'auto', opacity: legeDbBezig ? 0.6 : 1,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: legeDb ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 16 }}>
        <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={subKop}>Pagina tools</p>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Anonimiseer-knop tonen</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Toont rechtsonder een knop die persoons-, werkgever-, IBAN- en bedrag-gegevens in de huidige pagina vervangt door demo-waarden (alleen in de DOM — refresh reset).
              </p>
            </div>
            <button type="button" onClick={toggleAnonimiseerKnop} role="switch" aria-checked={anonimiseerKnop}
              style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: anonimiseerKnop ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0, padding: 0, marginLeft: 'auto' }}>
              <span style={{ position: 'absolute', top: 2, left: anonimiseerKnop ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Anonimiseer-modus (doorlopend)</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Past de anonimisatie automatisch toe op elke pagina die je opent. Handig voor live demo&apos;s zonder per pagina te hoeven klikken.
              </p>
            </div>
            <button type="button" onClick={toggleAnonimiseerModus} role="switch" aria-checked={anonimiseerModus}
              style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: anonimiseerModus ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0, padding: 0, marginLeft: 'auto' }}>
              <span style={{ position: 'absolute', top: 2, left: anonimiseerModus ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)' }}>Screenshot-knop tonen</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
                Toont een knop waarmee je een kader kunt slepen om een screenshot te maken via de browser screen capture API. Opgeslagen in public/.
              </p>
            </div>
            <button type="button" onClick={toggleScreenshotKnop} role="switch" aria-checked={screenshotKnop}
              style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: screenshotKnop ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0, padding: 0, marginLeft: 'auto' }}>
              <span style={{ position: 'absolute', top: 2, left: screenshotKnop ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

        </div>
      </div>
    </section>
  );
}
