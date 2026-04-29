// Dev-only utility om persoons-/werkgever-gegevens en bedragen in de huidige DOM te anonimiseren.
// Alle wijzigingen zijn puur in de DOM — refresh = reset.

const NBSP = '\u00A0';

// Tracking voor idempotentie: een text-node wordt maar één keer verwerkt.
// Voorkomt dat de generieke bedrag-scaler bij herhaalde runs (MutationObserver)
// bedragen telkens opnieuw met 0.75 schaalt.
const verwerkt = new WeakSet<Text>();

// Namen + werkgevers: langste eerst zodat overlappingen correct worden vervangen
const NAAM_REGELS: Array<[string, string]> = [
  ['L.H.K. Huijten eo C.P.M. Huijten-Sleijpen', 'Jan V. eo Emma V.'],
  ['C.P.M. Huijten-Sleijpen', 'Emma Voorbeeld'],
  ['L.H.K. Huijten',          'Jan Voorbeeld'],
  ['L.H.K. HUIJTEN',          'Jan Voorbeeld'],
  ['LHK Huijten,Leroy',       'Jan Voorbeeld'],
  ['M.M.J. Huijten',          'Tim Voorbeeld'],
  ['Equa Electronics B.V.',   'Werkgever Jan'],
  ['Kwantum Nederland B.V.',  'Werkgever Emma'],
  ['EQUA Sportvergoeding',    'Sportvergoeding Jan'],
  ['Kleedgeld Carla',         'Kleedgeld Emma'],
  ['Kleedgeld Leroy',         'Kleedgeld Jan'],
  ['Kleedgeld Max',           'Kleedgeld Tim'],
  ['KLEEDGELD MAX',           'KLEEDGELD TIM'],
  ['ZAKGELD: Carla',          'ZAKGELD: Emma'],
  ['ZAKGELD: Leroy',          'ZAKGELD: Jan'],
  ['ZAKGELD: Max',            'ZAKGELD: Tim'],
  ['Eigen Rekening Carla',    'Eigen Rekening Emma'],
  ['Eigen Rekening Leroy',    'Eigen Rekening Jan'],
  ['Eigen Rekening Max',      'Eigen Rekening Tim'],
  ['Carla', 'Emma'],
  ['Leroy', 'Jan'],
  ['Max',   'Tim'],
];

// Bedragen per rij-naam (Vaste Posten)
const VASTE_POSTEN_BEDRAGEN: Record<string, string> = {
  'BUDGET: Boodschappen': '€ -500,00', 'BUDGET: Brandstof': '€ -75,00',
  'POTJE: Auto': '€ -50,00', 'POTJE: Uit Eten': '€ -125,00',
  'POTJE: Uitjes': '€ -75,00', 'POTJE: Zorg': '€ -75,00',
  'SPAARGELD: Gezamenlijk': '€ -750,00', 'SPAARGELD: Tim': '€ -75,00',
  'ZAKGELD: Emma': '€ -200,00', 'ZAKGELD: Jan': '€ -200,00', 'ZAKGELD: Tim': '€ -35,00',
  'Obvion N.V.': '€ -800,00', 'St. Stim. Volkshuisvesting Ned Gem': '€ -60,00',
  'Hesi B.V.': '€ -27,00', 'WATERLEIDING': '€ -22,00', 'ZONNEPLAN ENERGIE BV': '€ -75,00',
  'BELASTINGDIENST': '€ -23,00', 'CZ groep Zorgverzekeraar': '€ -210,00',
  'Monuta Verzekeringen N.V.': '€ -6,50', 'NH1816 VERZEKERINGEN': '€ -24,00',
  'VELDSINK ADVIES KERKRADE': '€ -113,00', 'TAF BV': '€ -22,00',
  'BSGW BELASTINGSAMENWERKING GEM EN WATERSCHAPPEN': '€ -103,00',
  'Simpel': '€ -9,50', 'STAATSLOTERIJ BY BUCKAROO': '€ -15,00',
  'hollandsnieuwe': '€ -7,00', 'Ziggo': '€ -46,00', 'VIDEOLAND': '€ -9,00',
  'TransIP B.V.': '€ -8,00', 'Sportvergoeding Jan': '€ 37,00',
  'Werkgever Jan': '€ 2.500,00', 'Werkgever Emma': '€ 1.800,00',
};

// Totalenblokken (Vaste Posten) — key = huidige waarde, value = nieuwe waarde
const TOTALEN_MAP: Record<string, string> = {
  ['€' + NBSP + '5.708,37']: '€' + NBSP + '4.337,00',
  ['€' + NBSP + '5.164,13']: '€' + NBSP + '3.835,35',
  ['€' + NBSP + '392,82']:   '€' + NBSP + '291,74',
  ['€' + NBSP + '544,24']:   '€' + NBSP + '209,91',
};

// Bedrag-patterns voor algemene cijfer-vervanging (bv. sub-rij bedragen)
const BEDRAG_VERVANGINGEN: Array<[RegExp, string]> = [
  [/3\.327,51/g, '2.500,00'],
  [/2\.330,86/g, '1.800,00'],
];

function vervangTekstNodes(mapping: Array<[string, string]>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (verwerkt.has(tn)) continue;
    let t = tn.nodeValue ?? '';
    let veranderd = false;
    for (const [oud, nieuw] of mapping) {
      if (t.includes(oud)) { t = t.split(oud).join(nieuw); veranderd = true; }
    }
    if (veranderd) tn.nodeValue = t;
  }
}

function vervangBedragInCell(cel: Element, nieuw: string) {
  const walker = document.createTreeWalker(cel, NodeFilter.SHOW_TEXT);
  let doel: Text | null = null;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (tn.nodeValue?.includes('€')) doel = tn;
  }
  if (doel) doel.nodeValue = nieuw;
}

function anonimiseerBedragenPerRij() {
  const forster: Element[] = [];
  const rabo: Element[] = [];
  document.querySelectorAll('tr').forEach(r => {
    const tds = r.querySelectorAll('td');
    if (tds.length < 5) return;
    const naam = (tds[2] as HTMLElement)?.innerText?.trim();
    const cel = tds[4];
    if (!naam || !cel) return;
    if (naam === 'V.O.F. Forster Vitaliteitscentrum') { forster.push(cel); return; }
    if (naam === 'Rabobank') { rabo.push(cel); return; }
    if (VASTE_POSTEN_BEDRAGEN[naam]) {
      vervangBedragInCell(cel, VASTE_POSTEN_BEDRAGEN[naam].replace(/€ /, '€' + NBSP));
    }
  });
  if (forster[0]) vervangBedragInCell(forster[0], '€' + NBSP + '-35,00');
  if (forster[1]) vervangBedragInCell(forster[1], '€' + NBSP + '-52,50');
  if (rabo[0])    vervangBedragInCell(rabo[0], '€' + NBSP + '-5,25');
  if (rabo[1])    vervangBedragInCell(rabo[1], '€' + NBSP + '-2,60');
}

function anonimiseerTotalen() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (verwerkt.has(tn)) continue;
    if (tn.nodeValue && TOTALEN_MAP[tn.nodeValue]) tn.nodeValue = TOTALEN_MAP[tn.nodeValue];
  }
}

function anonimiseerBedragPatterns() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (verwerkt.has(tn)) continue;
    let t = tn.nodeValue ?? '';
    let veranderd = false;
    for (const [rx, nieuw] of BEDRAG_VERVANGINGEN) {
      if (rx.test(t)) { t = t.replace(rx, nieuw); veranderd = true; }
    }
    if (veranderd) tn.nodeValue = t;
  }
}

function anonimiseerIbans() {
  const ibanRegex = /(NL\d{2}[A-Z]{4}\d{10}|LU\d{2}[A-Z0-9]{13,})/g;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (verwerkt.has(tn)) continue;
    nodes.push(tn);
  }

  const uniek = new Set<string>();
  for (const nd of nodes) {
    const matches = nd.nodeValue?.match(ibanRegex);
    if (matches) matches.forEach(m => uniek.add(m));
  }
  const map = new Map<string, string>();
  [...uniek].sort().forEach((iban, idx) => {
    const seq = String(idx + 1).padStart(10, '0');
    if (iban.startsWith('NL')) map.set(iban, `${iban.slice(0, 8)}${seq}`);
    else map.set(iban, `LU00BANK${seq}000`);
  });
  for (const nd of nodes) {
    let t = nd.nodeValue ?? '';
    let veranderd = false;
    for (const [o, nw] of map) {
      if (t.includes(o)) { t = t.split(o).join(nw); veranderd = true; }
    }
    if (veranderd) nd.nodeValue = t;
  }
}

// Generieke bedrag-scaler: vervangt elk "€ X,YY" in tekst-nodes door ~75%, afgerond.
// Behoudt opmaak (NBSP, minus, duizend-scheiding).
function anonimiseerBedragenGeneriek() {
  const bedragRegex = /€([\u00A0\s])(-?)(\d{1,3}(?:\.\d{3})*),(\d{2})/g;
  const afronden = (n: number): number => {
    const abs = Math.abs(n);
    if (abs >= 100) return Math.round(n / 5) * 5;
    if (abs >= 10)  return Math.round(n);
    return Math.round(n * 2) / 2; // op €0,50
  };
  const fmt = (n: number, spatie: string) => {
    const abs = Math.abs(n);
    const tekst = abs.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `€${spatie}${n < 0 ? '-' : ''}${tekst}`;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (verwerkt.has(tn)) continue;
    const raw = tn.nodeValue ?? '';
    if (!raw.includes('€')) continue;
    const nieuw = raw.replace(bedragRegex, (_m, sp: string, teken: string, heel: string, dec: string) => {
      const waarde = parseFloat((teken + heel.replace(/\./g, '') + '.' + dec));
      const geschaald = afronden(waarde * 0.75);
      return fmt(geschaald, sp);
    });
    if (nieuw !== raw) tn.nodeValue = nieuw;
  }
}

function markeerAlleVerwerkt() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) verwerkt.add(n as Text);
}

export function anonimiseerHuidigePagina() {
  // Volgorde belangrijk: generieke scaler eerst, daarna pagina-specifieke overrides.
  vervangTekstNodes(NAAM_REGELS);
  anonimiseerBedragenGeneriek();
  anonimiseerBedragenPerRij();      // vaste-posten specifieke waarden overschrijven
  anonimiseerTotalen();              // vaste-posten totalenblokken
  anonimiseerBedragPatterns();
  anonimiseerIbans();
  // Markeer na afloop alle tekst-nodes als verwerkt zodat een tweede run
  // (bv. via MutationObserver) alleen nieuw toegevoegde nodes aanpakt.
  markeerAlleVerwerkt();
}
