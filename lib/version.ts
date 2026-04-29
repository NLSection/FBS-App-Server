// FILE: version.ts
// AANGEMAAKT: 05-04-2026 01:00
// VERSIE: 1
// GEWIJZIGD: 05-04-2026 01:00
//
// WIJZIGINGEN (05-04-2026 01:00):
// - Initieel: APP_VERSION uit env variabele

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "onbekend";
