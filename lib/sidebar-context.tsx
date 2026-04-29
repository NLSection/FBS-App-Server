// FILE: sidebar-context.tsx
// AANGEMAAKT: 29-03-2026 12:00
// VERSIE: 1
// GEWIJZIGD: 29-03-2026 12:00
//
// WIJZIGINGEN (29-03-2026 12:00):
// - Initiële aanmaak: gedeelde sidebar-staat (collapsed) en tableRequiredWidth voor auto-collapse

'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type SidebarCtx = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  tableRequiredWidth: number;
  setTableRequiredWidth: (w: number) => void;
};

const SidebarContext = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tableRequiredWidth, setTableRequiredWidth] = useState(0);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, tableRequiredWidth, setTableRequiredWidth }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar: geen SidebarProvider gevonden');
  return ctx;
}
