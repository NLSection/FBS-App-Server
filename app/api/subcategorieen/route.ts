import { NextRequest, NextResponse } from 'next/server';
import { getSubcategorieen, insertSubcategorie } from '@/lib/subcategorieen';
import { metWijziging } from '@/lib/wijziging';

export function GET(request: NextRequest) {
  const categorie = request.nextUrl.searchParams.get('categorie') ?? undefined;
  try {
    const subs = getSubcategorieen(categorie);
    const volledig = request.nextUrl.searchParams.get('volledig') === '1';
    if (categorie && !volledig) return NextResponse.json(subs.map(s => s.naam));
    return NextResponse.json(subs);
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { categorie?: string; naam?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }
  if (!body.categorie?.trim() || !body.naam?.trim()) {
    return NextResponse.json({ error: 'Categorie en naam zijn verplicht.' }, { status: 400 });
  }
  const cat = body.categorie;
  const naam = body.naam;
  return metWijziging(
    { type: 'categorie', beschrijving: `Subcategorie aangemaakt: ${cat} › ${naam}` },
    () => {
      try {
        const id = insertSubcategorie(cat, naam);
        return NextResponse.json({ id }, { status: 201 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}
