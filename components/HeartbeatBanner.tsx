// Globale waarschuwingsbanner: toont een rode strook bovenaan als een ander
// apparaat recent (< 5 min) actief was op dezelfde externe backup-locatie.
// Voorkomt split-brain doordat beide apparaten de waarschuwing direct zien
// en kunnen besluiten om niet tegelijk te werken. Polling: bij mount + elke
// minuut. Bij offline of geen extern: banner blijft uit (geen detectie mogelijk).

'use client';

import { useEffect, useState } from 'react';

type ActiefApparaat = {
  apparaat_id: string;
  apparaat_naam: string | null;
  last_activity: string;
  minuten_geleden: number;
  actief: boolean;
  is_eigen?: boolean;
};

const POLL_MS = 30_000;

export default function HeartbeatBanner() {
  const [apparaten, setApparaten] = useState<ActiefApparaat[]>([]);

  useEffect(() => {
    let actief = true;
    async function load() {
      try {
        const res = await fetch('/api/heartbeats');
        if (!res.ok) return;
        const data = await res.json() as { apparaten: ActiefApparaat[] };
        if (actief) setApparaten((data.apparaten ?? []).filter(a => a.actief && !a.is_eigen));
      } catch { /* */ }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => { actief = false; clearInterval(t); };
  }, []);

  if (apparaten.length === 0) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 950,
      background: 'var(--red)', color: '#fff',
      padding: '8px 16px', fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      borderBottom: '1px solid rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <span>
        {apparaten.length === 1 ? (
          <>Ander apparaat is ook actief: <strong>{apparaten[0].apparaat_naam ?? apparaten[0].apparaat_id.slice(0, 8)}</strong> ({apparaten[0].minuten_geleden} min geleden). Werk niet tegelijk — wijzigingen van één kant gaan anders verloren.</>
        ) : (
          <>{apparaten.length} andere apparaten zijn ook actief: {apparaten.map(a => a.apparaat_naam ?? a.apparaat_id.slice(0, 8)).join(', ')}. Werk niet tegelijk — wijzigingen van één kant gaan anders verloren.</>
        )}
      </span>
    </div>
  );
}
