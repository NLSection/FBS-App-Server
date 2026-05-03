// FILE: page.tsx
// AANGEMAAKT: 25-03-2026 11:30
// VERSIE: 1
// GEWIJZIGD: 29-03-2026 15:00
//
// WIJZIGINGEN (28-03-2026 00:00):
// - VasteLastenConfigBeheer verwijderd uit pagina
// WIJZIGINGEN (29-03-2026 15:00):
// - BackupRestore sectie toegevoegd

import MiniTourKnop from '@/components/MiniTourKnop';
import AlgemeneInstellingen from '@/features/instellingen/components/AlgemeneInstellingen';
import WeergaveInstellingen from '@/features/instellingen/components/WeergaveInstellingen';
import DashboardInstellingen from '@/features/instellingen/components/DashboardInstellingen';
import TransactiesTabsBeheer from '@/features/instellingen/components/TransactiesTabsBeheer';
import RekeningenBeheer from '@/features/instellingen/components/RekeningenBeheer';
import RekeningGroepenBeheer from '@/features/instellingen/components/RekeningGroepenBeheer';
import BudgettenPotjesBeheer from '@/features/instellingen/components/BudgettenPotjesBeheer';
import VastePostenInstellingen from '@/features/instellingen/components/VastePostenInstellingen';
import BackupRestore from '@/features/instellingen/components/BackupRestore';
import DeveloperOpties from '@/features/instellingen/components/DeveloperOpties';
import PaginaHulpmiddelen from '@/features/instellingen/components/PaginaHulpmiddelen';
import UpdateKanaalInstelling from '@/features/instellingen/components/UpdateKanaalInstelling';
import DatabaseLocatieInstelling from '@/features/instellingen/components/DatabaseLocatieInstelling';
import WipBadge from '@/components/WipBadge';
import { LookupProvider } from '@/features/instellingen/hooks/LookupContext';

export default function InstellingenPage() {
  return (
    <LookupProvider>
    <div className="space-y-12 max-w-4xl">
      <h1 className="text-xl font-semibold">Instellingen</h1>
      <AlgemeneInstellingen />
      <WeergaveInstellingen />
      <DashboardInstellingen />
      <section id="transacties-tabs" data-onboarding="inst-transacties">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <p className="section-title" style={{ margin: 0 }}>Transacties instellingen</p>
          <MiniTourKnop tourId="transacties" type="instelling" />
        </div>
        <TransactiesTabsBeheer />
      </section>
      <VastePostenInstellingen />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <p className="section-title" style={{ margin: 0 }}>Rekeningen instellingen</p>
          <MiniTourKnop tourId="rekeningen" type="instelling" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RekeningenBeheer />
          <RekeningGroepenBeheer />
        </div>
      </section>
      <section id="budgetten-potjes"><BudgettenPotjesBeheer /></section>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <p className="section-title" style={{ margin: 0 }}>Hulp & Rondleiding</p>
          <WipBadge tekst="De opties in Hulp & Rondleiding zijn nog in ontwikkeling en kunnen onverwacht gedrag vertonen." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AlgemeneInstellingen sectie="minitour" />
          <PaginaHulpmiddelen />
        </div>
      </section>
      <UpdateKanaalInstelling />
      <DatabaseLocatieInstelling />
      <DeveloperOpties />
      <BackupRestore />
    </div>
    </LookupProvider>
  );
}
