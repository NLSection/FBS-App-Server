import { NextRequest, NextResponse } from 'next/server';
import { getPanel, updatePanel, deletePanel, duplicatePanel } from '@/lib/trendPanels';
import { metWijziging } from '@/lib/wijziging';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const panel = getPanel(parseInt(id));
    if (!panel) return NextResponse.json({ error: 'Panel niet gevonden.' }, { status: 404 });
    return NextResponse.json(panel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }

  return metWijziging(
    { type: 'trend', beschrijving: `Trend-paneel bijgewerkt (#${id})` },
    () => {
      try {
        const panel = updatePanel(parseInt(id), body);
        if (!panel) return NextResponse.json({ error: 'Panel niet gevonden.' }, { status: 404 });
        return NextResponse.json(panel);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metWijziging(
    { type: 'trend', beschrijving: `Trend-paneel verwijderd (#${id})` },
    () => {
      try {
        const ok = deletePanel(parseInt(id));
        if (!ok) return NextResponse.json({ error: 'Panel niet gevonden.' }, { status: 404 });
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { actie?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }
  if (body.actie !== 'dupliceer') {
    return NextResponse.json({ error: 'Onbekende actie.' }, { status: 400 });
  }
  return metWijziging(
    { type: 'trend', beschrijving: `Trend-paneel gedupliceerd (bron #${id})` },
    () => {
      try {
        const panel = duplicatePanel(parseInt(id));
        if (!panel) return NextResponse.json({ error: 'Panel niet gevonden.' }, { status: 404 });
        return NextResponse.json(panel, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
