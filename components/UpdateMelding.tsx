'use client';
import { useEffect, useState } from 'react';

interface UpdateInfo {
  huidig: string;
  nieuwste: string;
  updateBeschikbaar: boolean;
  releaseUrl: string;
  changelog?: string;
  kanaal?: 'main' | 'test';
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Lege regel → witruimte
    if (!line.trim()) {
      elements.push(<div key={i} style={{ height: '6px' }} />);
      continue;
    }

    // ## Kop
    const kopMatch = line.match(/^#{1,3}\s+(.+)/);
    if (kopMatch) {
      elements.push(
        <div key={i} style={{ fontWeight: 700, color: '#cdd6f4', fontSize: '13px', marginTop: i > 0 ? '8px' : 0 }}>
          {formatInline(kopMatch[1])}
        </div>
      );
      continue;
    }

    // - of * opsommingsteken
    const lijstMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (lijstMatch) {
      elements.push(
        <div key={i} style={{ paddingLeft: '12px', display: 'flex', gap: '6px' }}>
          <span>•</span>
          <span>{formatInline(lijstMatch[1])}</span>
        </div>
      );
      continue;
    }

    // Gewone tekst
    elements.push(<div key={i}>{formatInline(line)}</div>);
  }

  return elements;
}

function formatInline(text: string): React.ReactNode {
  // **vet** en `code`
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={match.index} style={{ background: '#313244', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function UpdateMelding() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uitgeklapt, setUitgeklapt] = useState(false);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const cacheKey = `fbs-update-check-${process.env.NEXT_PUBLIC_APP_VERSION ?? 'onbekend'}`;

  useEffect(() => {
    // Cache alleen positieve resultaten — anders blijft "geen update" een uur
    // lang actief terwijl er ondertussen een nieuwe release gepubliceerd is.
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (data.updateBeschikbaar && Date.now() - ts < 3600000) {
          setUpdate(data);
          return;
        }
      } catch {}
    }
    fetch('/api/updates/check')
      .then(r => r.json())
      .then((data: UpdateInfo) => {
        if (data.updateBeschikbaar) {
          localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
          setUpdate(data);
        } else {
          localStorage.removeItem(cacheKey);
        }
      })
      .catch(() => {});
  }, []);

  if (!update) return null;

  const isTest = update.kanaal === 'test';

  const handleInstall = async () => {
    if (!isTauri) return;
    setInstalling(true);
    try {
      const tauri = await import('@tauri-apps/api/core');
      await tauri.invoke('install_update', { channel: update.kanaal ?? 'main' });
    } catch (e) {
      console.error('Update mislukt:', e);
      alert('Update fout: ' + String(e));
      setInstalling(false);
    }
  };

  const regels = update.changelog?.split('\n') || [];
  const nietLegeRegels = regels.filter(r => r.trim());
  const heeftMeer = nietLegeRegels.length > 2;
  const previewRegels = regels.slice(0, regels.findIndex((_, i) => {
    const nietLeeg = regels.slice(0, i + 1).filter(r => r.trim());
    return nietLeeg.length > 2;
  }));

  return (
    <div style={{
      background: '#1e1e2e',
      borderBottom: '1px solid #313244',
    }}>
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#cdd6f4', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isTest && (
            <span style={{ background: '#f9e2af', color: '#1e1e2e', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>TEST</span>
          )}
          Nieuwe versie beschikbaar: <strong>{update.nieuwste}</strong>
        </span>
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            background: '#89b4fa',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 14px',
            cursor: installing ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          {installing ? 'Installeren...' : 'Nu installeren'}
        </button>
      </div>
      {nietLegeRegels.length > 0 && (
        <div style={{ padding: '0 20px 10px' }}>
          <div style={{
            color: '#a6adc8',
            fontSize: '12px',
            lineHeight: '1.5',
            ...(uitgeklapt ? { maxHeight: '40vh', overflowY: 'auto' as const } : {}),
          }}>
            {renderMarkdown(uitgeklapt ? regels.join('\n') : previewRegels.join('\n'))}
          </div>
          {heeftMeer && (
            <button
              onClick={() => setUitgeklapt(!uitgeklapt)}
              style={{
                background: 'none',
                border: 'none',
                color: '#89b4fa',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '4px 0 0',
                textDecoration: 'underline',
              }}
            >
              {uitgeklapt ? 'Toon minder' : 'Toon meer'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
