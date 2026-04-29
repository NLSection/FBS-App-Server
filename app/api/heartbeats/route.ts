// GET /api/heartbeats — lijst andere apparaten die de externe locatie
// gebruiken, met laatste activiteit per apparaat. Wordt door de
// HeartbeatBanner component gepolld voor de "ander apparaat is actief"
// waarschuwing en in de instellingen-pagina voor de zichtbaarheidslijst.

import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { leesAndereHeartbeats, HEARTBEAT_RECENT_DREMPEL_MS } from '@/lib/heartbeat';

export async function GET() {
  const heartbeats = await leesAndereHeartbeats();
  const nu = Date.now();
  const verrijkt = heartbeats.map(hb => {
    const last = new Date(hb.last_activity).getTime();
    const elapsed = nu - last;
    return {
      apparaat_id: hb.apparaat_id,
      apparaat_naam: hb.apparaat_naam,
      last_activity: hb.last_activity,
      minuten_geleden: Math.max(0, Math.round(elapsed / 60_000)),
      actief: elapsed < HEARTBEAT_RECENT_DREMPEL_MS,
      is_eigen: false,
    };
  });

  // Eigen apparaat als eerste entry toevoegen — altijd "actief" (we draaien
  // nu immers) en gemarkeerd met is_eigen zodat de UI 'm anders kan tonen.
  try {
    const eigen = getDb().prepare('SELECT apparaat_id, apparaat_naam FROM instellingen WHERE id = 1')
      .get() as { apparaat_id: string | null; apparaat_naam: string | null } | undefined;
    if (eigen?.apparaat_id) {
      verrijkt.unshift({
        apparaat_id: eigen.apparaat_id,
        apparaat_naam: eigen.apparaat_naam,
        last_activity: new Date(nu).toISOString(),
        minuten_geleden: 0,
        actief: true,
        is_eigen: true,
      });
    }
  } catch { /* */ }

  // Eigen eerst, daarna anderen op recentheid
  verrijkt.sort((a, b) => {
    if (a.is_eigen && !b.is_eigen) return -1;
    if (!a.is_eigen && b.is_eigen) return 1;
    return a.minuten_geleden - b.minuten_geleden;
  });
  return NextResponse.json({ apparaten: verrijkt });
}
