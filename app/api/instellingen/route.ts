import { NextRequest, NextResponse } from 'next/server';
import { getInstellingen, updateInstellingen } from '@/lib/instellingen';
import { metWijziging } from '@/lib/wijziging';
import { categoriseerTransacties } from '@/lib/categorisatie';

export function GET() {
  try {
    return NextResponse.json(getInstellingen());
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Kon instellingen niet laden.';
    return NextResponse.json({ error: bericht }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Ongeldig JSON.' }, { status: 400 });
  }

  const update: Parameters<typeof updateInstellingen>[0] = {};
  if (body.maandStartDag          !== undefined) update.maandStartDag          = body.maandStartDag          as number;
  if (body.dashboardBlsTonen      !== undefined) update.dashboardBlsTonen      = Boolean(body.dashboardBlsTonen);
  if (body.dashboardCatTonen      !== undefined) update.dashboardCatTonen      = Boolean(body.dashboardCatTonen);
  if (body.catUitklappen          !== undefined) update.catUitklappen          = Boolean(body.catUitklappen);
  if (body.blsTrxUitgeklapt       !== undefined) update.blsTrxUitgeklapt       = Boolean(body.blsTrxUitgeklapt);
  if (body.catTrxUitgeklapt       !== undefined) update.catTrxUitgeklapt       = Boolean(body.catTrxUitgeklapt);
  if (body.vastePostenOverzicht !== undefined) update.vastePostenOverzicht = String(body.vastePostenOverzicht);
  if (body.vastePostenAfwijkingProcent !== undefined) update.vastePostenAfwijkingProcent = Number(body.vastePostenAfwijkingProcent);
  if (body.vastePostenVergelijk !== undefined) update.vastePostenVergelijk = String(body.vastePostenVergelijk);
  if (body.vastePostenNieuwDrempel !== undefined) update.vastePostenNieuwDrempel = String(body.vastePostenNieuwDrempel);
  if (body.vastePostenSubtabelPeriode !== undefined) update.vastePostenSubtabelPeriode = String(body.vastePostenSubtabelPeriode);
  if (body.vastePostenVerbergDrempel !== undefined) update.vastePostenVerbergDrempel = String(body.vastePostenVerbergDrempel);
  if (body.vastePostenBuffer          !== undefined) update.vastePostenBuffer          = Number(body.vastePostenBuffer);
  if (body.apparaatNaam         !== undefined) update.apparaatNaam         = body.apparaatNaam as string | null;
  if (body.backupBewaarDagen    !== undefined) update.backupBewaarDagen    = Number(body.backupBewaarDagen);
  if (body.backupExternPad      !== undefined) update.backupExternPad      = body.backupExternPad as string | null;
  if (body.backupExternInterval !== undefined) update.backupExternInterval = Number(body.backupExternInterval);
  if (body.omboekingenAuto      !== undefined) update.omboekingenAuto      = Boolean(body.omboekingenAuto);
  if (body.gebruikersProfiel    !== undefined) update.gebruikersProfiel    = (['potjesbeheer', 'uitgavenbeheer', 'handmatig'].includes(body.gebruikersProfiel as string) ? body.gebruikersProfiel as 'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' : null);
  if (body.updateKanaal         !== undefined) update.updateKanaal         = body.updateKanaal === 'test' ? 'test' : body.updateKanaal === 'uit' ? 'uit' : 'main';
  if (body.trendsGridCols       !== undefined) update.trendsGridCols       = Number(body.trendsGridCols);
  if (body.trendsGridSpacing    !== undefined) update.trendsGridSpacing    = Number(body.trendsGridSpacing);
  if (body.onboardingVoltooid   !== undefined) update.onboardingVoltooid   = Boolean(body.onboardingVoltooid);
  if (body.regelAutoArchiveerMaanden !== undefined) update.regelAutoArchiveerMaanden = Number(body.regelAutoArchiveerMaanden);
  if (body.aangepastAutoArchiveerMaanden !== undefined) update.aangepastAutoArchiveerMaanden = Number(body.aangepastAutoArchiveerMaanden);
  if (body.transactieKolommen !== undefined) update.transactieKolommen = body.transactieKolommen === null ? null : (Array.isArray(body.transactieKolommen) ? (body.transactieKolommen as unknown[]).map(String) : null);
  if (body.helpModus !== undefined) update.helpModus = Boolean(body.helpModus);
  if (body.uiZoom !== undefined) update.uiZoom = Number(body.uiZoom);

  // Bouw beschrijving vóór de write zodat metWijziging hem aan de log-entries
  // kan koppelen. Vergelijk met huidige staat om alleen daadwerkelijke
  // wijzigingen te tonen.
  const vorige = getInstellingen() as unknown as Record<string, unknown>;
  const LABELS: Record<string, string> = {
    maandStartDag: 'Maand start-dag', dashboardBlsTonen: 'Dashboard: BLS tonen',
    dashboardCatTonen: 'Dashboard: Categorie-tabel tonen', catUitklappen: 'Dashboard: Categorie uitklappen',
    blsTrxUitgeklapt: 'Dashboard: BLS transacties uitgeklapt', catTrxUitgeklapt: 'Dashboard: Cat transacties uitgeklapt',
    vastePostenOverzicht: 'Vaste Posten: overzicht periode', vastePostenAfwijkingProcent: 'Vaste Posten: afwijking %',
    vastePostenVergelijk: 'Vaste Posten: vergelijkperiode', vastePostenNieuwDrempel: 'Vaste Posten: nieuw-drempel',
    vastePostenSubtabelPeriode: 'Vaste Posten: subtabel periode', vastePostenVerbergDrempel: 'Vaste Posten: verberg-drempel',
    vastePostenBuffer: 'Vaste Posten: buffer', backupBewaarDagen: 'Backup: bewaartermijn (dagen)',
    apparaatNaam: 'Apparaat: naam', backupExternPad: 'Backup: externe locatie',
    backupExternInterval: 'Backup: sync-interval externe locatie',
    omboekingenAuto: 'Omboekingen: automatisch', gebruikersProfiel: 'Gebruikersprofiel',
    updateKanaal: 'Update-kanaal', trendsGridCols: 'Trends: aantal kolommen',
    trendsGridSpacing: 'Trends: spacing', onboardingVoltooid: 'Onboarding voltooid',
    regelAutoArchiveerMaanden: 'Categorieregels: auto-archiveer drempel (maanden)',
    aangepastAutoArchiveerMaanden: 'Aangepaste categorisaties: auto-archiveer drempel (maanden)',
    transactieKolommen: 'Transacties: zichtbare kolommen',
    helpModus: 'Helpmodus',
    uiZoom: 'Zoom (%)',
  };
  const wijzigingen: string[] = [];
  for (const sleutel of Object.keys(update)) {
    const oud = vorige[sleutel];
    const nieuw = (update as Record<string, unknown>)[sleutel];
    if (JSON.stringify(oud) === JSON.stringify(nieuw)) continue;
    const label = LABELS[sleutel] ?? sleutel;
    const fmt = (v: unknown) => typeof v === 'boolean' ? (v ? 'aan' : 'uit') : v === null ? '—' : String(v);
    wijzigingen.push(`${label}: ${fmt(oud)} → ${fmt(nieuw)}`);
  }
  const beschrijving = wijzigingen.length > 0 ? wijzigingen.join('; ') : 'Instelling opgeslagen';

  return metWijziging(
    { type: 'instelling', beschrijving },
    () => {
      try {
        updateInstellingen(update);
        if (body.omboekingenAuto !== undefined) categoriseerTransacties();
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        const bericht = err instanceof Error ? err.message : 'Databasefout.';
        return NextResponse.json({ error: bericht }, { status: 500 });
      }
    },
  );
}
