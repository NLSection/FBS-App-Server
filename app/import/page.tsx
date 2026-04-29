// FILE: page.tsx
// AANGEMAAKT: 25-03-2026 11:00
// VERSIE: 1
// GEWIJZIGD: 03-04-2026 02:00
//
// WIJZIGINGEN (03-04-2026 02:00):
// - Page header en layout passend bij rest van app
// WIJZIGINGEN (25-03-2026 11:00):
// - Initiële aanmaak: importpagina die ImportForm rendert

import ImportForm from "@/features/import/components/ImportForm";
import DatabeheerSectie from "@/features/import/components/DatabeheerSectie";

export default function ImportPage() {
  return (
    <>
      <div className="page-header">
        <h1>Importeer CSV</h1>
        <p>Sleep bestanden in de dropzone of klik om te bladeren</p>
      </div>
      <ImportForm />
      <DatabeheerSectie />
    </>
  );
}
