import { NextRequest, NextResponse } from 'next/server';
import { getCategorieGebruik } from '@/lib/budgettenPotjes';

export function GET(request: NextRequest) {
  const naam = request.nextUrl.searchParams.get('naam');
  if (!naam) {
    return NextResponse.json({ error: 'naam is verplicht.' }, { status: 400 });
  }
  try {
    return NextResponse.json(getCategorieGebruik(naam));
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
