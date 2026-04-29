// FILE: page.tsx (categorisatie)
// AANGEMAAKT: 25-03-2026 17:30
// VERSIE: 1
// GEWIJZIGD: 31-03-2026 01:30
//
// WIJZIGINGEN (31-03-2026 01:30):
// - Outer tabs en OngecategoriseerdeTabel verwijderd; CategorieenBeheer heeft eigen tabs
// WIJZIGINGEN (28-03-2026 14:00):
// - Tabvolgorde omgedraaid: Regels beheren is nu primaire tab (standaard actief)

import CategorieenBeheer from '@/features/categorisatie/components/CategorieenBeheer';

export default function CategorisatiePage() {
  return (
    <div className="main">
      <div className="page-header">
        <h1>Categorisatie Database</h1>
        <p>Transacties categoriseren en matchregels beheren</p>
      </div>

      <CategorieenBeheer />
    </div>
  );
}
