'use client';

export default function ProfielBeheerBadge() {
  function scroll() {
    document.getElementById('inst-profiel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <button
      type="button"
      onClick={scroll}
      title="Deze instelling wordt beheerd door het actieve gebruikersprofiel. Klik om naar de profielinstellingen te gaan."
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 600,
        color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap',
        lineHeight: 1.8, flexShrink: 0,
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="8" height="6" rx="1.5" />
        <path d="M4 5V3.5a2 2 0 1 1 4 0V5" />
      </svg>
      Beheerd door profiel
    </button>
  );
}
