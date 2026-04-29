'use client';

import { useEffect, useState } from 'react';

export default function LoadingScreen({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch('/api/health');
          if (res.ok) {
            if (!cancelled) setReady(true);
            return;
          }
        } catch { /* server nog niet beschikbaar */ }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  if (ready) return <>{children}</>;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#11111b', color: '#cdd6f4',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
    }}>
      <svg width="64" height="64" viewBox="0 0 40 40" fill="none" style={{ marginBottom: 24 }}>
        <defs>
          <linearGradient id="lsGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5c7cfa" />
            <stop offset="100%" stopColor="#9b6ffa" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#lsGrad)" />
        <rect x="8" y="22" width="6" height="10" rx="1.5" fill="white" opacity="0.7" />
        <rect x="17" y="16" width="6" height="16" rx="1.5" fill="white" opacity="0.85" />
        <rect x="26" y="10" width="6" height="22" rx="1.5" fill="white" />
      </svg>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>FBS</div>
      <div style={{ fontSize: 13, color: '#6c7086', marginBottom: 24 }}>Server wordt gestart...</div>
      <div style={{
        width: 32, height: 32, border: '3px solid #313244',
        borderTopColor: '#89b4fa', borderRadius: '50%',
        animation: 'fbs-spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes fbs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
