import { NextRequest, NextResponse } from 'next/server';
import { deleteBudgetPotje, getBudgetPotje, updateBudgetPotje } from '@/lib/budgettenPotjes';
import { metWijziging } from '@/lib/wijziging';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  let body: { naam?: string; rekening_ids?: number[]; kleur?: string | null; kleur_auto?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const huidig = getBudgetPotje(numId);
  const delen = [
    typeof body.naam === 'string' && body.naam && body.naam !== huidig?.naam ? `naam: ${huidig?.naam} → ${body.naam}` : null,
    body.rekening_ids ? `${body.rekening_ids.length} rekening${body.rekening_ids.length === 1 ? '' : 'en'} gekoppeld` : null,
    'kleur' in body ? 'kleur gewijzigd' : null,
  ].filter(Boolean);

  return metWijziging(
    { type: 'budget-potje', beschrijving: `Categorie bijgewerkt: ${huidig?.naam ?? `#${numId}`}${delen.length ? ' (' + delen.join(', ') + ')' : ''}` },
    () => {
      try {
        updateBudgetPotje(
          numId,
          body.naam ?? huidig?.naam ?? null,
          body.rekening_ids ?? huidig?.rekening_ids ?? [],
          'kleur' in body ? (body.kleur ?? null) : (huidig?.kleur ?? null),
          'kleur_auto' in body ? body.kleur_auto : huidig?.kleur_auto,
        );
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 400 });
      }
    },
  );
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });
  }
  const oud = getBudgetPotje(numId);
  return metWijziging(
    { type: 'budget-potje', beschrijving: `Categorie verwijderd: ${oud?.naam ?? `#${numId}`}` },
    () => {
      try {
        deleteBudgetPotje(numId);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        const code = (err as { code?: string }).code;
        if (code === 'IN_USE') {
          const gebruik = (err as { gebruik?: { regels: number; aanpassingen: number; subcategorieen: number } }).gebruik;
          return NextResponse.json({ error: bericht, gebruik }, { status: 409 });
        }
        const status = bericht.includes('beschermd') ? 403 : 500;
        return NextResponse.json({ error: bericht }, { status });
      }
    },
  );
}
