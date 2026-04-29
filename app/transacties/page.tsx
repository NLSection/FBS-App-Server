// FILE: page.tsx
// AANGEMAAKT: 25-03-2026 12:00
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 12:00
//
// WIJZIGINGEN (25-03-2026 12:00):
// - Initiële aanmaak: transactieoverzicht pagina

import TransactiesTabel from '@/features/transacties/components/TransactiesTabel';

export default function TransactiesPage() {
  return (
    <div className="main">
      <div data-onboarding="page-header-transacties" className="page-header" style={{ maxWidth: 1600, margin: '0 auto 28px' }}>
        <h1>Transacties</h1>
        <p>Bekijk en beheer alle geïmporteerde transacties</p>
      </div>
      <TransactiesTabel />
    </div>
  );
}
