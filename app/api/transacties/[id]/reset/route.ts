// FILE: route.ts (api/transacties/[id]/reset)
// AANGEMAAKT: 16-04-2026
// Wist handmatige categorisatie en hermatcht de transactie via categorieen-regels.

import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { matchCategorie, categoriseerOmboeking } from '@/lib/categorisatie';
import { getInstellingen } from '@/lib/instellingen';
import { metWijziging } from '@/lib/wijziging';
import type { Transactie } from '@/lib/schema';
import type { CategorieRegel } from '@/lib/categorisatie';

type Params = Promise<{ id: string }>;

interface CategorieResultaat {
  via: 'regel' | 'omboeking' | 'geen';
  categorie: string | null;
  subcategorie: string | null;
  regelId?: number;
  toelichting?: string | null;
}

function berekenCategorie(
  transactie: Transactie,
  regels: CategorieRegel[],
  budgettenPotjes: { naam: string }[],
  omboekingenAuto: boolean,
  isUitzondering: boolean,
): CategorieResultaat {
  const match = matchCategorie(transactie, regels);
  if (match) return { via: 'regel', categorie: match.categorie, subcategorie: match.subcategorie ?? null, regelId: match.id, toelichting: match.toelichting ?? null };

  if (transactie.type === 'omboeking-af' || transactie.type === 'omboeking-bij') {
    const behandelAlsOmboeking = omboekingenAuto ? !isUitzondering : isUitzondering;
    if (behandelAlsOmboeking) {
      const omb = categoriseerOmboeking(transactie, budgettenPotjes);
      return { via: 'omboeking', categorie: omb.categorie, subcategorie: omb.subcategorie ?? null };
    }
  }

  return { via: 'geen', categorie: null, subcategorie: null };
}

function laadContext(transactie: Transactie) {
  const db = getDb();
  const regels          = db.prepare('SELECT * FROM categorieen').all() as CategorieRegel[];
  const budgettenPotjes = db.prepare('SELECT naam FROM budgetten_potjes').all() as { naam: string }[];
  const instelling      = getInstellingen();
  const omboekingenAuto = instelling.omboekingenAuto;
  const uitzonderingen  = db.prepare('SELECT rekening_a_id, rekening_b_id FROM omboeking_uitzonderingen').all() as { rekening_a_id: number; rekening_b_id: number }[];
  const rekeningenRijen = db.prepare('SELECT id, iban FROM rekeningen').all() as { id: number; iban: string }[];
  const ibanNaarId      = new Map<string, number>(rekeningenRijen.map(r => [r.iban, r.id]));
  const vanId  = ibanNaarId.get(transactie.iban_bban ?? '');
  const naarId = ibanNaarId.get(transactie.tegenrekening_iban_bban ?? '');
  const isUitzondering = vanId && naarId
    ? uitzonderingen.some(u => {
        const a = Math.min(vanId, naarId); const b = Math.max(vanId, naarId);
        return u.rekening_a_id === a && u.rekening_b_id === b;
      })
    : false;
  return { regels, budgettenPotjes, omboekingenAuto, isUitzondering };
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  try {
    const db = getDb();
    const transactie = db.prepare('SELECT * FROM transacties WHERE id = ?').get(numId) as Transactie | undefined;
    if (!transactie) return NextResponse.json({ error: 'Transactie niet gevonden.' }, { status: 404 });

    const { regels, budgettenPotjes, omboekingenAuto, isUitzondering } = laadContext(transactie);
    const { categorie, subcategorie } = berekenCategorie(transactie, regels, budgettenPotjes, omboekingenAuto, isUitzondering);
    return NextResponse.json({ categorie, subcategorie });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Ongeldig id.' }, { status: 400 });

  const db = getDb();
  const transactie = db.prepare('SELECT * FROM transacties WHERE id = ?').get(numId) as Transactie | undefined;
  if (!transactie) return NextResponse.json({ error: 'Transactie niet gevonden.' }, { status: 404 });

  const bedragStr = `€ ${(transactie.bedrag ?? 0).toFixed(2).replace('.', ',')}`;
  return metWijziging(
    { type: 'transactie', beschrijving: `Transactie gereset (auto-match): ${bedragStr} ${transactie.naam_tegenpartij ?? '(onbekend)'} ${transactie.datum ?? ''}` },
    () => {
      try {
        const { regels, budgettenPotjes, omboekingenAuto, isUitzondering } = laadContext(transactie);
        const resultaat = berekenCategorie(transactie, regels, budgettenPotjes, omboekingenAuto, isUitzondering);

        db.prepare('INSERT OR IGNORE INTO transactie_aanpassingen (transactie_id) VALUES (?)').run(numId);

        if (resultaat.via === 'regel') {
          db.prepare('UPDATE transactie_aanpassingen SET categorie_id = ?, categorie = NULL, subcategorie = NULL, handmatig_gecategoriseerd = 0, bevroren = 0, toelichting = ? WHERE transactie_id = ?')
            .run(resultaat.regelId, resultaat.toelichting ?? null, numId);
          db.prepare("UPDATE categorieen SET laatste_gebruik = date('now') WHERE id = ?").run(resultaat.regelId);
        } else if (resultaat.via === 'omboeking') {
          db.prepare('UPDATE transactie_aanpassingen SET categorie_id = NULL, categorie = ?, subcategorie = ?, handmatig_gecategoriseerd = 0, bevroren = 0, toelichting = NULL WHERE transactie_id = ?')
            .run(resultaat.categorie, resultaat.subcategorie, numId);
        } else {
          db.prepare('UPDATE transactie_aanpassingen SET categorie_id = NULL, categorie = NULL, subcategorie = NULL, handmatig_gecategoriseerd = 0, bevroren = 0, toelichting = NULL WHERE transactie_id = ?')
            .run(numId);
        }
        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout.' }, { status: 500 });
      }
    },
  );
}
