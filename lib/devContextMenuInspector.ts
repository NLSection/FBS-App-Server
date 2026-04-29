// Dev-only: scan huidige pagina op context-menu triggers, capture hun items,
// toon ze als overlay rechts in beeld met pijltjes naar hun anchor.
// Triggers worden herkend aan: button[title="Opties"] en [data-dev-ctx-anchor] attribuut.

import { anonimiseerHuidigePagina } from './devAnonimiseer';

interface MenuSnapshot {
  label: string;
  items: string[];
  anchor: Element | null;
  kloonHtml?: string;                               // voor modals/popovers: kloon van HTML-inhoud (thumbnail)
  thumbnail?: boolean;                              // render kloon verkleind als thumbnail
  toelichting?: string;                             // extra tekst onder thumbnail
  isContextMenu?: boolean;                          // true = echt menu, render in-place op origineelPositie
  origineelPositie?: { top: number; left: number; breedte: number; hoogte: number };
  menuHtml?: string;                                // volledige HTML kloon (alleen context menus)
}

function isPortalMenu(el: Element): boolean {
  // Skip onze eigen overlay/toolbar
  if (el.closest('[data-dev-toolbar], #dev-menu-overlay, #arrow-svg')) return false;
  if (el.id === 'dev-menu-overlay' || el.id === 'arrow-svg') return false;
  const s = (el.getAttribute('style') || '').replace(/\s+/g, '');
  // Skip backdrop-achtige elementen (inset:0 = volledig scherm)
  if (/inset:0/i.test(s)) return false;
  // Elke fixed-position popup met z-index (1000, 9000, etc.)
  return /z-?index:\d+/i.test(s) && /position:fixed/i.test(s);
}

async function sluitActiefMenu() {
  // React-safe: dispatch Escape + click op body + click op backdrop-divs + klik Annuleren in open modals.
  const escEvent = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(escEvent());
  window.dispatchEvent(escEvent());
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.body.click();
  // Klik backdrops
  [...document.querySelectorAll<HTMLElement>('div')].forEach(d => {
    if (d.closest('[data-dev-toolbar], #dev-menu-overlay, #arrow-svg')) return;
    const s = (d.getAttribute('style') || '').replace(/\s+/g, '');
    if (/position:fixed/i.test(s) && /inset:0/i.test(s) && /z-?index:9\d{2}/i.test(s)) d.click();
  });
  // Klik Annuleren/Sluit knoppen binnen open modals (CategoriePopup e.d. die geen Escape-handler hebben)
  [...document.querySelectorAll<HTMLElement>('div')].forEach(d => {
    if (d.closest('[data-dev-toolbar], #dev-menu-overlay')) return;
    const s = (d.getAttribute('style') || '').replace(/\s+/g, '');
    if (/position:fixed/i.test(s) && /inset:0/i.test(s)) {
      const annuleerBtn = [...d.querySelectorAll<HTMLButtonElement>('button')].find(b =>
        /^(annuleer|annuleren|sluit|sluiten|close|cancel|[×✕✖])$/i.test(b.innerText.trim())
      );
      annuleerBtn?.click();
    }
  });
  await new Promise(r => setTimeout(r, 150));
}

interface CaptureResult {
  items: string[];
  menuHtml?: string;
  origineelPositie?: { top: number; left: number; breedte: number; hoogte: number };
}

async function captureFromClick(btn: HTMLElement): Promise<CaptureResult | null> {
  btn.click();
  await new Promise(r => setTimeout(r, 120));
  const menu = [...document.querySelectorAll('div')].find(d => isPortalMenu(d) && (d.textContent?.length ?? 0) > 3);
  let result: CaptureResult | null = null;
  if (menu) {
    const items = [...menu.querySelectorAll('button, a')].map(b => (b as HTMLElement).innerText.trim());
    const r = menu.getBoundingClientRect();
    result = {
      items,
      menuHtml: menu.outerHTML,
      origineelPositie: { top: r.top, left: r.left, breedte: r.width, hoogte: r.height },
    };
  }
  await sluitActiefMenu();
  return result;
}

async function captureFromRightClick(el: HTMLElement): Promise<CaptureResult | null> {
  const rect = el.getBoundingClientRect();
  const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  el.dispatchEvent(evt);
  await new Promise(r => setTimeout(r, 120));
  const menu = [...document.querySelectorAll('div')].find(d => isPortalMenu(d) && (d.textContent?.length ?? 0) > 3);
  let result: CaptureResult | null = null;
  if (menu) {
    const items = [...menu.querySelectorAll('button, a')].map(b => (b as HTMLElement).innerText.trim());
    const r = menu.getBoundingClientRect();
    result = {
      items,
      menuHtml: menu.outerHTML,
      origineelPositie: { top: r.top, left: r.left, breedte: r.width, hoogte: r.height },
    };
  }
  await sluitActiefMenu();
  return result;
}

function normaliseer(items: string[]): string[] {
  // Verwijder dynamische suffixes zoals "— 2025", "— Maart 2026", "— Auto" zodat
  // filter-context-menus met wisselende labels via hash-dedup als identiek worden gezien.
  return items.map(i => i.replace(/\s*[—-]\s*.+$/, '').trim());
}
function hash(items: string[]): string {
  return normaliseer(items).join('|');
}

async function probeerExpandRijen() {
  // Klap per tabel één rij uit (met ▶ indicator = collapsed state)
  const tabellen = [...document.querySelectorAll('table')];
  let totaal = 0;
  for (const tabel of tabellen) {
    const rijen = [...tabel.querySelectorAll<HTMLTableRowElement>('tbody tr, tr')];
    for (const rij of rijen) {
      const eersteTd = rij.querySelector<HTMLElement>('td');
      if (!eersteTd) continue;
      const tekst = eersteTd.innerText || '';
      // Alleen rijen met ▶ zijn nog collapsed; ▼ = al uitgeklapt (niet opnieuw klikken)
      if (!tekst.includes('▶')) continue;
      eersteTd.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await new Promise(r => setTimeout(r, 180));
      totaal++;
      break; // slechts één rij per tabel uitklappen
    }
  }
  if (totaal > 0) anonimiseerHuidigePagina();
}

async function verzamelMenus(): Promise<MenuSnapshot[]> {
  // Probeer eerst een rij uit te klappen zodat sub-rijen zichtbaar worden
  await probeerExpandRijen();

  const snapshots: MenuSnapshot[] = [];
  const gezien = new Set<string>();

  // 1. Alle Opties-knoppen (tandwiel + hamburger) — slechts één per categorie (tandwiel / hb-hoofd / hb-sub)
  const optiesBtns = [...document.querySelectorAll<HTMLButtonElement>('button[title="Opties"]')];
  for (const btn of optiesBtns) {
    const isTandwiel = !!btn.querySelector('svg circle[r="2.5"]');
    const inSubExpand = !!btn.closest('.bls-expand');
    const categorie = isTandwiel ? 'tandwiel' : inSubExpand ? 'hb-sub' : 'hb-hoofd';
    if (gezien.has(`cat:${categorie}`)) continue;
    const cap = await captureFromClick(btn);
    if (!cap || cap.items.length === 0) continue;
    gezien.add(`cat:${categorie}`);
    gezien.add(hash(cap.items));
    const label = isTandwiel ? 'Context menu — tandwiel groep' : inSubExpand ? 'Context menu — sub-rij (hamburger)' : 'Context menu — hoofd-rij (hamburger)';
    snapshots.push({ label, items: cap.items, anchor: btn, isContextMenu: true, menuHtml: cap.menuHtml, origineelPositie: cap.origineelPositie });
  }

  // 2. Expliciet gemarkeerde triggers: data-dev-ctx-anchor="label"
  const expliciet = [...document.querySelectorAll<HTMLElement>('[data-dev-ctx-anchor]')];
  for (const el of expliciet) {
    const label = el.getAttribute('data-dev-ctx-anchor') || 'Trigger';
    if (gezien.has(`expliciet:${label}`)) continue;
    const cap = await captureFromRightClick(el);
    if (!cap || cap.items.length === 0) continue;
    gezien.add(`expliciet:${label}`);
    snapshots.push({ label, items: cap.items, anchor: el, isContextMenu: true, menuHtml: cap.menuHtml, origineelPositie: cap.origineelPositie });
  }

  // 3. RM op een rij (bewust andere rij dan die van HB-hoofd zodat pijlen niet overlappen)
  if (!gezien.has('rm-rij')) {
    const hbAnchor = snapshots.find(s => s.label.includes('hoofd-rij'))?.anchor;
    const hbRij = hbAnchor?.closest('tr');
    const kandidaatRijen = [...document.querySelectorAll<HTMLElement>('tr')]
      .filter(r => r.querySelectorAll('td').length >= 3 && r !== hbRij && !r.classList.contains('bls-expand'));
    // Kies een rij onderaan (verdere afstand = minder overlap)
    const rij = kandidaatRijen[Math.min(2, kandidaatRijen.length - 1)] || kandidaatRijen[0] || null;
    if (rij) {
      const cap = await captureFromRightClick(rij);
      if (cap && cap.items.length > 0) {
        snapshots.push({ label: 'Context menu — rechtsklik op rij', items: cap.items, anchor: rij, isContextMenu: true, menuHtml: cap.menuHtml, origineelPositie: cap.origineelPositie });
        gezien.add('rm-rij');
      }
    }
  }

  // <main> scope voor alle pagina-specifieke scans
  const main = document.querySelector('main');

  // 3b. RM op filter-knoppen (jaar/maand) — kunnen ook context menus hebben
  const filterKnoppen = main
    ? [...main.querySelectorAll<HTMLButtonElement>('[data-onboarding*="filter"] button, [data-onboarding*="maandfilter"] button')]
    : [];
  for (const btn of filterKnoppen) {
    if (gezien.has(`rm-filter:${btn.innerText.trim()}`)) continue;
    const cap = await captureFromRightClick(btn);
    if (!cap || cap.items.length === 0) continue;
    const h = hash(cap.items);
    if (gezien.has(h)) continue;
    gezien.add(h);
    gezien.add(`rm-filter:${btn.innerText.trim()}`);
    // Items generiek maken: strip " — <dynamisch>" zodat screenshot niet naar specifieke jaar/maand verwijst
    const genericItems = cap.items.map(i => i.replace(/\s*[—-]\s*.+$/, ''));
    // Menu-HTML gebruiken zoals hij is (dedup werkt al via genormaliseerde items-hash)
    snapshots.push({ label: 'Context menu — rechtsklik op filter', items: genericItems, anchor: btn, isContextMenu: true, menuHtml: cap.menuHtml, origineelPositie: cap.origineelPositie });
  }

  // 3c. Klik op data-rij: kan een modal openen (bv. CategoriePopup)
  // Voorkeur: sub-rij binnen .bls-expand (Dashboard opent daar CategoriePopup zonder rij-collapse).
  // Fallback: elke andere data-rij (Transacties heeft geen sub-expand maar popup op elke rij).
  if (!gezien.has('klik-rij')) {
    const subExpandRij = document.querySelector<HTMLElement>('.bls-expand tbody tr, .bls-expand tr');
    const dataRij = subExpandRij || [...document.querySelectorAll<HTMLElement>('tbody tr, tr')]
      .find(r => {
        const tds = r.querySelectorAll('td');
        if (tds.length < 4) return false;
        if (r.classList.contains('bls-expand')) return false;
        if (r.closest('.bls-expand')) return false;
        if (r.querySelector('th')) return false;
        // Skip uitgeklapte rijen (die hebben ▼) — clicken zou ze inklappen
        const tekst = r.querySelector('td')?.innerText || '';
        if (tekst.includes('▼')) return false;
        return true;
      });
    if (dataRij) {
      // Klik op een cel die geen onClick-stopPropagation heeft (1e of 2e td meestal veilig)
      const klikCel = dataRij.querySelector<HTMLElement>('td:not(.sticky-acties)');
      klikCel?.click();
      await new Promise(r => setTimeout(r, 400));
      // Check voor modal
      const modal = [...document.querySelectorAll<HTMLElement>('div')].find(d => {
        const s = (d.getAttribute('style') || '').replace(/\s+/g, '');
        if (d.getAttribute('role') === 'dialog') return true;
        if (/position:fixed/i.test(s) && /inset:0/i.test(s) && d.children.length > 0) {
          const panel = d.querySelector<HTMLElement>('div');
          if (!panel) return false;
          const pr = panel.getBoundingClientRect();
          return pr.width > 200 && pr.height > 100;
        }
        return false;
      });
      if (modal) {
        const panel = modal.querySelector<HTMLElement>('div') || modal;
        const kloonHtml = panel.outerHTML;
        await sluitActiefMenu();
        snapshots.push({
          label: 'Klik op rij — modal',
          items: [],
          anchor: dataRij,
          kloonHtml,
          thumbnail: true,
          toelichting: 'Bij klikken op een rij opent een modal om de categorisatie te bewerken.',
        });
        gezien.add('klik-rij');
      }
    }
  }

  // 4. Overige knoppen met title-attribuut (modal-triggers, filter-tandwielen, etc.)
  // BELANGRIJK: alleen binnen <main> scannen — nav/sidebar/dev-knoppen overslaan
  const titelBtns = main
    ? [...main.querySelectorAll<HTMLButtonElement>('button[title]')].filter(b => b.getAttribute('title') !== 'Opties')
    : [];
  for (const btn of titelBtns) {
    const title = btn.getAttribute('title') || '';
    if (gezien.has(`titel:${title}`)) continue;
    // Skip knoppen die duidelijk niet een context/modal triggeren
    if (/^(inklappen|sluit|close|annuleren|opslaan|verwijder|wissen|toepassen|volgende|vorige|terug)$/i.test(title)) continue;
    // Skip actie-knoppen (kopiëren, delen, downloaden)
    if (/kopieer|copy|deel|download|kolommen instellen/i.test(title)) continue;
    // Skip DEV-knoppen
    if (btn.innerText.startsWith('[DEV]') || title.startsWith('[DEV]')) continue;
    // Skip als het binnen onze eigen overlay/toolbar zit
    if (btn.closest('#dev-menu-overlay, [data-dev-toolbar]')) continue;
    // Skip knoppen die zich BINNEN een open modal/popup bevinden (zoals CategoriePopup)
    let inModal = false;
    let cur: Element | null = btn.parentElement;
    while (cur) {
      const s = (cur.getAttribute('style') || '').replace(/\s+/g, '');
      if (/position:fixed/i.test(s) && /inset:0/i.test(s)) { inModal = true; break; }
      cur = cur.parentElement;
    }
    if (inModal) continue;
    // Zorg dat eventuele prior modal/menu dicht is voor schone detectie
    await sluitActiefMenu();
    btn.click();
    await new Promise(r => setTimeout(r, 300));
    // Check: portal menu?
    const menu = [...document.querySelectorAll('div')].find(d => isPortalMenu(d) && (d.textContent?.length ?? 0) > 3);
    if (menu) {
      // Settings-popover: full-size kloon
      const heeftFormControls = menu.querySelector('input, select, textarea, [role="switch"]');
      if (heeftFormControls) {
        const kloonHtml = menu.outerHTML;
        await sluitActiefMenu();
        if (!gezien.has(`titel:${title}`)) {
          gezien.add(`titel:${title}`);
          snapshots.push({ label: `${title} — popover`, items: [], anchor: btn, kloonHtml });
        }
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      const items = [...menu.querySelectorAll('button, a')]
        .map(b => (b as HTMLElement).innerText.trim())
        .filter(t => t.length > 0 && !/^[×✕✖]$/.test(t));
      await sluitActiefMenu();
      if (items.length > 0) {
        const h = hash(items);
        if (!gezien.has(h)) {
          gezien.add(h);
          gezien.add(`titel:${title}`);
          snapshots.push({ label: title, items, anchor: btn });
        }
      }
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    // Check: modal? Zoek fixed-position backdrop met inset:0 (Modal component) of role="dialog"
    const modal = [...document.querySelectorAll<HTMLElement>('div')]
      .find(d => {
        const s = (d.getAttribute('style') || '').replace(/\s+/g, '');
        if (d.getAttribute('role') === 'dialog') return true;
        if (/position:fixed/i.test(s) && /inset:0/i.test(s) && d.children.length > 0) {
          // Backdrop gedetecteerd; controleer of er een panel in zit met redelijke grootte
          const panel = d.querySelector<HTMLElement>('div');
          if (!panel) return false;
          const r = panel.getBoundingClientRect();
          return r.width > 200 && r.height > 100;
        }
        return false;
      });
    if (modal) {
      // Modals met form-controls (settings-modals): toon als thumbnail + uitleg
      const heeftFormControls = modal.querySelector('input, select, textarea, [role="switch"]');
      const finaleLabel = `${title} — modal`;
      if (heeftFormControls) {
        const panel = modal.querySelector<HTMLElement>('div') || modal;
        const kloonHtml = panel.outerHTML;
        await sluitActiefMenu();
        if (!gezien.has(`titel:${title}`)) {
          gezien.add(`titel:${title}`);
          snapshots.push({ label: finaleLabel, items: [], anchor: btn, kloonHtml });
        }
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      // Geen form controls: extract button/link labels als items
      const titel = (modal.querySelector('h1, h2, h3, h4') as HTMLElement)?.innerText?.trim() || title;
      const items = [...modal.querySelectorAll<HTMLElement>('button, a')]
        .map(b => b.innerText.trim())
        .filter(t => t.length > 0 && t.length < 80)
        .filter(t => !/^[×✕✖]$|^(sluit|close|annuleren)$/i.test(t));
      const uniek = [...new Set(items)].slice(0, 10);
      const finaleItems = uniek.length > 0 ? uniek : [`Opent: ${titel}`];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      if (!gezien.has(`titel:${title}`)) {
        gezien.add(`titel:${title}`);
        snapshots.push({ label: finaleLabel, items: finaleItems, anchor: btn });
      }
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    // Geen menu of modal: skip
  }

  // Auto-thumbnail-conversie: als er zoveel modals/popovers zijn dat het niet
  // in één viewport-hoogte past, verander ze in thumbnails. Context menus blijven
  // full-size. CategoriePopup is al thumbnail. Heuristiek: elk modal kost ~600px.
  const zwareModals = snapshots.filter(s => s.kloonHtml && !s.thumbnail).length;
  const verwachteHoogte = zwareModals * 600 + snapshots.filter(s => s.isContextMenu).length * 200;
  if (verwachteHoogte > window.innerHeight) {
    snapshots.forEach(s => {
      if (s.kloonHtml && !s.thumbnail && !s.isContextMenu) {
        s.thumbnail = true;
        s.toelichting = s.toelichting || `Klikken opent deze modal/popover.`;
      }
    });
  }

  return snapshots;
}

function renderMenuOverlay(snapshots: MenuSnapshot[]) {
  document.getElementById('dev-menu-overlay')?.remove();
  document.getElementById('dev-arrow-svg')?.remove();
  document.getElementById('dev-inplace-menus')?.remove();

  // Alle snapshots gaan naar de overlay. Context menus (isContextMenu=true) renderen we
  // full-size via menuHtml; modals/popovers als thumbnail-preview-card.

  // Tabellen-gebied bepalen voor split-logica
  const tabellen = [...document.querySelectorAll('table')];
  const tabelLinks = tabellen.length > 0 ? Math.min(...tabellen.map(t => t.getBoundingClientRect().left)) : 0;
  const tabelRechts = tabellen.length > 0 ? Math.max(...tabellen.map(t => t.getBoundingClientRect().right)) : window.innerWidth;
  const tabelMidden = (tabelLinks + tabelRechts) / 2;
  const overlayBreedte = 300;
  const marge = 20;

  // Bereken anchor X positie (hetzelfde eindpunt dat de pijl gebruikt)
  const anchorEndX = (el: Element | null | undefined): number => {
    if (!el) return tabelMidden;
    const r = el.getBoundingClientRect();
    return el.tagName === 'TR' ? r.left + r.width * 0.25 : r.left + r.width / 2;
  };

  // Split snapshots op basis van anchor-X: links vs rechts van tabel-midden
  const linkerSnapshots: MenuSnapshot[] = [];
  const rechterSnapshots: MenuSnapshot[] = [];
  snapshots.forEach(s => {
    if (anchorEndX(s.anchor) < tabelMidden) linkerSnapshots.push(s);
    else rechterSnapshots.push(s);
  });
  // Elke side gesorteerd op anchor Y (top→bottom, voor non-kruisende pijlen)
  [linkerSnapshots, rechterSnapshots].forEach(arr => arr.sort((a, b) =>
    (a.anchor?.getBoundingClientRect().top ?? 0) - (b.anchor?.getBoundingClientRect().top ?? 0)
  ));

  // Overlay-container: absolute layer die beide sides bevat
  const container = document.createElement('div');
  container.id = 'dev-menu-overlay';
  container.setAttribute('data-layout', 'split');
  container.style.cssText = `position: fixed; inset: 0; z-index: 10000; pointer-events: none;`;

  // Twee side-containers
  const beschikbaarLinks = Math.max(marge, tabelLinks - marge);
  const beschikbaarRechts = window.innerWidth - tabelRechts - marge;
  const linkerSide = document.createElement('div');
  const rechterSide = document.createElement('div');
  linkerSide.style.cssText = `position: absolute; left: ${marge}px; top: 0; width: ${Math.min(overlayBreedte, beschikbaarLinks - marge)}px; height: 100%;`;
  rechterSide.style.cssText = `position: absolute; right: ${marge}px; top: 0; width: ${Math.min(overlayBreedte, beschikbaarRechts - marge)}px; height: 100%;`;
  container.appendChild(linkerSide);
  container.appendChild(rechterSide);

  // Combineer in één array voor arrow-rendering, met referentie naar side
  snapshots = [...linkerSnapshots, ...rechterSnapshots];
  const snapshotSide = new Map<MenuSnapshot, 'links' | 'rechts'>();
  linkerSnapshots.forEach(s => snapshotSide.set(s, 'links'));
  rechterSnapshots.forEach(s => snapshotSide.set(s, 'rechts'));

  const menuEls: HTMLElement[] = [];
  snapshots.forEach(s => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    const lab = document.createElement('div');
    lab.textContent = s.label;
    lab.style.cssText = 'font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;';
    wrap.appendChild(lab);
    let menu: HTMLElement;
    const htmlBron = s.kloonHtml || s.menuHtml;
    const doeThumb = !!s.thumbnail;
    if (htmlBron) {
      const tijdelijk = document.createElement('div');
      tijdelijk.innerHTML = htmlBron;
      const inner = tijdelijk.firstElementChild as HTMLElement;
      if (inner) {
        inner.style.position = 'static';
        inner.style.top = 'auto';
        inner.style.left = 'auto';
        inner.style.right = 'auto';
        inner.style.zIndex = 'auto';
        inner.style.visibility = 'visible';
        inner.style.animation = 'none';
        if (doeThumb) {
          // Geen scale — modal gewoon op natuurlijke grootte, gecapt op 300px hoogte
          inner.style.pointerEvents = 'none';
          inner.style.maxWidth = '280px';
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'max-height: 300px; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-base);';
          wrapper.appendChild(inner);
          menu = wrapper;
        } else {
          inner.style.pointerEvents = 'none';
          menu = inner;
        }
      } else {
        menu = document.createElement('div');
      }
      if (s.toelichting) {
        const t = document.createElement('p');
        t.textContent = s.toelichting;
        t.style.cssText = 'margin: 6px 0 0; font-size: 11px; color: var(--text-dim); max-width: 260px; line-height: 1.4;';
        (menu as HTMLElement & { __toelichting?: HTMLElement }).__toelichting = t;
      }
    } else {
      menu = document.createElement('div');
      menu.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.45); min-width: 240px; padding: 5px;';
      s.items.forEach(txt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = txt;
        btn.style.cssText = 'display: block; width: 100%; text-align: left; padding: 8px 12px; font-size: 13px; color: var(--text-h); background: none; border: none; border-radius: 7px;';
        menu.appendChild(btn);
      });
    }
    if (menu) {
      wrap.appendChild(menu);
      const toelichting = (menu as HTMLElement & { __toelichting?: HTMLElement }).__toelichting;
      if (toelichting) wrap.appendChild(toelichting);
    }
    const side = snapshotSide.get(s) === 'links' ? linkerSide : rechterSide;
    wrap.style.position = 'absolute';
    wrap.style.left = '0';
    wrap.style.right = '0';
    side.appendChild(wrap);
    menuEls.push(menu);
  });

  // Positioneer cards op anchor-Y per side, met collision resolution
  const positioneerSide = (side: HTMLElement, sideSnapshots: MenuSnapshot[]) => {
    const cardWraps = [...side.children] as HTMLElement[];
    let vorigeBottom = 0;
    cardWraps.forEach((w, i) => {
      const anchor = sideSnapshots[i].anchor;
      if (!anchor) return;
      const ar = anchor.getBoundingClientRect();
      const gewenste = Math.max(20, ar.top + ar.height / 2 - 15);
      const top = Math.max(gewenste, vorigeBottom + 12);
      w.style.top = `${top}px`;
      vorigeBottom = top + w.offsetHeight;
    });
  };
  const positioneer = () => {
    positioneerSide(linkerSide, linkerSnapshots);
    positioneerSide(rechterSide, rechterSnapshots);
  };
  document.body.appendChild(container);
  requestAnimationFrame(() => {
    positioneer();
    requestAnimationFrame(() => reposition());
  });
  window.addEventListener('scroll', positioneer, true);
  window.addEventListener('resize', positioneer);

  // SVG pijlen
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'dev-arrow-svg';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<marker id="dev-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff9933"/></marker>';
  svg.appendChild(defs);
  const paths = snapshots.map(() => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('stroke', '#ff9933');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('fill', 'none');
    p.setAttribute('marker-end', 'url(#dev-arrowhead)');
    p.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(p);
    return p;
  });
  document.body.appendChild(svg);

  function reposition() {
    svg.setAttribute('style', `position: fixed; top: 0; left: 0; width: ${window.innerWidth}px; height: ${window.innerHeight}px; z-index: 10001; pointer-events: none;`);
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    menuEls.forEach((menu, i) => {
      const anchor = snapshots[i].anchor;
      if (!anchor) { paths[i].setAttribute('d', ''); return; }
      const mr = menu.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      const isRij = anchor.tagName === 'TR';
      const isLinks = snapshotSide.get(snapshots[i]) === 'links';
      let startX: number, startY: number, endX: number, endY: number;
      startY = mr.top + mr.height / 2;
      if (isLinks) {
        // Card staat LINKS van anchor, pijl wijst naar rechts
        startX = mr.right + 4;
        endX = isRij ? ar.left + ar.width * 0.25 : ar.left - 6;
      } else {
        // Card staat RECHTS van anchor, pijl wijst naar links
        startX = mr.left - 4;
        endX = isRij ? ar.right - 55 : ar.right + 6;
      }
      endY = ar.top + ar.height / 2;
      const dx = Math.abs(endX - startX);
      const bend = Math.min(80, dx / 2);
      const signX = isLinks ? 1 : -1;
      paths[i].setAttribute('d', `M${startX},${startY} C${startX + signX * bend},${startY} ${endX - signX * bend},${endY} ${endX},${endY}`);
    });
  }
  reposition();
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  return () => {
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    container.remove();
    svg.remove();
    document.getElementById('dev-inplace-menus')?.remove();
    // Cleanup gebeurt automatisch bij container.remove() aangezien positioneer geen elementen selecteert buiten dat
  };
}

let actieveCleanup: (() => void) | null = null;

function maakBlokkadeOverlay(): () => void {
  const blocker = document.createElement('div');
  blocker.id = 'dev-inspector-blocker';
  blocker.style.cssText = 'position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.55); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; cursor: wait; user-select: none;';
  blocker.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:12px; color:var(--text-h); font-size:14px; font-weight:600;">
      <svg width="32" height="32" viewBox="0 0 24 24" style="animation: blk-spin 0.8s linear infinite;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="15 40" stroke-linecap="round" />
      </svg>
      <span>Context menu&apos;s verzamelen…</span>
    </div>
    <style>@keyframes blk-spin { to { transform: rotate(360deg); } }
    /* Verberg alle portal-menus terwijl we aan het verzamelen zijn, behalve onze eigen overlay */
    body > div[style*="position: fixed"]:not([data-dev-toolbar]):not(#dev-menu-overlay):not(#dev-arrow-svg):not(#dev-inspector-blocker) { visibility: hidden !important; }
    </style>
  `;
  // Vang alle events op
  ['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress', 'contextmenu'].forEach(ev => {
    blocker.addEventListener(ev, e => { e.stopPropagation(); e.preventDefault(); }, true);
  });
  document.body.appendChild(blocker);
  return () => blocker.remove();
}

export async function toggleContextMenuInspector(): Promise<boolean> {
  if (actieveCleanup) {
    actieveCleanup();
    actieveCleanup = null;
    return false;
  }
  const opruimBlokkade = maakBlokkadeOverlay();
  try {
    const snapshots = await verzamelMenus();
    actieveCleanup = renderMenuOverlay(snapshots);
  } finally {
    opruimBlokkade();
  }
  return true;
}

export function isInspectorActief(): boolean {
  return actieveCleanup !== null;
}
