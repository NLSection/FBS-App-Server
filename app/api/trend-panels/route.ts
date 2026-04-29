import { NextRequest, NextResponse } from 'next/server';
import { getAllPanels, createPanel, updateVolgorde, updateGridLayout, type PanelInput, type GridLayoutItem } from '@/lib/trendPanels';
import { metWijziging } from '@/lib/wijziging';

export function GET() {
  try {
    const panels = getAllPanels();
    return NextResponse.json(panels);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Databasefout.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { volgorde?: unknown; layout?: unknown; titel?: unknown } & Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 }); }

  if (body.volgorde && Array.isArray(body.volgorde)) {
    const volgorde = body.volgorde as number[];
    return metWijziging(
      { type: 'trend', beschrijving: 'Trend-panelen volgorde aangepast' },
      () => {
        try {
          updateVolgorde(volgorde);
          return NextResponse.json({ ok: true });
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
        }
      },
    );
  }

  if (body.layout && Array.isArray(body.layout)) {
    const layout = body.layout as GridLayoutItem[];
    return metWijziging(
      { type: 'trend', beschrijving: 'Trend-panelen grid-layout aangepast' },
      () => {
        try {
          updateGridLayout(layout);
          return NextResponse.json({ ok: true });
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
        }
      },
    );
  }

  if (!body.titel) {
    return NextResponse.json({ error: 'Titel is verplicht.' }, { status: 400 });
  }
  const titel = String(body.titel);

  return metWijziging(
    { type: 'trend', beschrijving: `Trend-paneel aangemaakt: ${titel}` },
    () => {
      try {
        const panel = createPanel(body as PanelInput);
        return NextResponse.json(panel, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Databasefout.' }, { status: 500 });
      }
    },
  );
}
