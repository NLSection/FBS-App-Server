'use client';

import { useEffect, useState } from 'react';
import WipBadge from '@/components/WipBadge';
import InfoTooltip from '@/components/InfoTooltip';

const KEY_INSPECTOR = 'tool-inspector';

const subKop = { fontSize: 14, fontWeight: 600 as const, color: 'var(--text-h)', margin: 0 };

export default function PaginaHulpmiddelen() {
  const [inspector, setInspector] = useState(false);

  useEffect(() => {
    setInspector(localStorage.getItem(KEY_INSPECTOR) === 'true');
  }, []);

  function toggleInspector() {
    const nieuw = !inspector;
    setInspector(nieuw);
    localStorage.setItem(KEY_INSPECTOR, String(nieuw));
    window.dispatchEvent(new CustomEvent('tool-toolbar-changed'));
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: 'var(--accent-dim)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p style={subKop}>Pagina opties ontdekken</p>
        <InfoTooltip volledigeBreedte tekst="Hulpmiddel om te zien welke acties op een pagina beschikbaar zijn. Met de schakelaar hieronder verschijnt naast elke paginatitel een knop die alle context-menu's (rechtermuisklik op een rij, hamburger-menu, tandwiel-knop) tegelijk opent en met pijltjes naar hun trigger wijst. Handig om snel te ontdekken wat een pagina kan zonder zelf alles aan te klikken." />
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-h)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>&quot;Pagina-opties tonen&quot;-knop weergeven <WipBadge /></p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
              Toont op elke pagina naast de titel een knop die alle beschikbare context menu&apos;s (rechtermuisklik, hamburger, tandwiel) verzamelt en tegelijk in beeld brengt met pijltjes naar hun trigger.
            </p>
          </div>
          <button type="button" onClick={toggleInspector} role="switch" aria-checked={inspector}
            style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: inspector ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0, padding: 0, marginLeft: 'auto' }}>
            <span style={{ position: 'absolute', top: 2, left: inspector ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
