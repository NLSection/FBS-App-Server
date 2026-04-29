import { NextRequest, NextResponse } from 'next/server';
import { getSubcategorieGebruik } from '@/lib/subcategorieen';

export function GET(request: NextRequest) {
  const categorie = request.nextUrl.searchParams.get('categorie');
  const subcategorie = request.nextUrl.searchParams.get('subcategorie');
  if (!categorie || !subcategorie) {
    return NextResponse.json({ error: 'categorie en subcategorie zijn verplicht.' }, { status: 400 });
  }
  try {
    const aantal = getSubcategorieGebruik(categorie, subcategorie);
    return NextResponse.json({ aantal });
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}
