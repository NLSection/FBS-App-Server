// FILE: layout.tsx
// AANGEMAAKT: 25-03-2026 10:00
// VERSIE: 1
// GEWIJZIGD: 02-04-2026 10:00
//
// WIJZIGINGEN (25-03-2026 14:00):
// - Database migrations aangeroepen bij app-start
// - Navigatiebalk vervangen door sidebar + main layout
// - Sidebar component geïmporteerd
// WIJZIGINGEN (02-04-2026 10:00):
// - BackupCheck component toegevoegd voor melding bij nieuwere backup

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import BackupCheck from "@/components/BackupCheck";
import UpdateMelding from "@/components/UpdateMelding";
import LoadingScreen from "@/components/LoadingScreen";
import { SidebarProvider } from "@/lib/sidebar-context";
import OnboardingWizard from "@/features/onboarding/components/OnboardingWizard";
import InstellingenModal from "@/components/InstellingenModal";
import UndoSnackbar from "@/components/UndoSnackbar";
import HeartbeatBanner from "@/components/HeartbeatBanner";
import SplitBrainModal from "@/components/SplitBrainModal";
import DagelijksAnker from "@/components/DagelijksAnker";
import DevSpotlightOverlay from "@/components/DevSpotlightOverlay";
import DevPickModus from "@/components/DevPickModus";
import DevTekenModus from "@/components/DevTekenModus";
import DevToolbar from "@/components/DevToolbar";
import ContextMenuToolbar from "@/components/ContextMenuToolbar";
import DevToolbarHotkey from "@/components/DevToolbarHotkey";
import ZoomController from "@/components/ZoomController";
import "./globals.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FBS App",
  description: "Financieel beheer en categorisatie",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <LoadingScreen>
          <SidebarProvider>
            <div className="app">
              <Sidebar />
              <main className="main">
                <HeartbeatBanner />
                <UpdateMelding />
                {children}
              </main>
            </div>
            <BackupCheck />
            <OnboardingWizard />
            {process.env.NODE_ENV === 'development' && <DevSpotlightOverlay />}
            {process.env.NODE_ENV === 'development' && <DevPickModus />}
            {process.env.NODE_ENV === 'development' && <DevTekenModus />}
            {process.env.NODE_ENV === 'development' && <DevToolbar />}
            <ContextMenuToolbar />
            <DevToolbarHotkey />
            <InstellingenModal />
            <UndoSnackbar />
            <SplitBrainModal />
            <DagelijksAnker />
            <ZoomController />
          </SidebarProvider>
        </LoadingScreen>
      </body>
    </html>
  );
}
