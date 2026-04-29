'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Gedeelde lookup-data voor alle instellingen-componenten op één pagina.
// Voorheen haalde elk component (RekeningenBeheer, BudgettenPotjesBeheer, ...)
// dezelfde rekeningen/groepen/budgetten op → 5× dezelfde fetches op mount.
// Nu: één /api/lookup-data fetch op pagina-niveau; componenten lezen via hook.
// Mutations roepen `refresh()` aan zodat alle abonnees verse data krijgen.

export type LookupData = {
  budgettenPotjes: unknown[];
  rekeningen: unknown[];
  rekeningGroepen: unknown[];
  transactieTabs: unknown[];
  uniekeCategorieen: string[];
  subcategorieen: unknown[];
};

type Ctx = {
  data: LookupData | null;
  laden: boolean;
  refresh: () => void;
};

const LookupCtx = createContext<Ctx | null>(null);

export function LookupProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LookupData | null>(null);
  const [laden, setLaden] = useState(true);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let actief = true;
    setLaden(true);
    fetch('/api/lookup-data')
      .then(r => r.ok ? r.json() : null)
      .then((d: LookupData | null) => { if (actief) setData(d); })
      .catch(() => {})
      .finally(() => { if (actief) setLaden(false); });
    return () => { actief = false; };
  }, [trigger]);

  const refresh = useCallback(() => setTrigger(t => t + 1), []);

  return <LookupCtx.Provider value={{ data, laden, refresh }}>{children}</LookupCtx.Provider>;
}

export function useLookupData(): Ctx {
  const ctx = useContext(LookupCtx);
  if (!ctx) {
    // Buiten provider: lege fallback zodat losstaande componenten niet crashen.
    return { data: null, laden: false, refresh: () => {} };
  }
  return ctx;
}
