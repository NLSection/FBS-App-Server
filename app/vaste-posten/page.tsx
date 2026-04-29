'use client';

import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import type { VastePostenOverzicht, VastePostItem, VastePostTransactie, VastePostGroep, NegeerItem } from '@/app/api/vaste-posten-overzicht/route';
import type { Periode } from '@/lib/maandperiodes';
import { kiesStartPeriode } from '@/lib/kiesStartPeriode';
import type { TransactieMetCategorie } from '@/lib/transacties';
import MaandFilter from '@/components/MaandFilter';
import CategoriePopup, { type PatronModalData } from '@/features/shared/components/CategoriePopup';
import { maakNaamChips, analyseerOmschrijvingen } from '@/features/shared/utils/naamChips';

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; }
interface VpGroepNaam { id: number; naam: string; subcategorieen: string[]; }
type MenuItem = { label: string; url?: string; action?: () => void };
type MenuState = { key: string; top: number; left: number; items: MenuItem[] };
type GroepModal =
  | { type: 'nieuwe-groep'; subcategorie: string; naam: string }
  | { type: 'voeg-toe'; subcategorie: string; groepId: number | '' }
  | { type: 'voeg-subcategorie-toe'; groepId: number; groepNaam: string; subcategorie: string }
  | { type: 'hernoem'; groepId: number; naam: string };

function GroepMenuBtn({ getItems }: { getItems: () => MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
          setItems(getItems());
          setOpen(o => !o);
        }}
        title="Opties"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1, padding: 0, borderRadius: 4, display: 'flex', alignItems: 'center' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M6.5 1h3l.5 2.1a5.5 5.5 0 0 1 1.8 1l2-.7 1.5 2.6-1.5 1.4a5.5 5.5 0 0 1 0 2.1l1.5 1.4-1.5 2.6-2-.7a5.5 5.5 0 0 1-1.8 1L9.5 15h-3l-.5-2.1a5.5 5.5 0 0 1-1.8-1l-2 .7L.7 10l1.5-1.4a5.5 5.5 0 0 1 0-2.1L.7 5.1l1.5-2.6 2 .7a5.5 5.5 0 0 1 1.8-1z" /><circle cx="8" cy="8" r="2.5" /></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9000, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)', minWidth: 220, padding: 5, overflow: 'hidden', whiteSpace: 'nowrap', animation: 'vp-drop-in 120ms ease' }}>
          <style>{`@keyframes vp-drop-in { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
          {items.map((item, i) => {
            const stijl: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-h)', textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', borderRadius: 7, transition: 'background 80ms' };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--accent-dim)');
            const onLeave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'transparent');
            return item.action
              ? <button key={i} style={stijl} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={e => { e.stopPropagation(); item.action!(); setOpen(false); }}>{item.label}</button>
              : <a key={i} href={item.url} style={stijl} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={() => setOpen(false)}>{item.label}</a>;
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function HamburgerBtn({ menuKey, getItems, onOpen }: { menuKey: string; getItems: () => MenuItem[]; onOpen: (e: React.MouseEvent, key: string, items: MenuItem[]) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpen(e, menuKey, getItems()); }}
      title="Opties"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1, padding: 0, borderRadius: 4, display: 'flex', alignItems: 'center' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" /></svg>
    </button>
  );
}


const MAAND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

const fmt = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

const fmtDatum = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MAAND_KORT[m - 1]}`;
};

const bedragKleur = (n: number) => n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text)';

export default function VastePostenPage() {
  const router = useRouter();
  const [data, setData]               = useState<VastePostenOverzicht | null>(null);
  const [laadt, setLaadt]             = useState(true);
  const [fout, setFout]               = useState('');
  const [periodes, setPeriodes]       = useState<Periode[]>([]);
  const [geselecteerdJaar, setGeselecteerdJaar]           = useState<number>(new Date().getFullYear());
  const [geselecteerdePeriode, setGeselecteerdePeriode]   = useState<Periode | null>(null);
  const [openRijen, setOpenRijen]     = useState<Set<number>>(new Set());
  const [patronModal, setPatronModal] = useState<PatronModalData | null>(null);
  const [budgettenPotjes, setBudgettenPotjes]             = useState<BudgetPotjeNaam[]>([]);
  const [rekeningen, setRekeningen]   = useState<Rekening[]>([]);
  const [uniekeCategorieenDropdown, setUniekeCategorieenDropdown] = useState<string[]>([]);
  const [gebruikersProfiel, setGebruikersProfiel] = useState<'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null>(null);
  const [menuState, setMenuState]     = useState<MenuState | null>(null);
  const [naamWijzigItem, setNaamWijzigItem] = useState<{ regelId: number; naam: string } | null>(null);
  const [vpGroepen, setVpGroepen]     = useState<VpGroepNaam[]>([]);
  const [groepModal, setGroepModal]   = useState<GroepModal | null>(null);
  const [negeerdeOpen, setNegeerdeOpen] = useState(false);
  const [openNegeerdeRijen, setOpenNegeerdeRijen] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu]  = useState<{ top: number; left: number; items: MenuItem[] } | null>(null);
  const dragIdx                       = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [volgordePopup, setVolgordePopup] = useState<{ groepen: VastePostGroep[] } | null>(null);
  const [volgordeGewijzigd, setVolgordeGewijzigd] = useState(false);
  const origineelGroepen              = useRef<VastePostGroep[]>([]);
  const initieleDataGeladen           = useRef(false);

  useEffect(() => {
    // Periodes + overzicht (huidige periode) parallel ophalen
    Promise.all([
      fetch('/api/periodes').then(r => r.ok ? r.json() : []) as Promise<Periode[]>,
      fetch('/api/vaste-posten-overzicht').then(r => r.ok ? r.json() : null) as Promise<VastePostenOverzicht | null>,
      fetch('/api/lookup-data').then(r => r.ok ? r.json() : null) as Promise<{ budgettenPotjes?: unknown[] | null; rekeningen?: unknown[] | null; uniekeCategorieen?: string[] | null } | null>,
      fetch('/api/vp-groepen').then(r => r.ok ? r.json() : []),
      fetch('/api/instellingen').then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{ gebruikersProfiel?: string | null } | null>,
    ]).then(([ps, overzicht, lookup, vpg, inst]) => {
      const p = inst?.gebruikersProfiel;
      setGebruikersProfiel((p === 'potjesbeheer' || p === 'uitgavenbeheer' || p === 'handmatig') ? p : null);
      setPeriodes(ps);
      setBudgettenPotjes((lookup?.budgettenPotjes ?? []) as Parameters<typeof setBudgettenPotjes>[0]);
      setRekeningen((lookup?.rekeningen ?? []) as Parameters<typeof setRekeningen>[0]);
      setUniekeCategorieenDropdown(lookup?.uniekeCategorieen ?? []);
      setVpGroepen(vpg);
      const huidig = kiesStartPeriode(ps);
      if (huidig) {
        setGeselecteerdePeriode(huidig);
        setGeselecteerdJaar(huidig.jaar);
      }
      // Initiële overzicht-fetch matcht alleen als de gekozen periode 'actueel met data' is
      // (anders heeft kiesStartPeriode iets anders gepakt → useEffect laadt 'm met juiste periode).
      const initieelMatcht = !!huidig && huidig.status === 'actueel' && huidig.heeftData;
      if (overzicht && initieelMatcht) { setData(overzicht); origineelGroepen.current = overzicht.groepen; setVolgordeGewijzigd(false); setLaadt(false); initieleDataGeladen.current = true; }
    }).catch(() => { setFout('Kon vaste posten niet ophalen.'); setLaadt(false); });
  }, []);

  const laden = useCallback((periode: Periode | null, stil = false) => {
    if (!periode) return;
    const scrollPos = stil ? window.scrollY : 0;
    if (!stil) { setLaadt(true); setOpenRijen(new Set()); }
    fetch(`/api/vaste-posten-overzicht?jaar=${periode.jaar}&maand=${periode.maand}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: VastePostenOverzicht) => {
        setData(d); origineelGroepen.current = d.groepen; setVolgordeGewijzigd(false);
        if (!stil) setLaadt(false);
        else requestAnimationFrame(() => window.scrollTo({ top: scrollPos, behavior: 'instant' as ScrollBehavior }));
      })
      .catch(() => { setFout('Kon vaste posten niet ophalen.'); if (!stil) setLaadt(false); });
  }, []);

  useEffect(() => {
    if (!geselecteerdePeriode) return;
    if (initieleDataGeladen.current) { initieleDataGeladen.current = false; return; }
    laden(geselecteerdePeriode);
  }, [geselecteerdePeriode, laden]);

  // Herlaad overzicht wanneer Vaste Posten instellingen worden gewijzigd
  // (via popover/modal vanaf dezelfde pagina). Zonder dit blijft het overzicht
  // op de oude waarde hangen tot een handmatige refresh.
  useEffect(() => {
    function onApplied() { laden(geselecteerdePeriode, true); }
    window.addEventListener('vaste-posten-inst-applied', onApplied);
    return () => window.removeEventListener('vaste-posten-inst-applied', onApplied);
  }, [geselecteerdePeriode, laden]);

  const toggleRij = (id: number) => setOpenRijen(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  function openMenu(e: React.MouseEvent, key: string, items: MenuItem[]) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const left = Math.max(10, Math.min(rect.right - 200, window.innerWidth - 220));
    setMenuState({ key, top: rect.bottom + 4, left, items });
  }

  function vpHoofdItems(item: VastePostItem): MenuItem[] {
    const ps = periodeSleutel();
    const items: MenuItem[] = [
      { label: 'Wijzig weergave naam', action: () => setNaamWijzigItem({ regelId: item.regelId, naam: item.naam }) },
      { label: 'Negeer — alleen deze maand', action: () => negeerItem(item.regelId, ps) },
      { label: 'Negeer — vanaf deze maand', action: () => negeerItem(item.regelId, `vanaf:${ps}`) },
      { label: 'Negeer — alle maanden', action: () => negeerItem(item.regelId, 'permanent') },
    ];
    const groep = data?.groepen.find(g => g.subcategorieen.includes(item.subcategorie));
    if (groep) {
      if (groep.groepId === null) {
        items.push({ label: 'Nieuwe groep starten', action: () => setGroepModal({ type: 'nieuwe-groep', subcategorie: item.subcategorie, naam: item.subcategorie }) });
        if (vpGroepen.length > 0) items.push({ label: 'Toevoegen aan bestaande groep', action: () => setGroepModal({ type: 'voeg-toe', subcategorie: item.subcategorie, groepId: '' }) });
      } else if (groep.subcategorieen.length === 1) {
        items.push({ label: 'Verwijder uit groep', action: () => verwijderSubcategorieUitGroep(groep.groepId!, item.subcategorie) });
      } else {
        items.push({ label: `Haal "${item.subcategorie}" uit groep`, action: () => verwijderSubcategorieUitGroep(groep.groepId!, item.subcategorie) });
      }
    }
    return items;
  }

  function vpSubItems(itemSubcategorie: string) {
    return (trx: VastePostTransactie): MenuItem[] => {
      const mp = trx.periode;
      return [
        { label: 'Bekijk in gefilterde weergave', url: `/transacties?categorie=${encodeURIComponent('Vaste Posten')}&subcategorie=${encodeURIComponent(itemSubcategorie)}${mp ? `&maand=${mp}` : ''}&transactie=${trx.id}` },
        { label: 'Bekijk in maandweergave',        url: `/transacties?${mp ? `maand=${mp}&` : ''}transactie=${trx.id}` },
      ];
    };
  }

  async function slaaNaamOp() {
    if (!naamWijzigItem) return;
    const { regelId, naam } = naamWijzigItem;
    setNaamWijzigItem(null);
    await fetch(`/api/categorieen/${regelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam_origineel: naam.trim() }),
    });
    laden(geselecteerdePeriode, true);
  }

  async function herlaadVpGroepen() {
    const res = await fetch('/api/vp-groepen');
    if (res.ok) setVpGroepen(await res.json());
  }

  async function bevestigGroepModal() {
    if (!groepModal) return;
    const m = groepModal;
    setGroepModal(null);

    if (m.type === 'nieuwe-groep') {
      const res = await fetch('/api/vp-groepen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: m.naam }) });
      if (res.ok) {
        const { id } = await res.json();
        await fetch(`/api/vp-groepen/${id}/subcategorieen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategorie: m.subcategorie }) });
      }
    } else if (m.type === 'voeg-toe') {
      if (!m.groepId) return;
      await fetch(`/api/vp-groepen/${m.groepId}/subcategorieen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategorie: m.subcategorie }) });
    } else if (m.type === 'voeg-subcategorie-toe') {
      await fetch(`/api/vp-groepen/${m.groepId}/subcategorieen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategorie: m.subcategorie }) });
    } else if (m.type === 'hernoem') {
      await fetch(`/api/vp-groepen/${m.groepId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: m.naam }) });
    }

    await herlaadVpGroepen();
    laden(geselecteerdePeriode, true);
  }

  async function verwijderSubcategorieUitGroep(groepId: number, subcategorie: string) {
    await fetch(`/api/vp-groepen/${groepId}/subcategorieen`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategorie }) });
    await herlaadVpGroepen();
    laden(geselecteerdePeriode, true);
  }

  async function verwijderGroep(groepId: number) {
    await fetch(`/api/vp-groepen/${groepId}`, { method: 'DELETE' });
    await herlaadVpGroepen();
    laden(geselecteerdePeriode, true);
  }

  function periodeSleutel() {
    return geselecteerdePeriode ? `${geselecteerdePeriode.jaar}-${String(geselecteerdePeriode.maand).padStart(2, '0')}` : '';
  }

  async function negeerItem(regelId: number, periode: string) {
    await fetch('/api/vp-negeer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regelId, periode }) });
    laden(geselecteerdePeriode, true);
  }

  async function herstelItem(item: NegeerItem) {
    await fetch(`/api/vp-negeer/${item.regelId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periode: item.periode }) });
    laden(geselecteerdePeriode, true);
  }

  async function slaVolgorde(groepen: VastePostGroep[], periode: string) {
    const items = groepen.map((g, i) => ({ sleutel: g.subcategorie, volgorde: i }));
    await fetch('/api/vp-volgorde', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, periode }) });
  }

  function groepHoofdItems(groep: VastePostGroep): MenuItem[] {
    const standaloneSubcats = data?.groepen.filter(g => g.groepId === null).map(g => g.subcategorie) ?? [];
    if (groep.groepId === null) {
      // Standalone subcategorie
      const items: MenuItem[] = [
        { label: 'Nieuwe groep starten', action: () => setGroepModal({ type: 'nieuwe-groep', subcategorie: groep.subcategorie, naam: groep.subcategorie }) },
      ];
      if (vpGroepen.length > 0) items.push({ label: 'Toevoegen aan bestaande groep', action: () => setGroepModal({ type: 'voeg-toe', subcategorie: groep.subcategorie, groepId: '' }) });
      return items;
    } else {
      // Vp_groep
      const items: MenuItem[] = [
        { label: 'Hernoem groep', action: () => setGroepModal({ type: 'hernoem', groepId: groep.groepId!, naam: groep.subcategorie }) },
      ];
      if (standaloneSubcats.length > 0) items.push({ label: 'Subcategorie toevoegen aan groep', action: () => setGroepModal({ type: 'voeg-subcategorie-toe', groepId: groep.groepId!, groepNaam: groep.subcategorie, subcategorie: standaloneSubcats[0] }) });
      if (groep.subcategorieen.length === 1) {
        items.push({ label: 'Verwijder uit groep', action: () => verwijderSubcategorieUitGroep(groep.groepId!, groep.subcategorieen[0]) });
      } else {
        for (const subcat of groep.subcategorieen) {
          items.push({ label: `Haal "${subcat}" uit groep`, action: () => verwijderSubcategorieUitGroep(groep.groepId!, subcat) });
        }
      }
      items.push({ label: 'Groep opheffen', action: () => verwijderGroep(groep.groepId!) });
      return items;
    }
  }

  useEffect(() => {
    if (!menuState) return;
    function handleClick() { setMenuState(null); }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuState(null); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [menuState]);

  useEffect(() => {
    if (!contextMenu) return;
    function close() { setContextMenu(null); }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', handleKey); };
  }, [contextMenu]);

  useEffect(() => {
    if (!volgordeGewijzigd) return;
    function handleUnload(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [volgordeGewijzigd]);

  async function openCategoriePopup(trx: VastePostTransactie, e: React.MouseEvent) {
    e.stopPropagation();
    const naamChips = maakNaamChips(trx.naam_tegenpartij);
    const chips = analyseerOmschrijvingen(trx);
    if (trx.categorie_id != null || trx.categorie) {
      const regelsRes = await fetch('/api/categorieen');
      const regels: { id: number; naam_zoekwoord: string | null; omschrijving_zoekwoord: string | null; bedrag_min: number | null; bedrag_max: number | null }[] = regelsRes.ok ? await regelsRes.json() : [];
      const regel = trx.categorie_id != null ? regels.find(r => r.id === trx.categorie_id) ?? null : null;
      const naamZoekwoorden = regel?.naam_zoekwoord ? regel.naam_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenNaamChips = naamChips.filter(c => naamZoekwoorden.includes(c.waarde)).map(c => c.waarde);
      const omschrZoekwoorden = regel?.omschrijving_zoekwoord ? regel.omschrijving_zoekwoord.split(' ').filter(Boolean) : [];
      const gekozenWoorden = chips.filter(c => omschrZoekwoorden.includes(c.waarde)).map(c => c.waarde);
      const subcatRes = await fetch(`/api/subcategorieen?categorie=${encodeURIComponent(trx.categorie ?? '')}&volledig=1`);
      const subs: { naam: string; inActieveRegel: boolean }[] = subcatRes.ok ? await subcatRes.json() : [];
      const subcatOpties = subs.filter(s => s.inActieveRegel).map(s => s.naam);
      const subcatGearchiveerd = subs.filter(s => !s.inActieveRegel).map(s => s.naam);
      setPatronModal({ transactie: trx as unknown as TransactieMetCategorie, toelichting: trx.toelichting ?? '', nieuweCat: trx.categorie ?? '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: trx.subcategorie ?? '', subcatOpties, subcatGearchiveerd, subcatNieuw: false, naamChips, gekozenNaamChips, chips, gekozenWoorden, scope: trx.categorie_id != null ? 'alle' : 'enkel', bedragMin: regel?.bedrag_min ?? null, bedragMax: regel?.bedrag_max ?? null });
    } else {
      setPatronModal({ transactie: trx as unknown as TransactieMetCategorie, toelichting: trx.toelichting ?? '', nieuweCat: '', catNieuw: false, nieuweCatRekeningId: '', subcategorie: '', subcatOpties: [], subcatNieuw: false, naamChips, gekozenNaamChips: [], chips, gekozenWoorden: [], scope: 'alle', bedragMin: null, bedragMax: null });
    }
  }

  async function handlePatronModalBevestig() {
    if (!patronModal) return;
    const { transactie: t, toelichting, nieuweCat, catNieuw, nieuweCatRekeningId, subcategorie, gekozenWoorden, gekozenNaamChips, scope, bedragMin, bedragMax } = patronModal;
    const gekozenNaamChip  = gekozenNaamChips.join(' ');
    const gekozenWoord     = gekozenWoorden.join(' ');
    const gekozenNaamLabel = patronModal.naamChips.filter(c => gekozenNaamChips.includes(c.waarde)).map(c => c.label).join(' ') || t.naam_tegenpartij || null;
    const subcatWaarde = subcategorie === '__geen__' ? '' : subcategorie;
    setPatronModal(null);

    if (nieuweCat === '__geen__') {
      if (scope === 'alle') {
        if (t.categorie_id != null) await fetch(`/api/categorieen/${t.categorie_id}`, { method: 'DELETE' });
        await fetch('/api/categoriseer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      } else {
        await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie_id: null, status: 'nieuw', handmatig_gecategoriseerd: 0, toelichting: toelichting || null }) });
      }
      laden(geselecteerdePeriode, true); return;
    }
    if (!nieuweCat) { laden(geselecteerdePeriode, true); return; }

    if (scope === 'enkel') {
      if (catNieuw) await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
      await fetch(`/api/transacties/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, status: 'verwerkt', handmatig_gecategoriseerd: 1, toelichting: toelichting || null }) });
      laden(geselecteerdePeriode, true); return;
    }

    if (catNieuw) await fetch('/api/budgetten-potjes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweCat.trim(), rekening_ids: nieuweCatRekeningId ? [parseInt(nieuweCatRekeningId, 10)] : [] }) });
    const body: Record<string, unknown> = { categorie: nieuweCat.trim(), subcategorie: subcatWaarde || null, type: t.type, naam_origineel: gekozenNaamLabel, naam_zoekwoord_raw: gekozenNaamChip || t.naam_tegenpartij, toelichting: toelichting || null, bedrag_min: bedragMin, bedrag_max: bedragMax };
    if (t.tegenrekening_iban_bban) body.iban = t.tegenrekening_iban_bban;
    if (gekozenWoord) body.omschrijving_raw = gekozenWoord;

    let finalRegelId: number | null = null;
    if (t.categorie_id != null && !catNieuw) {
      await fetch(`/api/categorieen/${t.categorie_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      finalRegelId = t.categorie_id;
    } else {
      const res = await fetch('/api/categorieen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const { id } = await res.json(); finalRegelId = id as number; }
    }
    const extra = finalRegelId != null ? { toelichting: toelichting || null, categorie_id: finalRegelId } : {};
    await fetch('/api/categoriseer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra) });
    laden(geselecteerdePeriode, true);
  }

  if (!geselecteerdePeriode && periodes.length === 0) return <div className="loading">Laden…</div>;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <h1 className="text-xl font-semibold" style={{ margin: 0 }}>Vaste Posten</h1>

      {/* Maandfilter + instellingenknop */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div
          style={{ flex: 1 }}
          onContextMenu={e => {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('preview-menu', { detail: { sectieId: 'vaste-posten', x: e.clientX, y: e.clientY } }));
          }}
        >
          <MaandFilter
            periodes={periodes}
            geselecteerdJaar={geselecteerdJaar}
            geselecteerdePeriode={geselecteerdePeriode}
            onJaarChange={jaar => {
              setGeselecteerdJaar(jaar);
              const filtered = periodes.filter(p => p.jaar === jaar && p.status !== 'toekomstig');
              const laatste = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
              if (laatste) setGeselecteerdePeriode(laatste);
            }}
            onPeriodeChange={p => { if (p) setGeselecteerdePeriode(p); }}
            toonAlle={false}
          />
        </div>
        <button
          title="Vaste Posten instellingen"
          onClick={() => window.dispatchEvent(new CustomEvent('preview-modal', { detail: { sectieId: 'vaste-posten' } }))}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-dim)', borderRadius: 6, padding: '4px 8px',
            cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center',
          }}
        ><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M6.5 1h3l.5 2.1a5.5 5.5 0 0 1 1.8 1l2-.7 1.5 2.6-1.5 1.4a5.5 5.5 0 0 1 0 2.1l1.5 1.4-1.5 2.6-2-.7a5.5 5.5 0 0 1-1.8 1L9.5 15h-3l-.5-2.1a5.5 5.5 0 0 1-1.8-1l-2 .7L.7 10l1.5-1.4a5.5 5.5 0 0 1 0-2.1L.7 5.1l1.5-2.6 2 .7a5.5 5.5 0 0 1 1.8-1z" /><circle cx="8" cy="8" r="2.5" /></svg></button>
      </div>

      {laadt ? (
        <div className="loading">Vaste posten worden geladen…</div>
      ) : fout ? (
        <div className="empty" style={{ color: 'var(--red)' }}>{fout}</div>
      ) : !data ? null : (
        <>
          {/* Totalen — horizontaal boven de tabellen */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Totale Inkomsten', bedrag: data.totaalInkomsten, kleur: 'var(--green)' },
              { label: 'Totale Uitgaven',  bedrag: data.totaalUitgaven,  kleur: 'var(--red)'   },
              { label: 'Nog te gaan', bedrag: data.nogTeGaan,     kleur: 'var(--text-h)' },
              { label: 'Vrij te besteden', bedrag: data.totaalInkomsten - data.totaalUitgaven, kleur: data.totaalInkomsten - data.totaalUitgaven >= 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, bedrag, kleur }) => (
              <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 1 auto', minWidth: 140 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: kleur, fontVariantNumeric: 'tabular-nums' }}>{fmt(bedrag)}</div>
              </div>
            ))}
          </div>

          {/* Groepen */}
          <div style={{ minWidth: 0 }}>
          {data.groepen.length === 0 ? (
            <div className="empty">Geen vaste posten gevonden voor deze periode.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {data.groepen.map((groep, groepIdx) => (
                <div
                  key={groep.subcategorie}
                  className="table-wrapper"
                  draggable
                  onDragStart={() => { dragIdx.current = groepIdx; }}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(groepIdx); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={() => {
                    const from = dragIdx.current;
                    const to = groepIdx;
                    setDragOverIdx(null); dragIdx.current = null;
                    if (from === null || from === to) return;
                    setData(d => {
                      if (!d) return d;
                      const ng = [...d.groepen];
                      const [moved] = ng.splice(from, 1);
                      ng.splice(to, 0, moved);
                      return { ...d, groepen: ng };
                    });
                    setVolgordeGewijzigd(true);
                  }}
                  onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
                  style={{ outline: dragOverIdx === groepIdx ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
                >
                  <table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                      <col style={{ width: 20 }} />
                      <col style={{ width: 80 }} />
                      <col />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 28 }} />
                    </colgroup>
                    <thead>
                      <tr onContextMenu={e => { e.preventDefault(); setContextMenu({ top: e.clientY, left: e.clientX, items: groepHoofdItems(groep) }); }}>
                        <th style={{ width: 20, padding: '4px 4px', textAlign: 'center', cursor: 'grab', color: 'var(--text-dim)', userSelect: 'none', fontSize: 14 }}>⠿</th>
                        <th colSpan={5} style={{ textAlign: 'left', padding: '4px 5px' }}>{groep.subcategorie}</th>
                        <th style={{ width: 28, textAlign: 'center', padding: '4px 4px' }}>
                          <GroepMenuBtn getItems={() => groepHoofdItems(groep)} />
                        </th>
                      </tr>
                      <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '4px 5px' }} />
                        <th style={{ textAlign: 'left',  padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>Datum</th>
                        <th style={{ textAlign: 'left',  padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>Naam</th>
                        <th style={{ textAlign: 'left',  padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>Subcategorie</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>Bedrag</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>Status</th>
                        <th style={{ padding: '4px 5px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {groep.items.map(item => {
                        const isOpen = openRijen.has(item.regelId);
                        return (
                          <Fragment key={item.regelId}>
                            <tr
                              data-onboarding="vaste-posten-rij"
                              onClick={() => toggleRij(item.regelId)}
                              onContextMenu={e => { e.preventDefault(); setContextMenu({ top: e.clientY, left: e.clientX, items: vpHoofdItems(item) }); }}
                              style={{ cursor: 'pointer' }}
                            >
                              <VastePostCellen item={item} />
                              <td style={{ padding: '1px 4px', textAlign: 'center', width: 28, verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                <HamburgerBtn menuKey={`vp-hoofd-${item.regelId}`} getItems={() => vpHoofdItems(item)} onOpen={openMenu} />
                              </td>
                            </tr>
                            {isOpen && item.transacties.length > 0 && (
                              <tr className="bls-expand">
                                <td colSpan={7} style={{ padding: '0 8px 8px 16px' }}>
                                  <Subtabel transacties={item.transacties} onBewerk={openCategoriePopup} menuItems={vpSubItems(item.subcategorie)} openMenu={openMenu} openContextMenu={(e, items) => { e.preventDefault(); setContextMenu({ top: e.clientY, left: e.clientX, items }); }} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          {/* Genegeerde posten */}
          {data.negeerde.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 24 }}>
              <div className="table-wrapper">
                <table style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: 24 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 110 }} /><col style={{ width: 90 }} />
                  </colgroup>
                  <thead>
                    <tr onClick={() => setNegeerdeOpen(o => !o)} style={{ cursor: 'pointer' }}>
                      <th colSpan={4} style={{ textAlign: 'left', color: 'var(--text-dim)' }}>
                        Genegeerde posten ({data.negeerde.length})
                      </th>
                      <th style={{ textAlign: 'right', padding: '8px 12px 8px 4px' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)', transition: 'transform 0.15s', transform: negeerdeOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                      </th>
                    </tr>
                  </thead>
                  {negeerdeOpen && (
                    <tbody>
                      {data.negeerde.map(item => {
                        const sleutel = `${item.regelId}-${item.periode}`;
                        const isOpen = openNegeerdeRijen.has(sleutel);
                        const toggleNegeerdeRij = () => setOpenNegeerdeRijen(prev => {
                          const next = new Set(prev);
                          if (next.has(sleutel)) next.delete(sleutel); else next.add(sleutel);
                          return next;
                        });
                        return (
                        <Fragment key={sleutel}>
                          <tr onClick={toggleNegeerdeRij} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                            <td style={{ padding: '7px 4px 7px 10px', textAlign: 'center', color: 'var(--text-dim)' }}>
                              <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 9 }}>▶</span>
                            </td>
                            <td style={{ padding: '7px 10px 7px 4px' }}>
                              <span style={{ color: 'var(--text-h)', fontWeight: 500 }}>{item.naam}</span>
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              <span className="badge-outline" style={{ fontSize: 11 }}>{item.subcategorie}</span>
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              {(() => {
                                const isPermament = item.periode === 'permanent';
                                const isVanaf = item.periode.startsWith('vanaf:');
                                // Hex-waardes ipv color-mix() — laatste is pas vanaf Safari 16.2
                                // ondersteund en valt op Big Sur weg, waardoor badges transparant
                                // worden. RGBA werkt overal.
                                const palet = isPermament
                                  ? { fg: '#f05252', bg: 'rgba(240,82,82,0.12)', br: 'rgba(240,82,82,0.30)' }
                                  : isVanaf
                                    ? { fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)', br: 'rgba(245,158,11,0.30)' }
                                    : { fg: '#5c7cfa', bg: 'rgba(92,124,250,0.12)', br: 'rgba(92,124,250,0.30)' };
                                const label = isPermament ? 'Alle maanden' : isVanaf ? `Vanaf ${item.periode.slice(6)}` : 'Alleen deze maand';
                                return (
                                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                                    background: palet.bg,
                                    color: palet.fg,
                                    border: `1px solid ${palet.br}`,
                                  }}>
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => herstelItem(item)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', cursor: 'pointer' }}>
                                Herstel
                              </button>
                            </td>
                          </tr>
                          {isOpen && item.transacties.length > 0 && (
                            <tr className="bls-expand">
                              <td colSpan={5} style={{ padding: '0 8px 8px 16px' }}>
                                <Subtabel transacties={item.transacties} onBewerk={openCategoriePopup} menuItems={vpSubItems(item.subcategorie)} openMenu={openMenu} openContextMenu={(e, items) => { e.preventDefault(); setContextMenu({ top: e.clientY, left: e.clientX, items }); }} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          )}
          </div>{/* einde groepen */}
        </>
      )}

      {menuState && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: menuState.top, left: menuState.left, zIndex: 9000, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)', minWidth: 240, padding: 5, overflow: 'hidden', animation: 'vp-menu-in 120ms ease' }}
        >
          <style>{`@keyframes vp-menu-in { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
          {menuState.items.map((item, i) => {
            const stijl: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-h)', cursor: 'pointer', background: 'none', border: 'none', borderRadius: 7, transition: 'background 80ms' };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--accent-dim)');
            const onLeave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'transparent');
            return (
              <button key={i} type="button" style={stijl} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={e => {
                e.stopPropagation();
                if (item.action) item.action();
                else if (item.url) router.push(item.url);
                setMenuState(null);
              }}>{item.label}</button>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: contextMenu.top, left: contextMenu.left, zIndex: 9000, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)', minWidth: 240, padding: 5, overflow: 'hidden', animation: 'vp-ctx-in 120ms ease' }}
        >
          <style>{`@keyframes vp-ctx-in { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
          {contextMenu.items.map((item, i) => {
            const stijl: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-h)', cursor: 'pointer', background: 'none', border: 'none', borderRadius: 7, transition: 'background 80ms' };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--accent-dim)');
            const onLeave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'transparent');
            return (
              <button key={i} type="button" style={stijl} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={e => {
                e.stopPropagation();
                if (item.action) item.action();
                else if (item.url) router.push(item.url);
                setContextMenu(null);
              }}>{item.label}</button>
            );
          })}
        </div>
      )}

      {groepModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setGroepModal(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>

            {groepModal.type === 'nieuwe-groep' && (<>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4 }}>Nieuwe groep starten</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Subcategorie: <strong>{groepModal.subcategorie}</strong></div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Naam van de groep</label>
              <input autoFocus value={groepModal.naam}
                onChange={e => setGroepModal(m => m ? { ...m, naam: e.target.value } : m)}
                onKeyDown={e => { if (e.key === 'Enter') bevestigGroepModal(); if (e.key === 'Escape') setGroepModal(null); }}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, color: 'var(--text-h)', marginBottom: 12 }} />
            </>)}

            {groepModal.type === 'voeg-toe' && (<>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4 }}>Toevoegen aan groep</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Subcategorie: <strong>{groepModal.subcategorie}</strong></div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Kies groep</label>
              <select value={groepModal.groepId} onChange={e => setGroepModal(m => m && m.type === 'voeg-toe' ? { ...m, groepId: parseInt(e.target.value, 10) || '' } : m)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, color: 'var(--text-h)', marginBottom: 12 }}>
                <option value="">— Kies een groep —</option>
                {vpGroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
              </select>
            </>)}

            {groepModal.type === 'voeg-subcategorie-toe' && (<>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4 }}>Subcategorie toevoegen aan &ldquo;{groepModal.groepNaam}&rdquo;</div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4, marginTop: 12 }}>Subcategorie</label>
              <select value={groepModal.subcategorie} onChange={e => setGroepModal(m => m ? { ...m, subcategorie: e.target.value } : m)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, color: 'var(--text-h)', marginBottom: 12 }}>
                {(data?.groepen.filter(g => g.groepId === null).map(g => g.subcategorie) ?? []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>)}

            {groepModal.type === 'hernoem' && (<>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 12 }}>Hernoem groep</div>
              <input autoFocus value={groepModal.naam}
                onChange={e => setGroepModal(m => m ? { ...m, naam: e.target.value } : m)}
                onKeyDown={e => { if (e.key === 'Enter') bevestigGroepModal(); if (e.key === 'Escape') setGroepModal(null); }}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, color: 'var(--text-h)', marginBottom: 12 }} />
            </>)}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setGroepModal(null)} style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>Annuleren</button>
              <button onClick={bevestigGroepModal} style={{ padding: '5px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {naamWijzigItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setNaamWijzigItem(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 12 }}>Wijzig weergave naam</div>
            <input
              autoFocus
              value={naamWijzigItem.naam}
              onChange={e => setNaamWijzigItem(v => v ? { ...v, naam: e.target.value } : v)}
              onKeyDown={e => { if (e.key === 'Enter') slaaNaamOp(); if (e.key === 'Escape') setNaamWijzigItem(null); }}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13, color: 'var(--text-h)', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setNaamWijzigItem(null)} style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>Annuleren</button>
              <button onClick={slaaNaamOp} style={{ padding: '5px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {volgordeGewijzigd && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1500, display: 'flex', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', marginRight: 4 }}>Volgorde gewijzigd</span>
          <button onMouseDown={() => { setData(d => d ? { ...d, groepen: origineelGroepen.current } : d); setVolgordeGewijzigd(false); }}
            style={{ padding: '5px 14px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', cursor: 'pointer' }}>
            Herstellen
          </button>
          <button onMouseDown={() => data && setVolgordePopup({ groepen: data.groepen })}
            style={{ padding: '5px 14px', fontSize: 12, borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>
            Volgorde toepassen
          </button>
        </div>
      )}

      {volgordePopup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setVolgordePopup(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Volgorde toepassen voor</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Voor welke periodes geldt deze volgorde?</div>
            {[
              { label: 'Alle maanden',       periode: 'permanent' },
              { label: 'Alleen deze maand',  periode: periodeSleutel() },
              { label: 'Vanaf deze maand',   periode: `vanaf:${periodeSleutel()}` },
            ].map(({ label, periode }) => (
              <button key={periode} onMouseDown={async () => {
                const g = volgordePopup.groepen;
                setVolgordePopup(null);
                setVolgordeGewijzigd(false);
                origineelGroepen.current = g;
                await slaVolgorde(g, periode);
              }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', marginBottom: 6, fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
            <button onMouseDown={() => setVolgordePopup(null)} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 4, padding: '7px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {patronModal && (
        <CategoriePopup
          patronModal={patronModal}
          setPatronModal={setPatronModal}
          onBevestig={handlePatronModalBevestig}
          onSluiten={() => setPatronModal(null)}
          onReset={() => { setPatronModal(null); laden(geselecteerdePeriode, true); }}
          onAnalyseer={async () => {
            const naam = patronModal.transactie.naam_tegenpartij;
            if (!naam) return {};
            const res = await fetch(`/api/transacties?naam_tegenpartij=${encodeURIComponent(naam)}`);
            const trns: TransactieMetCategorie[] = res.ok ? await res.json() : [];
            const tellers: Record<string, number> = {};
            for (const t of trns) {
              const omschr = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' ');
              const woorden = new Set(omschr.split(/[\s.,/()\[\]{}'"!?:;]+/).filter(w => w.length >= 1).map(w => w.toLowerCase().replace(/[^a-z0-9&-]/g, '')).filter(w => w.length > 0));
              for (const w of woorden) tellers[w] = (tellers[w] ?? 0) + 1;
            }
            return tellers;
          }}
          onDatumWijzig={async (datum) => {
            const tr = patronModal.transactie;
            await fetch(`/api/transacties/${tr.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ datum_aanpassing: datum }),
            });
            laden(geselecteerdePeriode, true);
          }}
          onVoegRekeningToe={() => {}}
          budgettenPotjes={budgettenPotjes}
          rekeningen={rekeningen}
          periodes={periodes}
          uniekeCategorieenDropdown={uniekeCategorieenDropdown}
          gebruikersProfiel={gebruikersProfiel}
        />
      )}
    </div>
  );
}

function VastePostCellen({ item }: { item: VastePostItem }) {
  const geweest   = item.status === 'geweest';
  const ontbreekt = item.status === 'ontbreekt';
  const statusKleur = geweest ? 'var(--green)' : ontbreekt ? 'var(--red)' : 'var(--border)';

  return (
    <>
      {/* Drag handle spacer + status streep */}
      <td style={{ width: 20, borderLeft: `3px solid ${statusKleur}` }} />
      {/* Datum */}
      <td style={{ padding: '1px 8px 1px 9px', whiteSpace: 'nowrap' }}>
        {item.datum ? (
          <span style={{
            color: ontbreekt ? 'var(--red)' : geweest ? 'var(--text)' : 'var(--text-dim)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtDatum(item.datum)}
          </span>
        ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
      </td>

      {/* Naam — autofit, geen ellipsis, geen badge meer hier */}
      <td style={{ padding: '1px 8px', opacity: ontbreekt ? 0.5 : 1, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--text-h)', fontWeight: 500, fontSize: 12 }}>{item.naam}</span>
      </td>

      {/* Subcategorie badge */}
      <td style={{ padding: '1px 8px' }}>
        <span className="badge-outline" style={{ fontSize: 11 }}>{item.subcategorie}</span>
      </td>

      {/* Bedrag */}
      <td style={{ padding: '1px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {item.bedrag !== null
          ? <span style={{ color: bedragKleur(item.bedrag), fontWeight: 600, fontSize: 12 }}>{fmt(item.bedrag)}</span>
          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
      </td>

      {/* Status — bedragsafwijking + nieuw / ontbroken-maanden badge */}
      <td style={{ padding: '1px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {(item.nieuw || item.ontbrokenAantal > 0 || item.afwijkingBedrag !== null) && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            {item.afwijkingBedrag !== null && item.afwijkingBedrag !== 0 && (() => {
              // Inkomst (gemiddeldBedrag > 0): hoger werkelijk → afwijkingBedrag > 0 → gestegen.
              // Uitgave (gemiddeldBedrag < 0): meer negatief werkelijk → afwijkingBedrag < 0 → gestegen.
              const isInkomst = (item.gemiddeldBedrag ?? 0) > 0;
              const gestegen = isInkomst ? item.afwijkingBedrag > 0 : item.afwijkingBedrag < 0;
              const kleur = (isInkomst ? !gestegen : gestegen) ? 'var(--red)' : 'var(--green)';
              return (
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: kleur,
                  border: `1px solid ${kleur}`,
                  borderRadius: 10,
                  padding: '1px 6px',
                  background: 'transparent',
                }}>
                  {gestegen ? 'gestegen met ' : 'gedaald met '}{fmt(Math.abs(item.afwijkingBedrag))}
                </span>
              );
            })()}
            {item.nieuw ? (
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--blue, #3b82f6)',
                border: '1px solid var(--blue, #3b82f6)',
                borderRadius: 10,
                padding: '1px 6px',
                background: 'transparent',
              }}>
                nieuw
              </span>
            ) : item.ontbrokenAantal > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--orange, #f59e0b)',
                border: '1px solid var(--orange, #f59e0b)',
                borderRadius: 10,
                padding: '1px 6px',
                background: 'transparent',
              }}>
                {item.ontbrokenAantal === 1
                  ? 'ontbrak vorige maand'
                  : `ontbrak ${item.ontbrokenAantal} maanden`}
              </span>
            )}
          </div>
        )}
      </td>
    </>
  );
}

function Subtabel({ transacties, onBewerk, menuItems, openMenu, openContextMenu }: { transacties: VastePostTransactie[]; onBewerk: (trx: VastePostTransactie, e: React.MouseEvent) => void; menuItems: (trx: VastePostTransactie) => MenuItem[]; openMenu: (e: React.MouseEvent, key: string, items: MenuItem[]) => void; openContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void }) {
  return (
    <table style={{ fontSize: 11, borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
      <colgroup>
        <col style={{ width: 80 }} />
        <col style={{ width: 160 }} />
        <col />
        <col style={{ width: 65 }} />
        <col style={{ width: 110 }} />
        <col style={{ width: 36 }} />
      </colgroup>
      <thead>
        <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Datum</th>
          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Naam</th>
          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Omschrijving</th>
          <th style={{ textAlign: 'right', padding: '2px 10px', fontWeight: 500 }}>Bedrag</th>
          <th style={{ textAlign: 'left', padding: '2px 10px', fontWeight: 500 }}>Subcategorie</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {transacties.map(trx => {
          const omschrijving = [trx.omschrijving_1, trx.omschrijving_2, trx.omschrijving_3].filter(Boolean).join(' ') || null;
          return (
          <tr key={trx.id} onClick={e => onBewerk(trx, e)} onContextMenu={e => openContextMenu(e, menuItems(trx))} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
            <td style={{ padding: '2px 10px', whiteSpace: 'nowrap' }}>{trx.datum ? fmtDatum(trx.datum) : '—'}</td>
            <td style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trx.naam_tegenpartij ?? '—'}</td>
            <td title={omschrijving ?? undefined} style={{ padding: '2px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{omschrijving ?? '—'}</td>
            <td style={{ padding: '2px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: bedragKleur(trx.bedrag) }}>{fmt(trx.bedrag)}</td>
            <td style={{ padding: '2px 10px' }}>
              {trx.subcategorie
                ? <span className="badge-outline">{trx.subcategorie}</span>
                : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
            </td>
            <td style={{ width: 36, padding: 0, textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
              <HamburgerBtn menuKey={`vp-sub-${trx.id}`} getItems={() => menuItems(trx)} onOpen={openMenu} />
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}
