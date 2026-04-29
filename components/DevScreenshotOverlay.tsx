'use client';

import { useEffect, useRef, useState } from 'react';

interface Rect { x: number; y: number; w: number; h: number; }

export default function DevScreenshotOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [fase, setFase] = useState<'slepen' | 'bezig' | 'preview'>('slepen');
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bestaandePngs, setBestaandePngs] = useState<string[]>([]);
  const [cacheBuster, setCacheBuster] = useState(0);
  const rectRef = useRef<Rect | null>(null);
  const faseRef = useRef<'slepen' | 'bezig' | 'preview'>('slepen');
  const setFaseAan = (v: 'slepen' | 'bezig' | 'preview') => { faseRef.current = v; setFase(v); };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setStartPos(null); setRect(null); setFaseAan('slepen'); setPreview(null); setFout(null);
      rectRef.current = null;
      return;
    }
    setFilename(`screenshot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`);
    fetch('/api/dev/screenshot')
      .then(r => r.ok ? r.json() : [])
      .then((lijst: { naam: string }[]) => setBestaandePngs(Array.isArray(lijst) ? lijst.map(b => b.naam) : []))
      .catch(() => setBestaandePngs([]));
    setCacheBuster(Date.now());
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function onMouseDown(e: React.MouseEvent) {
    if (faseRef.current !== 'slepen') return;
    setStartPos({ x: e.clientX, y: e.clientY });
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  }
  function onMouseMove(e: React.MouseEvent) {
    if (faseRef.current !== 'slepen' || !startPos) return;
    const x = Math.min(startPos.x, e.clientX);
    const y = Math.min(startPos.y, e.clientY);
    const w = Math.abs(e.clientX - startPos.x);
    const h = Math.abs(e.clientY - startPos.y);
    const r = { x, y, w, h };
    setRect(r);
    rectRef.current = r;
  }
  async function onMouseUp() {
    if (faseRef.current !== 'slepen' || !rectRef.current) return;
    const r = rectRef.current;
    if (r.w < 10 || r.h < 10) { setStartPos(null); setRect(null); return; }
    setFaseAan('bezig');
    setStartPos(null);
    try {
      const blob = await capture(r);
      setPreview(URL.createObjectURL(blob));
      setFaseAan('preview');
    } catch (err) {
      console.error('[dev-screenshot] capture mislukt:', err);
      setFout(err instanceof Error ? `${err.message}` : 'Onbekende fout');
      setFaseAan('slepen');
      setRect(null);
    }
  }

  async function capture(r: Rect): Promise<Blob> {
    // Verberg overlay + alle dev-toolbars zodat ze niet in de capture zitten
    const ov = document.getElementById('dev-screenshot-overlay');
    if (ov) ov.style.display = 'none';
    const toolbars = [...document.querySelectorAll<HTMLElement>('[data-dev-toolbar]')];
    const oudeDisplay = toolbars.map(t => t.style.display);
    toolbars.forEach(t => { t.style.display = 'none'; });
    try {
      const { domToBlob } = await import('modern-screenshot');
      await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
      // modern-screenshot captureert het hele element. We maken hele body screenshot,
      // dan croppen we naar de rechthoek via een intermediaire canvas.
      const dpr = window.devicePixelRatio || 1;
      const fullBlob = await domToBlob(document.body, {
        scale: dpr,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#000',
      });
      if (!fullBlob) throw new Error('Capture leeg');
      // Crop naar rechthoek
      const bitmap = await createImageBitmap(fullBlob);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(r.w * dpr);
      canvas.height = Math.round(r.h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Geen canvas context');
      ctx.drawImage(bitmap, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Crop-blob leeg');
      return blob;
    } finally {
      if (ov) ov.style.display = '';
      toolbars.forEach((t, i) => { t.style.display = oudeDisplay[i]; });
    }
  }

  async function opslaan() {
    if (!preview || !filename || opslaanBezig) return;
    setOpslaanBezig(true);
    setFout(null);
    try {
      const resp = await fetch(preview);
      const blob = await resp.blob();
      const buf = await blob.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
      const naam = filename.endsWith('.png') ? filename : filename + '.png';
      const res = await fetch('/api/dev/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: naam, dataBase64: b64 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Opslaan mislukt');
      }
      onClose();
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setOpslaanBezig(false);
    }
  }

  return (
    <div
      id="dev-screenshot-overlay"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        position: 'fixed', inset: 0, zIndex: 10100,
        background: fase === 'preview' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.25)',
        cursor: fase === 'slepen' ? 'crosshair' : 'default',
        userSelect: 'none',
      }}
    >
      {fase === 'slepen' && (
        <>
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text-h)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', maxWidth: 600 }}>
            Sleep een kader over het gebied dat je wil screenshotten. <span style={{ color: 'var(--text-dim)' }}>Esc om te annuleren.</span>
            {fout && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>Fout: {fout}</div>}
          </div>
          {rect && rect.w > 0 && (
            <div style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '2px solid var(--accent)', background: 'rgba(92,124,250,0.1)', pointerEvents: 'none' }} />
          )}
        </>
      )}

      {fase === 'bezig' && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 28px', fontSize: 13, color: 'var(--text-h)' }}>
          Screenshot maken…
        </div>
      )}

      {fase === 'preview' && preview && (
        <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, minWidth: 420, maxWidth: '80vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-h)', flexShrink: 0 }}>Screenshot opslaan in public/</p>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: '40vh', border: '1px solid var(--border)', borderRadius: 6, objectFit: 'contain' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Bestandsnaam:</label>
            <input type="text" value={filename} onChange={e => setFilename(e.target.value)} style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-h)', outline: 'none' }} />
          </div>
          {bestaandePngs.length > 0 && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Of klik op een bestaand bestand om te overschrijven:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, maxHeight: 360, overflowY: 'auto', padding: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6 }}>
                {bestaandePngs.map(n => {
                  const geselecteerd = filename === n;
                  return (
                    <button key={n} type="button" onClick={() => setFilename(n)} style={{
                      display: 'flex', flexDirection: 'column', gap: 6, padding: 6,
                      background: geselecteerd ? 'var(--accent-dim)' : 'transparent',
                      border: `2px solid ${geselecteerd ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, cursor: 'pointer', outline: 'none',
                    }}>
                      <img src={`/${n}?_=${cacheBuster}`} alt={n} style={{ width: '100%', height: 130, objectFit: 'contain', background: 'var(--bg-card)', borderRadius: 4 }} />
                      <span style={{ fontSize: 11, color: geselecteerd ? 'var(--accent)' : 'var(--text-dim)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: geselecteerd ? 600 : 400 }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {bestaandePngs.includes(filename) && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>
              Waarschuwing: bestaand bestand <strong>{filename}</strong> wordt overschreven.
            </p>
          )}
          {fout && <p style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{fout}</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text-dim)' }}>Annuleren</button>
            <button type="button" onClick={opslaan} disabled={opslaanBezig} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: opslaanBezig ? 'wait' : 'pointer', color: '#fff' }}>
              {opslaanBezig ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
