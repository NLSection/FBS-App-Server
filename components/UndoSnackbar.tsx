// Globale "Ongedaan maken" snackbar — toont rechtsonderin na elke metActie-
// call met een beschrijving. Klik op "Ongedaan maken" → POST naar
// /api/wijziging-log/undo-actie met de actieId. Bij conflict (409) toont
// een korte hint richting het activiteit-overzicht.
//
// Eén tegelijk: een nieuwe actie verdringt de vorige snackbar. Auto-dismiss
// na DUUR_MS, klikbaar weg via X.

'use client';

import { useEffect, useState } from 'react';
import { onActieKlaar, type ActieKlaarEvent } from '@/lib/actie';

const DUUR_MS = 6000;

type Snack = ActieKlaarEvent & { token: number };

export default function UndoSnackbar() {
  const [snack, setSnack] = useState<Snack | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    return onActieKlaar((e) => {
      setSnack({ ...e, token: Date.now() });
      setFout(null);
    });
  }, []);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack((s) => (s?.token === snack.token ? null : s)), DUUR_MS);
    return () => clearTimeout(t);
  }, [snack]);

  if (!snack) return null;

  async function maakOngedaan() {
    if (!snack) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch('/api/wijziging-log/undo-actie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actieId: snack.actieId, forceer: false }),
      });
      if (res.status === 409) {
        setFout('Latere wijziging in de weg — open Backup → Importeer backup voor details.');
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFout((d as { error?: string }).error ?? 'Ongedaan maken mislukt.');
        return;
      }
      setSnack(null);
      window.dispatchEvent(new CustomEvent('fbs:data-changed'));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,0.25)', maxWidth: 480,
      animation: 'snackbar-in 180ms ease-out',
    }}>
      <style>{`@keyframes snackbar-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-h)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {snack.beschrijving}
        </div>
        {fout && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{fout}</div>}
      </div>
      <button onClick={maakOngedaan} disabled={bezig}
        style={{ background: 'none', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: bezig ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
        {bezig ? 'Bezig…' : 'Ongedaan maken'}
      </button>
      <button onClick={() => setSnack(null)} title="Sluiten"
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
        ×
      </button>
    </div>
  );
}
