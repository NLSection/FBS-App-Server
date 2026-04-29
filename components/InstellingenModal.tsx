'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import AlgemeneInstellingen from '@/features/instellingen/components/AlgemeneInstellingen';
import VastePostenInstellingen from '@/features/instellingen/components/VastePostenInstellingen';
import DashboardTabelInstellingen from '@/features/instellingen/components/DashboardTabelInstellingen';

// ── Sectie registry ────────────────────────────────────────────────────────────

const SECTIES: Record<string, { titel: string; render: () => React.ReactNode }> = {
  startdag: {
    titel: 'Startdag financiële periode',
    render: () => <AlgemeneInstellingen compact sectie="startdag" />,
  },
  minitour: {
    titel: 'Hulp & Rondleiding',
    render: () => <AlgemeneInstellingen compact sectie="minitour" />,
  },
  'vaste-posten': {
    titel: 'Vaste Posten',
    render: () => <VastePostenInstellingen compact />,
  },
  'dashboard-bls': {
    titel: 'Balans Budgetten en Potjes — instellingen',
    render: () => <DashboardTabelInstellingen sectie="bls" />,
  },
  'dashboard-cat': {
    titel: 'Overzicht per Categorie — instellingen',
    render: () => <DashboardTabelInstellingen sectie="cat" />,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function InstellingenModal() {
  const [modalSectie, setModalSectie]       = useState<string | null>(null);
  const [popover, setPopover]               = useState<{ x: number; y: number; sectieId: string; tabId?: number } | null>(null);
  const [popoverZichtbaar, setPopoverZichtbaar] = useState(false);
  const popoverRef                          = useRef<HTMLDivElement>(null);

  // Events
  useEffect(() => {
    function onModal(e: Event) {
      setModalSectie((e as CustomEvent<{ sectieId: string }>).detail.sectieId);
    }
    function onMenu(e: Event) {
      const { sectieId, x, y, tabId } = (e as CustomEvent<{ sectieId: string; x: number; y: number; tabId?: number }>).detail;
      setPopoverZichtbaar(false);
      setPopover({ sectieId, x, y, tabId });
    }
    function onVerberg() { setPopover(null); }
    window.addEventListener('preview-modal', onModal);
    window.addEventListener('preview-menu', onMenu);
    window.addEventListener('dash-verberg-sectie', onVerberg);
    return () => {
      window.removeEventListener('preview-modal', onModal);
      window.removeEventListener('preview-menu', onMenu);
      window.removeEventListener('dash-verberg-sectie', onVerberg);
    };
  }, []);

  // Klamp popover binnen viewport, dan tonen
  useEffect(() => {
    if (!popover || !popoverRef.current) return;
    const { width, height } = popoverRef.current.getBoundingClientRect();
    const margin = 8;
    const x = Math.min(popover.x, window.innerWidth  - width  - margin);
    const y = Math.min(popover.y, window.innerHeight - height - margin);
    if (x !== popover.x || y !== popover.y) setPopover(prev => prev ? { ...prev, x, y } : null);
    setPopoverZichtbaar(true);
  }, [popover]);

  // Sluit bij klik buiten of Escape
  useEffect(() => {
    if (!popover) return;
    function onClose(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPopover(null); }
    document.addEventListener('mousedown', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [popover]);

  const modalSectieData  = modalSectie ? SECTIES[modalSectie] : null;
  const popoverSectieData = popover ? SECTIES[popover.sectieId] : null;

  function renderPopoverInhoud() {
    if (!popover) return null;
    if (popover.sectieId === 'dashboard-bls') return <DashboardTabelInstellingen sectie="bls" tabId={popover.tabId} />;
    if (popover.sectieId === 'dashboard-cat') return <DashboardTabelInstellingen sectie="cat" tabId={popover.tabId} />;
    return popoverSectieData?.render() ?? null;
  }

  return (
    <>
      {/* Modal */}
      {modalSectieData && (
        <Modal open={!!modalSectie} onClose={() => setModalSectie(null)} title={modalSectieData.titel} breedte={560}>
          {modalSectieData.render()}
        </Modal>
      )}

      {/* Popover */}
      {popover && (popoverSectieData || popover.sectieId === 'dashboard-bls' || popover.sectieId === 'dashboard-cat') && (
        <>
        <style>{`@keyframes inst-popover-in { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popover.y,
            left: popover.x,
            zIndex: 9000,
            visibility: popoverZichtbaar ? 'visible' : 'hidden',
            width: 420,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
            overflow: 'hidden',
            animation: 'inst-popover-in 120ms ease',
          }}
        >
          {/* Kop */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'var(--accent-dim)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>
              {popoverSectieData?.titel ?? SECTIES[popover.sectieId]?.titel ?? ''}
            </span>
            <button
              type="button"
              onClick={() => setPopover(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
            >✕</button>
          </div>
          {/* Content */}
          <div style={{ padding: 16 }}>
            {renderPopoverInhoud()}
          </div>
        </div>
        </>
      )}
    </>
  );
}
