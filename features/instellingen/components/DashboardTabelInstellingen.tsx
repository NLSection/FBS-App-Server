'use client';

import { useEffect, useState } from 'react';

function MiniToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 32, height: 18, cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 9, background: checked ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' }} />
      <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </label>
  );
}

interface Props {
  sectie: 'bls' | 'cat';
  tabId?: number;
}

export default function DashboardTabelInstellingen({ sectie, tabId }: Props) {
  const [inst, setInst] = useState({ blsTrxUitgeklapt: false, catUitklappen: true, catTrxUitgeklapt: false });
  const [profiel, setProfiel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/instellingen')
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, unknown> | null) => {
        if (!d) return;
        setProfiel((d.gebruikersProfiel as string) ?? null);
        if (tabId == null) {
          setInst({
            blsTrxUitgeklapt: Boolean(d.blsTrxUitgeklapt),
            catUitklappen:    Boolean(d.catUitklappen),
            catTrxUitgeklapt: Boolean(d.catTrxUitgeklapt),
          });
        }
      })
      .catch(() => {});
    if (tabId != null) {
      fetch('/api/dashboard-tabs')
        .then(r => r.ok ? r.json() : null)
        .then((tabs: Array<{ id: number; bls_trx_uitgeklapt: boolean; cat_uitklappen: boolean; cat_trx_uitgeklapt: boolean }> | null) => {
          if (!tabs) return;
          const tab = tabs.find(t => t.id === tabId);
          if (!tab) return;
          setInst({
            blsTrxUitgeklapt: tab.bls_trx_uitgeklapt,
            catUitklappen:    tab.cat_uitklappen,
            catTrxUitgeklapt: tab.cat_trx_uitgeklapt,
          });
        })
        .catch(() => {});
    }
  }, [tabId]);

  async function slaOp(update: Partial<typeof inst>) {
    const nieuw = { ...inst, ...update };
    setInst(nieuw);
    if (tabId != null) {
      const body: Record<string, boolean> = {};
      if ('blsTrxUitgeklapt' in update) body.bls_trx_uitgeklapt = update.blsTrxUitgeklapt!;
      if ('catUitklappen'    in update) body.cat_uitklappen      = update.catUitklappen!;
      if ('catTrxUitgeklapt' in update) body.cat_trx_uitgeklapt  = update.catTrxUitgeklapt!;
      await fetch(`/api/dashboard-tabs/${tabId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      window.dispatchEvent(new CustomEvent('dash-inst-applied', { detail: { ...update, tabId } }));
    } else {
      await fetch('/api/instellingen', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      window.dispatchEvent(new CustomEvent('dash-inst-applied', { detail: update }));
    }
  }

  const profielBeheer = profiel === 'potjesbeheer' || profiel === 'uitgavenbeheer';

  function verbergTabel() {
    if (profielBeheer) return;
    window.dispatchEvent(new CustomEvent('dash-verberg-sectie', { detail: { sectie } }));
  }

  const rij = (label: string, key: keyof typeof inst) => (
    <div key={key}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'default', transition: 'background 80ms, border-color 80ms' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-h)' }}>{label}</span>
      <MiniToggle checked={inst[key]} onChange={v => slaOp({ [key]: v })} />
    </div>
  );

  const verbergKnop = (
    <button
      type="button"
      onClick={verbergTabel}
      disabled={profielBeheer}
      title={profielBeheer ? 'Niet beschikbaar bij een ingesteld gebruikersprofiel' : undefined}
      style={{
        marginTop: 4, width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, cursor: profielBeheer ? 'not-allowed' : 'pointer',
        color: profielBeheer ? 'var(--text-dim)' : 'var(--red)',
        fontSize: 12, padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', opacity: profielBeheer ? 0.5 : 1,
        transition: 'background 80ms, border-color 80ms',
      }}
      onMouseEnter={e => { if (!profielBeheer) { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent)'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        Verberg deze tabel op het actieve tabblad
      </span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>›</span>
    </button>
  );

  if (sectie === 'bls') {
    return <div>{rij('Transacties standaard uitklappen', 'blsTrxUitgeklapt')}{verbergKnop}</div>;
  }
  return (
    <div>
      {rij('Categorieën standaard uitklappen', 'catUitklappen')}
      {rij('Transacties standaard uitklappen', 'catTrxUitgeklapt')}
      {verbergKnop}
    </div>
  );
}
