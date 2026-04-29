// FILE: DashboardInstellingen.tsx
// AANGEMAAKT: 03-04-2026 10:00
// VERSIE: 3
// GEWIJZIGD: 14-04-2026
//
// WIJZIGINGEN (14-04-2026):
// - Globale BLS/CAT instellingskaarten verwijderd — instellingen zijn nu per tabblad in DashboardTabsBeheer
// - Compact/sectie props en bijbehorende logica verwijderd

'use client';

import MiniTourKnop from '@/components/MiniTourKnop';
import DashboardTabsBeheer from './DashboardTabsBeheer';

export default function DashboardInstellingen() {
  return (
    <section id="dashboard" data-onboarding="inst-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Dashboard instellingen</p>
        <MiniTourKnop tourId="dashboard" type="instelling" />
      </div>
      <DashboardTabsBeheer />
    </section>
  );
}
