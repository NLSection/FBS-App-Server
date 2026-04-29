// FILE: route.ts
// AANGEMAAKT: 25-03-2026 21:00
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 21:00
//
// WIJZIGINGEN (25-03-2026 21:00):
// - Initiële aanmaak: GET /api/periodes

import { NextResponse } from 'next/server';
import { getAllePeriodes } from '@/lib/maandperiodes';

export function GET() {
  try {
    return NextResponse.json(getAllePeriodes());
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
