import type { TransactieMetCategorie } from '@/lib/transacties';
import type { PatronModalData } from '@/features/shared/components/CategoriePopup';
import { maakNaamChips, analyseerOmschrijvingen } from '@/features/shared/utils/naamChips';

export async function maakCategorieregel(
  t: TransactieMetCategorie,
  categorie: string,
  subcategorie: string,
  omschrWoord?: string | null,
  inclusiefIban = true,
  naamZoekWoord?: string | null,
  naamOrigineel?: string | null,
  toelichting?: string | null,
  bedragMin?: number | null,
  bedragMax?: number | null,
): Promise<number | null> {
  const body: Record<string, unknown> = {
    categorie,
    subcategorie:       subcategorie || null,
    type:               t.type,
    naam_origineel:     naamOrigineel !== undefined ? naamOrigineel : (t.naam_tegenpartij ?? null),
    naam_zoekwoord_raw: naamZoekWoord || (t.naam_tegenpartij ?? null),
    toelichting:        toelichting ?? null,
    bedrag_min:         bedragMin ?? null,
    bedrag_max:         bedragMax ?? null,
  };
  if (inclusiefIban && t.tegenrekening_iban_bban) body.iban = t.tegenrekening_iban_bban;
  if (omschrWoord) body.omschrijving_raw = omschrWoord;
  const res = await fetch('/api/categorieen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return null;
  const { id } = await res.json();
  return id as number;
}

export async function triggerHermatch(toelichting?: string | null, categorieId?: number | null): Promise<void> {
  const extra = categorieId != null ? { toelichting: toelichting || null, categorie_id: categorieId } : {};
  await fetch('/api/categoriseer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra) });
}

export async function vindMatchendeRegelId(
  t: TransactieMetCategorie,
  naamZoekwoord: string | null,
  omschrZoekwoord: string | null,
): Promise<number | null> {
  const res = await fetch('/api/categorieen');
  if (!res.ok) return null;
  const regels: { id: number; naam_zoekwoord: string | null; iban: string | null; omschrijving_zoekwoord: string | null }[] = await res.json();
  const match = regels.find(r =>
    r.iban === (t.tegenrekening_iban_bban ?? null) &&
    r.naam_zoekwoord === naamZoekwoord &&
    r.omschrijving_zoekwoord === omschrZoekwoord
  );
  return match?.id ?? null;
}

export async function buildCategoriePopupData(t: TransactieMetCategorie): Promise<PatronModalData> {
  const naamChips = maakNaamChips(t.naam_tegenpartij ?? null);
  const chips = analyseerOmschrijvingen(t);

  if (t.categorie_id != null || t.categorie) {
    const regelsRes = await fetch('/api/categorieen');
    const regels: { id: number; naam_zoekwoord: string | null; omschrijving_zoekwoord: string | null; categorie: string; subcategorie: string | null }[] = regelsRes.ok ? await regelsRes.json() : [];
    const regel = t.categorie_id != null ? regels.find(r => r.id === t.categorie_id) ?? null : null;

    const categorie = t.categorie ?? '';
    const subcategorie = t.subcategorie ?? '';

    const naamZoekwoorden = regel?.naam_zoekwoord ? regel.naam_zoekwoord.split(' ').filter(Boolean) : [];
    const gekozenNaamChips = naamChips.filter(c => naamZoekwoorden.includes(c.waarde)).map(c => c.waarde);

    const omschrZoekwoorden = regel?.omschrijving_zoekwoord ? regel.omschrijving_zoekwoord.split(' ').filter(Boolean) : [];
    const gekozenWoorden = chips.filter(c => omschrZoekwoorden.includes(c.waarde)).map(c => c.waarde);

    const subcatRes = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(categorie)}&volledig=1`);
    const subs: { naam: string; inActieveRegel: boolean }[] = subcatRes.ok ? await subcatRes.json() : [];
    const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
    const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);

    return { transactie: t, toelichting: t.toelichting ?? '', nieuweCat: categorie, catNieuw: false, nieuweCatRekeningId: '', subcategorie, subcatOpties, subcatGearchiveerd, subcatNieuw: false, naamChips, gekozenNaamChips, chips, gekozenWoorden, scope: t.categorie_id != null ? 'alle' : 'enkel', bedragMin: t.regel_bedrag_min ?? null, bedragMax: t.regel_bedrag_max ?? null };
  }

  return { transactie: t, toelichting: t.toelichting ?? '', nieuweCat: '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [], subcatNieuw: false, naamChips, gekozenNaamChips: [], chips, gekozenWoorden: [], scope: 'alle', bedragMin: t.regel_bedrag_min ?? null, bedragMax: t.regel_bedrag_max ?? null };
}

/**
 * Categoriseert een transactie volgens de popup-input. Voor scope='alle' wordt
 * de huidige transactie altijd direct gepatched (optimistic update zodat de
 * tabel meteen kan refreshen) en wordt de server-side hermatch fire-and-forget
 * gestart voor eventuele andere matchende transacties. De hermatch-promise
 * wordt teruggegeven zodat de caller optioneel een tweede reload kan triggeren
 * zodra de hermatch klaar is.
 */
export async function bevestigCategorisatie(patronModal: PatronModalData): Promise<{ hermatch: Promise<void> | null }> {
  const { transactie: t, toelichting, nieuweCat, catNieuw, nieuweCatRekeningId, subcategorie, gekozenWoorden, gekozenNaamChips, scope, bedragMin, bedragMax } = patronModal;
  const gekozenNaamChip  = gekozenNaamChips.join(' ');
  const gekozenWoord     = gekozenWoorden.join(' ');
  const gekozenNaamLabel = patronModal.naamChips.filter(c => gekozenNaamChips.includes(c.waarde)).map(c => c.label).join(' ') || t.naam_tegenpartij || null;
  const subcatWaarde = subcategorie === '__geen__' ? '' : subcategorie;

  if (nieuweCat === '__geen__') {
    if (scope === 'alle') {
      const regelId = t.categorie_id ?? await vindMatchendeRegelId(t, gekozenNaamChip || null, gekozenWoord || null);
      if (regelId !== null) await fetch(`/api/categorieen/${regelId}`, { method: 'DELETE' });
      // Optimistic: huidige transactie direct resetten zodat de tabel meteen klopt.
      await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie_id: null, status: 'nieuw', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }) });
      return { hermatch: triggerHermatch() };
    } else {
      await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie_id: null, status: 'nieuw', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }) });
    }
    return { hermatch: null };
  }
  if (!nieuweCat) return { hermatch: null };

  if (scope === 'enkel') {
    if (catNieuw) await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
    await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, status: 'verwerkt', handmatig_gecategoriseerd: 1, toelichting: toelichting || null }) });
    return { hermatch: null };
  }

  let finalRegelId: number | null = null;
  if (catNieuw) {
    await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
    const regelId = await vindMatchendeRegelId(t, gekozenNaamChip || null, gekozenWoord || null);
    if (regelId !== null) {
      await fetch(`/api/categorieen/${regelId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, toelichting: toelichting || null, naam_origineel: gekozenNaamLabel, naam_zoekwoord_raw: gekozenNaamChip || t.naam_tegenpartij, type: t.type, bedrag_min: bedragMin, bedrag_max: bedragMax, ...(t.tegenrekening_iban_bban ? { iban: t.tegenrekening_iban_bban } : {}) }) });
      finalRegelId = regelId;
    } else {
      finalRegelId = await maakCategorieregel(t, nieuweCat.trim(), subcatWaarde, gekozenWoord || null, true, gekozenNaamChip || t.naam_tegenpartij, gekozenNaamLabel, toelichting || null, bedragMin, bedragMax);
    }
  } else if (t.categorie_id !== null) {
    await fetch(`/api/categorieen/${t.categorie_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie: nieuweCat, subcategorie: subcatWaarde || null, toelichting: toelichting || null, naam_origineel: gekozenNaamLabel, naam_zoekwoord_raw: gekozenNaamChip || t.naam_tegenpartij, type: t.type, bedrag_min: bedragMin, bedrag_max: bedragMax, ...(t.tegenrekening_iban_bban ? { iban: t.tegenrekening_iban_bban } : {}) }) });
    finalRegelId = t.categorie_id;
  } else {
    finalRegelId = await maakCategorieregel(t, nieuweCat, subcatWaarde, gekozenWoord || null, true, gekozenNaamChip || t.naam_tegenpartij, gekozenNaamLabel, toelichting || null, bedragMin, bedragMax);
  }
  // Optimistic: huidige transactie direct patchen zodat de tabel meteen klopt
  // zonder op de server-side hermatch (chunks van 50) te wachten.
  await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, categorie_id: finalRegelId, status: 'verwerkt', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }) });
  return { hermatch: triggerHermatch(toelichting || null, finalRegelId) };
}
