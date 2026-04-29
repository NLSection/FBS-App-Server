'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type WachtOp =
  | 'import'            // poll app-status tot heeftImports=true
  | 'categorisatie'     // poll app-status tot heeftGecategoriseerd=true
  | 'onbekende-weg'     // wacht tot onbekende-rekeningen-modal verdwijnt
  | 'popup-open'        // wacht tot categorie-popup in DOM verschijnt
  | 'popup-weg';        // wacht tot categorie-popup verdwijnt (opgeslagen)

type Profiel = 'potjesbeheer' | 'uitgavenbeheer';

export type TekenGebied = {
  ankerSelector: string;
  relLeft: number;
  relTop: number;
  width: number;
  height: number;
};

export interface Stap {
  titel: string | Partial<Record<Profiel, string>>;
  tekst: string | Partial<Record<Profiel, string>>;
  selector?: string | null;
  extraSelectors?: string[];
  multiSelect?: boolean;
  href?: string;
  knop: string | null;
  wachtOp?: WachtOp;
  wachtTekst?: string;
  hoek?: boolean;
  ballonOnder?: boolean;
  ballonHoek?: boolean;
  afbeelding?: Partial<Record<Profiel, string>>;
  afbeelding2?: Partial<Record<Profiel, string>>;
  afbeeldingPad?: string;
  padding?: number;
  tekenGebied?: TekenGebied;
}

export type StapOverride = Partial<Pick<Stap, 'titel' | 'tekst' | 'href' | 'knop' | 'selector' | 'afbeeldingPad' | 'padding' | 'tekenGebied'>>;
export const DEV_STAP_OVERRIDES_KEY = 'dev-stap-overrides';

export function getStapOverrides(): Record<string, StapOverride> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(DEV_STAP_OVERRIDES_KEY) ?? '{}'); } catch { return {}; }
}

/** Resolve titel/tekst: als het een object is, pak de profiel-variant of fallback naar de eerste waarde */
function resolve(val: string | Partial<Record<Profiel, string>>, profiel: Profiel | null): string {
  if (typeof val === 'string') return val;
  if (profiel && val[profiel]) return val[profiel]!;
  return Object.values(val)[0] ?? '';
}

// ── Stap library ──────────────────────────────────────────────────────────────
// Elke stap is een los bouwblok, geïdentificeerd op ID.
// Tours worden samengesteld uit deze bouwblokken (zie MINI_TOURS).

export const STAP_LIBRARY: Record<string, Stap> = {
  'welkom': {
    titel: 'Welkom bij het Financieel Beheer Systeem 👋',
    tekst: 'Eindelijk grip op je financiën — zonder gedoe. Je importeert je bankafschriften, categoriseert je transacties, en ziet in één oogopslag waar je geld naartoe gaat.\n\nDeze korte rondleiding begeleidt je bij de eerste stappen. Duurt maar een paar minuten.',
    selector: null,
    knop: 'Aan de slag →',
  },
  'maand-startdag': {
    titel: 'Wanneer begint jouw maand?',
    tekst: 'FBS werkt met een instelbare maandstart. Stel dat je salaris op de 25e binnenkomt — dan wil je je financiële maand op de 26e laten beginnen. Zo vallen al je uitgaven in de maand die hoort bij het salaris waarmee je ze betaalt.\n\nKies hieronder de dag waarop jouw financiële maand begint.',
    selector: null,
    knop: null,
  },
  'profiel-keuze': {
    titel: 'Hoe wil je FBS gebruiken?',
    tekst: 'FBS kan op twee manieren worden ingezet. Kies hieronder wat het best bij jou past — de rondleiding wordt aangepast op jouw keuze.\n\nJe kunt later altijd beide functies gebruiken.',
    selector: null,
    knop: null,
  },
  'import-link': {
    titel: 'Begin met je bankafschrift',
    tekst: {
      potjesbeheer: 'Alles start met een CSV-export van je bank. Importeer de bestanden van de rekeningen waarvan je de transacties wilt monitoren — zo kan FBS overschrijvingen tussen je eigen rekeningen herkennen.\n\nKlik op "Importeer CSV" in het menu om te beginnen.',
      uitgavenbeheer: 'Alles start met een CSV-export van je bank. Download het transactie-overzicht van de rekening waarvan je de uitgaven wilt monitoren.\n\nKlik op "Importeer CSV" in het menu om te beginnen.',
    },
    selector: 'a[href="/import"]',
    href: '/import',
    knop: 'Ga naar importpagina →',
  },
  'dropzone': {
    titel: 'Sleep je bestand hierheen',
    tekst: {
      potjesbeheer: 'Sleep je gedownloade CSV-bestanden naar dit vlak, of klik erop om bestanden te kiezen. FBS verwerkt ze automatisch.\n\nNeem alleen rekeningen mee waarvan je de transacties en uitgaven wilt monitoren — je hoeft niet al je rekeningen te importeren.',
      uitgavenbeheer: 'Sleep je gedownloade CSV-bestand naar dit vlak, of klik erop om een bestand te kiezen. FBS verwerkt het automatisch.\n\nNeem alleen rekeningen mee waarvan je de uitgaven wilt monitoren — je hoeft niet al je rekeningen te importeren.',
    },
    selector: '[data-onboarding="dropzone"]',
    href: '/import',
    knop: null,
    wachtOp: 'import',
    wachtTekst: 'Wacht op import…',
  },
  'onbekende-rekeningen': {
    titel: 'Onbekende rekeningen gevonden',
    tekst: {
      potjesbeheer: 'FBS heeft rekeningen gevonden in je CSV die nog niet bekend zijn. Dit zijn de rekeningen waarvan je een transactie-export hebt gemaakt. Geef elke rekening een herkenbare naam en kies het juiste type (betaal- of spaarrekening).\n\nNa het bevestigen kun je eventuele overige eigen rekeningen toevoegen die niet in je CSV staan — denk aan spaarrekeningen of potjes waar je geld naartoe overboekt. Zo herkent FBS omboekingen en telt ze niet mee als uitgave.\n\nKlik op "Bevestigen en importeren" als je klaar bent.',
      uitgavenbeheer: 'FBS heeft rekeningen gevonden in je CSV die nog niet bekend zijn. Dit zijn de rekeningen waarvan je een transactie-export hebt gemaakt. Geef elke rekening een herkenbare naam en bevestig ze.\n\nKlik op "Bevestigen en importeren" als je klaar bent.',
    },
    selector: null,
    hoek: true,
    knop: null,
    wachtOp: 'onbekende-weg',
    wachtTekst: 'Wacht tot je de rekeningen hebt bevestigd…',
  },
  'transacties': {
    titel: 'Je transacties staan klaar',
    tekst: 'Hier zie je alle geïmporteerde transacties. Je kunt filteren op periode, rekening en categorie.\n\nElke geïmporteerde rekening krijgt standaard een eigen tabblad. Via Instellingen → Dashboard en Transacties kun je rekeningen samenvoegen tot rekeninggroepen en die als tabblad instellen.\n\nKlik op een rij om een transactie te categoriseren — dat doen we in de volgende stap.',
    selector: 'a[href="/transacties"]',
    href: '/transacties',
    knop: 'Volgende →',
  },
  'categorie-rij': {
    titel: 'Categoriseer een transactie',
    tekst: 'Klik op een ongecategoriseerde transactierij om de Categorisatie-editor te openen. Hier wijs je een categorie toe.',
    selector: '[data-onboarding="categorie-rij"]',
    multiSelect: true,
    href: '/transacties',
    knop: null,
    wachtOp: 'popup-open',
    wachtTekst: 'Klik op een transactierij…',
  },
  'popup-intro': {
    titel: 'De Categorisatie-editor',
    tekst: 'Dit is de Categorisatie-editor. Hier stel je per transactie in hoe FBS die moet categoriseren. We lopen alle onderdelen stap voor stap door.',
    selector: '[data-onboarding="popup-kaart"]',
    knop: 'Start rondleiding →',
    ballonHoek: true,
  },
  'popup-datum': {
    titel: 'Boekdatum',
    tekst: 'De boekdatum bepaalt in welke maandperiode deze transactie valt. Standaard is dit de importdatum van de bank.\n\nVoorbeeld: een betaling of omboeking op 31 januari kan bij je salarisperiode van februari horen. Met de knoppen verschuif je de transactie naar de juiste periode, of kies via het tandwiel een specifieke maand.',
    selector: '[data-onboarding="popup-datum"]',
    knop: 'Volgende →',
  },
  'popup-rekeningen': {
    titel: 'Rekeningen',
    tekst: 'Hier zie je de eigen rekening (jouw bankrekening) en de tegenrekening (de andere partij). Via het tandwiel-icoon kun je rekening-instellingen bekijken of de tegenrekening als eigen rekening toevoegen.',
    selector: '[data-onboarding="popup-rekeningen"]',
    knop: 'Volgende →',
  },
  'popup-categorie': {
    titel: 'Categorie kiezen',
    tekst: 'Kies een bestaande categorie uit de lijst, of maak een nieuwe aan via "Nieuwe categorie…". De gekozen categorie wordt opgeslagen als matchregel zodat toekomstige transacties van dezelfde tegenpartij automatisch gecategoriseerd worden.\n\nKies een categorie en klik dan op "Volgende" om door te gaan.',
    selector: '[data-onboarding="popup-categorie"]',
    knop: 'Volgende →',
  },
  'popup-rekening-koppeling': {
    titel: 'Rekening koppelen',
    tekst: 'Bij een nieuwe categorie kun je optioneel een rekening koppelen. Als je dat doet, signaleert het Dashboard automatisch wanneer een transactie van deze categorie op een andere rekening staat dan verwacht.\n\nVoorbeeld: koppel "Boodschappen" aan de rekening waar je je boodschappenbudget op bewaart. Als je boodschappen betaalt vanuit een andere rekening, signaleert FBS dat het bedrag teruggeboekt moet worden naar de budgetrekening.',
    selector: '[data-onboarding="popup-rekening-koppeling"]',
    knop: 'Volgende →',
  },
  'popup-subcategorie': {
    titel: 'Subcategorie',
    tekst: 'Elke transactie krijgt een subcategorie waarmee je de categorisatie verfijnt — bijvoorbeeld "Boodschappen › Supermarkt". Subcategorieën worden als matchregel opgeslagen zodat toekomstige transacties automatisch de juiste subcategorie krijgen.',
    selector: '[data-onboarding="popup-subcategorie"]',
    knop: 'Volgende →',
  },
  'popup-naam-match': {
    titel: 'Match op naam',
    tekst: 'Selecteer één of meer woorden uit de naam van de tegenpartij om de matchregel specifieker te maken. Zo matcht "Lidl" alle filialen in plaats van alleen een specifiek filiaal. Zonder selectie wordt de volledige naam als criterium gebruikt.',
    selector: '[data-onboarding="popup-naam-match"]',
    knop: 'Volgende →',
  },
  'popup-omschrijving-match': {
    titel: 'Match op omschrijving',
    tekst: 'Selecteer een woord uit de omschrijving als extra matchcriterium. Handig wanneer één tegenpartij meerdere soorten transacties heeft.\n\nKlik je geen enkel woord aan, dan worden er geen zoekwoorden in de categorisatieregel opgeslagen. Dat betekent dat alle transacties van deze tegenpartij hetzelfde gecategoriseerd worden.\n\nKlik "Analyseer" om te zien hoe vaak elk woord voorkomt in alle transacties van dezelfde tegenpartij — zo kun je inschatten welke woorden het meest onderscheidend zijn.',
    selector: '[data-onboarding="popup-omschrijving-match"]',
    knop: 'Volgende →',
  },
  'popup-bedrag-bereik': {
    titel: 'Match op bedrag-bereik',
    tekst: 'Beperk de matchregel tot transacties binnen een bepaald bedragbereik. Handig wanneer matchen op naam of omschrijving niet werkt — bijvoorbeeld omdat de tegenpartij per transactie een unieke omschrijving gebruikt.\n\nVoorbeeld: je hebt een PayPal-abonnement van €9,99 per maand. PayPal gebruikt voor elke transactie een unieke omschrijving, dus matchen op naam of omschrijving lukt niet. Door het bereik in te stellen op €9,99–€9,99 vang je alleen die vaste maandelijkse betaling.\n\nLet op: matching op bedrag is niet feilloos. Als er een andere PayPal-transactie van exact hetzelfde bedrag binnenkomt, wordt die ook volgens deze regel gecategoriseerd. Controleer daarom regelmatig of er geen fout-matches zijn.\n\nVul beide velden gelijk in voor een exacte match. Laat één of beide velden leeg voor een open bereik.',
    selector: '[data-onboarding="popup-bedrag-bereik"]',
    knop: 'Volgende →',
  },
  'popup-toelichting': {
    titel: 'Toelichting',
    tekst: 'Voeg een persoonlijke notitie toe aan deze transactie. De toelichting is zichtbaar in de transactielijst maar heeft geen invloed op de matchregel of categorisatie.',
    selector: '[data-onboarding="popup-toelichting"]',
    knop: 'Volgende →',
  },
  'popup-scope': {
    titel: 'Toepassen op',
    tekst: 'Kies of de categorie voor alle transacties van deze tegenpartij geldt (matchregel opslaan), of alleen voor deze ene transactie.\n\nBij "Alle transacties" maakt FBS een categorieregel aan die toekomstige transacties automatisch categoriseert. Bij "Alleen deze transactie" wordt geen regel aangemaakt — de transactie krijgt een 🔒 slotje-icoontje en verschijnt op het Aangepast-tabblad van de Categorisatiepagina.',
    selector: '[data-onboarding="popup-scope"]',
    knop: 'Volgende →',
  },
  'popup-opslaan': {
    titel: 'Opslaan',
    tekst: 'Klik op "Opslaan" om de categorisatie te bevestigen. FBS past de regel direct toe op alle transacties die aan de criteria voldoen.\n\nSla nu op om verder te gaan met de rondleiding.',
    selector: '[data-onboarding="popup-opslaan"]',
    knop: null,
    wachtOp: 'popup-weg',
    wachtTekst: 'Sla de categorisatie op…',
  },
  'felicitatie': {
    titel: 'Goed gedaan!',
    tekst: 'Je hebt zojuist je eerste transactie gecategoriseerd. FBS past deze regel direct toe op alle vergelijkbare transacties.\n\nHeb je gekozen voor "Alleen deze transactie"? Dan is er geen regel aangemaakt maar staat de transactie als handmatige aanpassing gemarkeerd. Je vindt deze terug op het Aangepast-tabblad van de Categorisatiepagina.\n\nIn de volgende stap laten we je zien hoe je categorieregels kunt aanpassen en onderhouden.',
    selector: null,
    knop: 'Verder →',
  },
  'eigen-rekeningen': {
    titel: 'Omboekingen tussen eigen rekeningen',
    tekst: {
      potjesbeheer: 'FBS herkent nu automatisch overboekingen tussen je eigen rekeningen als omboekingen. Omboekingen tellen niet mee als uitgave of inkomst — ze verschuiven alleen geld tussen je potjes.\n\nLet op: bij je eerste import worden ook terugkerende stortingen naar je budgetrekeningen als omboeking gecategoriseerd. Voorbeeld: je maakt elke maand €200 over naar je vakantiegeld-rekening of potje. FBS ziet dit als omboeking, maar jij wilt het misschien als vaste post bijhouden. Controleer dit na je eerste import en pas de categorie handmatig aan waar nodig.\n\nMis je nog een rekening? Die kun je altijd later toevoegen via Instellingen.',
      uitgavenbeheer: 'FBS herkent automatisch overboekingen tussen je eigen rekeningen als omboekingen. Die tellen niet mee in de Overzicht per Categorie — zo worden je uitgaventotalen niet vervuild door geld dat je tussen eigen rekeningen verschuift.\n\nBelangrijk: voeg alleen rekeningen toe waarvan je ook de CSV importeert. Als je een rekening toevoegt maar de transacties ervan niet importeert, worden betalingen naar die rekening als omboeking gezien en verdwijnen ze uit je categorie-overzicht.',
    },
    afbeelding: {
      potjesbeheer: '/onboarding-omboekingen.png',
      uitgavenbeheer: '/onboarding-omboekingen.png',
    },
    selector: null,
    knop: 'Volgende →',
  },
  'categorisatie-pagina': {
    titel: 'De motor achter je categorisaties',
    tekst: {
      potjesbeheer: 'FBS categoriseert transacties automatisch op basis van zoekwoorden. Op deze pagina beheer je die regels — voeg zoekwoorden toe, corrigeer verkeerde koppelingen of pas categorieën aan.',
      uitgavenbeheer: 'Dit is je controlecentrum. FBS categoriseert transacties automatisch op basis van zoekwoorden. Hoe meer regels je toevoegt, hoe minder handwerk je hebt.\n\nVoeg zoekwoorden toe, corrigeer verkeerde koppelingen of maak nieuwe categorieën aan. Een aanpassing hier werkt meteen door op al je transacties.',
    },
    selector: 'a[href="/categorisatie"]',
    href: '/categorisatie',
    knop: 'Volgende →',
  },
  'categorisatie-regel': {
    titel: 'Dit is je eerste categorieregel',
    tekst: 'Hier zie je de regel die je zojuist hebt aangemaakt. Elke kolom is direct bewerkbaar — klik op een veld om het aan te passen. Je kunt de tegenpartij, het zoekwoord, de categorie of subcategorie wijzigen.\n\nLet op: als je een regel verwijdert, worden alle transacties die via die regel gecategoriseerd waren teruggezet naar ongecategoriseerd. Die moet je dan opnieuw categoriseren via de Transactiepagina.\n\nOp deze pagina kun je bestaande regels aanpassen of verwijderen. Nieuwe regels voeg je toe door transacties te categoriseren op de Transactiepagina.',
    selector: '[data-onboarding="categorie-eerste-regel"]',
    ballonOnder: true,
    href: '/categorisatie',
    knop: 'Volgende →',
  },
  'dashboard-link': {
    titel: 'Het Dashboard',
    tekst: {
      potjesbeheer: 'Het Dashboard is je startpagina — hier zie je in één oogopslag hoe je geld verdeeld is over je rekeningen en categorieën.',
      uitgavenbeheer: 'Het Dashboard is je startpagina — hier zie je in één oogopslag waar je geld naartoe gaat.',
    },
    selector: 'a[href="/"]',
    href: '/',
    knop: 'Bekijk Dashboard →',
  },
  'dashboard-bls': {
    titel: 'Balans Budgetten en Potjes',
    tekst: {
      potjesbeheer: 'In deze tabel zie je per categorie welke transacties niet van de juiste gekoppelde rekening betaald zijn. Bedrag, Gecorrigeerd en Saldo laten zien wat er nog gecorrigeerd moet worden.',
      uitgavenbeheer: 'De Balans Budgetten en Potjes tabel toont per rekening en rekeninggroep hoeveel geld er staat. Deze tabel is standaard verborgen bij uitgavenbeheer en instelbaar via Dashboard instellingen.',
    },
    afbeelding: {
      potjesbeheer: '/onboarding-bls.png',
      uitgavenbeheer: '/onboarding-bls.png',
    },
    selector: null,
    href: '/',
    knop: 'Volgende →',
  },
  'dashboard-cat': {
    titel: 'Overzicht per Categorie',
    tekst: {
      potjesbeheer: 'In deze tabel zie je per categorie hoeveel er uitgegeven is in de geselecteerde periode. Klik op een categorie voor de subcategorieën, klik op een subcategorie voor de bijbehorende transacties.\n\nZo zie je naast je potjes ook waar je geld naartoe gaat.',
      uitgavenbeheer: 'Dit is de kern van je uitgavenbeheer. Per categorie zie je hoeveel er uitgegeven is. Klik op een categorie voor de subcategorieën, klik op een subcategorie voor de bijbehorende transacties.\n\nHoe beter je categoriseert, hoe scherper dit overzicht wordt.',
    },
    afbeelding: {
      potjesbeheer: '/onboarding-cat.png',
      uitgavenbeheer: '/onboarding-cat.png',
    },
    selector: null,
    href: '/',
    knop: 'Volgende →',
  },
  'vaste-posten-link': {
    titel: 'Vaste Posten',
    tekst: 'Op de Vaste Posten-pagina zie je alles wat maandelijks terugkomt — je abonnementen, verzekeringen, huur, salaris.\n\nBelangrijk: alleen transacties die als vaste post gecategoriseerd zijn verschijnen hier. Hoe meer je categoriseert, hoe completer dit overzicht wordt.',
    selector: 'a[href="/vaste-posten"]',
    href: '/vaste-posten',
    knop: 'Bekijk Vaste Posten →',
  },
  'vaste-posten': {
    titel: 'Terugkerende uitgaven en inkomsten',
    tekst: 'FBS signaleert automatisch als een vaste post een keer ontbreekt of afwijkt van het verwachte bedrag. Klik op een regel om alle bijbehorende transacties te zien.\n\nHet contextmenu (rechtermuisknop op een rij) biedt opties zoals samenvoegen, negeren of de weergavenaam wijzigen.\n\nVia het ⚙ tandwiel-icoon rechtsboven stel je zes dingen in: de periode voor de verwachte datum, de vergelijkperiode voor het gemiddeld bedrag, de drempel voor de afwijkings-badge, wanneer een vaste post als "nieuw" wordt gemarkeerd, hoeveel maanden teruggetoond worden in de subtabel, en na hoeveel maanden zonder transacties een vaste post automatisch verborgen wordt.',
    afbeelding: {
      potjesbeheer: '/onboarding-vaste-posten.png',
      uitgavenbeheer: '/onboarding-vaste-posten.png',
    },
    selector: null,
    href: '/vaste-posten',
    knop: 'Volgende →',
  },
  'trends-link': {
    titel: 'Trends',
    tekst: {
      potjesbeheer: 'Op de Trends-pagina zie je hoe categorieën zich over meerdere maanden ontwikkelen.',
      uitgavenbeheer: 'Dit is waar je patronen ontdekt. Op de Trends-pagina zie je hoe je uitgaven per categorie zich ontwikkelen.',
    },
    selector: 'a[href="/trends"]',
    href: '/trends',
    knop: 'Bekijk Trends →',
  },
  'trends': {
    titel: 'Hoe ontwikkelen je uitgaven zich?',
    tekst: {
      potjesbeheer: 'Trendgrafieken worden niet automatisch aangemaakt — je richt ze zelf in. Maak een trendpaneel aan per categorie of subcategorie die je wilt volgen. Zo zie je precies of je ergens structureel meer uitgeeft dan je dacht.',
      uitgavenbeheer: 'Trendgrafieken worden niet automatisch aangemaakt — je richt ze zelf in. Maak een trendpaneel aan per categorie of subcategorie die je wilt volgen. Zo zie je of je ergens structureel meer uitgeeft dan je dacht — en waar je kunt besparen.',
    },
    afbeelding: {
      potjesbeheer: '/onboarding-trends.png',
      uitgavenbeheer: '/onboarding-trends.png',
    },
    selector: null,
    href: '/trends',
    knop: 'Volgende →',
  },
  'instellingen-intro': {
    titel: 'Pas FBS aan naar jouw situatie',
    tekst: {
      potjesbeheer: 'Op de Instellingen-pagina beheer je alle configuratie van FBS. We lopen de belangrijkste secties even langs.',
      uitgavenbeheer: 'Op de Instellingen-pagina beheer je alle configuratie van FBS. We lopen de belangrijkste secties even langs.',
    },
    selector: 'a[href="/instellingen"]',
    href: '/instellingen',
    knop: 'Start rondleiding →',
  },
  'inst-startdag': {
    titel: 'Startdag financiële periode',
    tekst: 'Hier stel je in op welke dag van de maand jouw financiële periode begint. Als jouw salaris op de 25e binnenkomt, stel je hier dag 26 in — zo beginnen jouw uitgaven pas in de maand nadat je geld hebt ontvangen.\n\nOnder de instelling zie je een preview van hoe jouw huidige financiële maand eruitziet op basis van de gekozen dag.',
    selector: '[data-onboarding="inst-startdag"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-startdag-transacties': {
    titel: 'Periodenavigatie op de Transactiespagina',
    tekst: 'Met deze knoppen navigeer je door jouw financiële perioden. Elke periode loopt van de ingestelde startdag tot één dag vóór de startdag van de volgende maand.\n\nStel: startdag is de 26e. Dan loopt de periode van 26 januari t/m 25 februari — en je ziet hier de knop "Februari" voor die periode.\n\nTip: je kunt de startdag ook snel aanpassen via het ⚙ tandwiel rechts van deze filterknoppen, of via rechtermuisknop op de filterknoppen zelf.',
    selector: '[data-onboarding="transacties-maandfilter"]',
    extraSelectors: ['a[href="/transacties"]', '[data-onboarding="page-header-transacties"]'],
    href: '/transacties',
    knop: 'Volgende →',
  },
  'inst-startdag-dashboard': {
    titel: 'Periodenavigatie op het Dashboard',
    tekst: 'Ook hier werkt de periodenavigatie op basis van jouw startdag. De tabellen Balans Budgetten en Potjes en Overzicht per Categorie tonen altijd de transacties van de geselecteerde financiële periode.\n\nZo zie je precies wat er in elke salarismaand is in- en uitgegaan.',
    selector: '[data-onboarding="page-header-dashboard"]',
    extraSelectors: ['a[href="/"]', '[data-onboarding="dashboard-maandfilter"]'],
    href: '/',
    knop: 'Klaar →',
  },
  'inst-profiel': {
    titel: 'Gebruikersprofiel',
    tekst: 'Hier wissel je van gebruikersprofiel. Budgetbeheer is gericht op meerdere rekeningen en omboekingen; Uitgavenbeheer op categorisatie en uitgavenpatronen.\n\nWisselen van profiel heeft geen invloed op je bestaande data — je kiest alleen welke functies centraal staan.',
    selector: '[data-onboarding="inst-profiel"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-rondleiding': {
    titel: 'Rondleiding opnieuw starten',
    tekst: 'Met deze knop start je de volledige onboarding rondleiding opnieuw. Handig als je een stap wilt terugkijken of een tweede profiel wilt verkennen.\n\nBij een gevulde database wordt de rondleiding in de simulatiemodus uitgevoerd — je data wordt niet gewijzigd.',
    selector: '[data-onboarding="inst-rondleiding"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-minitour': {
    titel: 'Hulp & Rondleiding',
    tekst: 'Met deze schakelaar zet je de help-knoppen aan of uit. Als de help-knoppen aan staan, verschijnt er bij elke sectie een ? knop waarmee je een mini-tour voor dat onderdeel kunt starten.\n\nEen mini-tour legt één specifiek onderdeel stap-voor-stap uit — inclusief een rondleiding door de rest van de app om te laten zien wat er verandert.',
    selector: '[data-onboarding="inst-minitour"]',
    extraSelectors: ['[data-onboarding="minitour-knop"]'],
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-minitour-knop': {
    titel: 'De ? knop',
    tekst: 'Dit is zo\'n help-knop. Hij verschijnt pas als je de help-knoppen hebt ingeschakeld. Klik erop om de mini-tour voor die sectie te starten — je kunt altijd terugkomen naar een eerdere stap of de tour afsluiten.',
    selector: '[data-onboarding="minitour-knop"]',
    extraSelectors: ['[data-onboarding="inst-minitour"]'],
    href: '/instellingen',
    knop: 'Klaar →',
  },
  'inst-dashboard': {
    titel: 'Dashboard instellingen',
    tekst: 'Hier bepaal je welke tabbladen op het Dashboard verschijnen. Elk tabblad toont een rekening of een rekeninggroep — het meest linkse tabblad is de startweergave van de app.\n\nPer tabblad stel je in welke tabellen zichtbaar zijn: de Balans Budgetten en Potjes (om afwijkingen per categorie te signaleren) en de Overzicht per Categorie (om uitgaven per categorie te volgen). Daaronder kun je per tabblad kiezen of rijen standaard uitgeklapt zijn.\n\nTabbladen kun je toevoegen, verwijderen of via drag-and-drop herordenen. Bij een actief gebruikersprofiel (Budgetbeheer of Uitgavenbeheer) zijn de Balans- en Categorieën-schakelaars uitgegrijsd — die worden dan automatisch door het profiel beheerd.',
    selector: '[data-onboarding="inst-dashboard"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-transacties': {
    titel: 'Transacties instellingen',
    tekst: 'Hier beheer je de tabbladen die op de Transactiespagina zichtbaar zijn. Net als bij het Dashboard kan elk tabblad één rekening of een rekeninggroep tonen, of een overzicht van alle rekeningen samen.\n\nTabbladen kun je toevoegen, verwijderen en via drag-and-drop herordenen. Het meest linkse tabblad is de standaardweergave wanneer je naar Transacties navigeert.',
    selector: '[data-onboarding="inst-transacties"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-dashboard-bls': {
    titel: 'Balans Budgetten en Potjes',
    tekst: 'De Balans Budgetten en Potjes tabel is het financiële hart van je budgetbeheer. Per categorie zie je of de transacties in die categorie de juiste kant opgaan — op basis van de richting van de boeking en het bijbehorende saldo.\n\nEen rood saldo is je signaal: er klopt iets niet. Misschien staat een boeking in de verkeerde categorie, of gaat het geld de verkeerde kant op. Door de tabel te volgen zie je direct waar je moet ingrijpen.\n\nDe tabel is alleen zichtbaar als je hem hebt ingeschakeld via de instellingen, en als er transacties zijn in de geselecteerde periode.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-bls-indicator': {
    titel: 'Statusbalk en vinkje',
    tekst: 'De gekleurde balk aan de linkerkant van elke rij laat direct zien of een categorie aandacht nodig heeft:\n\n• Groen — het saldo klopt: de transacties gaan de verwachte kant op\n• Rood — er is een afwijking: de richting of het bedrag klopt niet\n• ✓ groen vinkje — saldo is exact nul, alles is in balans\n\nBij onduidelijkheden kun je de onderliggende transacties uitklappen om te zien wat er precies speelt.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-bls-badges': {
    titel: 'Rekening-badges en richting',
    tekst: 'Elke rij toont twee gekleurde rekening-badges met een richtingsindicator ertussen. Die combinatie vertelt je hoe een eventuele correctie uitgevoerd dient te worden:\n\n• Linker badge — de rekening waarop de transactie binnengekomen of afgeboekt is\n• Pijl — de richting van de benodigde correctie om het saldo op nul te krijgen\n• ||| — verschijnt als het saldo al nul is en er geen actie nodig is\n• Rechter badge — de rekening of het potje waar de categorie bij hoort',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-bls-bedragen': {
    titel: 'Bedrag, Gecorrigeerd en Saldo',
    tekst: 'Drie kolommen laten zien wat er speelt per categorie:\n\n• Bedrag — het ruwe totaal van alle verkeerd geboekte transacties in deze categorie voor de geselecteerde periode\n• Gecorrigeerd — het bedrag ná omboekingen of handmatige aanpassingen. Een streepje betekent dat er nog geen correctie gedaan is\n• Saldo — het bedrag dat nog gecorrigeerd moet worden. Is het positief, dan moet er geld van het potje naar de betaalrekening. Is het negatief, dan is er een overschot en moet er juist geld van de betaalrekening terug naar het potje. Een saldo van nul betekent dat alles in balans is.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-bls-uitklappen': {
    titel: 'Transacties bekijken en corrigeren',
    tekst: 'Klik op een rij om de onderliggende transacties uit te klappen. Je ziet dan precies welke boekingen het saldo veroorzaken.\n\nSta een boeking in de verkeerde categorie? Klik erop en wijs een andere categorie toe. De tabel werkt direct bij — zo zie je meteen of het saldo daarna in balans is.\n\nDit is de kernfunctie van de tabel: signaleer via het saldo wat er niet klopt, zoek de betreffende transactie op, en corrigeer direct.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-kopieer': {
    titel: 'Kopieerknop',
    tekst: 'In elke datarij staat een kopieerknopje waarmee je het saldo van die rij met één klik naar het klembord kopieert — handig om het bedrag direct in een overboeking of spreadsheet te plakken.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-instellingen': {
    titel: 'Tabel instellingen',
    tekst: 'Via het tandwiel-knopje rechtsboven in de tabel open je de tabel-instellingen. Hier kun je instellen of transacties standaard uitgeklapt zijn, en kun je de tabel uitschakelen. Wil je de tabel daarna weer zichtbaar maken, dan doe je dat via de Instellingen pagina.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-hb': {
    titel: 'Rij-menu',
    tekst: 'Elke rij heeft een klein menu-knopje aan de rechterkant. Hiermee navigeer je snel naar de bijbehorende transacties, of open je de categorie-instellingen voor die rij.\n\nHandig als je iets wilt uitzoeken of aanpassen zonder de hele pagina te verlaten.',
    href: '/',
    afbeeldingPad: '/onboarding-bls.png',
    knop: 'Volgende →',
  },
  'inst-dashboard-cat': {
    titel: 'Overzicht per Categorie',
    tekst: 'De Overzicht per Categorie is het hart van je uitgavenoverzicht. Per categorie zie je wat er die maand is uitgegeven — klik om subcategorieën te bekijken, klik nogmaals voor de transacties erachter.\n\nZo zie je direct waar je geld naartoe gaat, zonder te hoeven zoeken.',
    href: '/',
    afbeeldingPad: '/onboarding-cat.png',
    knop: 'Klaar →',
  },
  'inst-vaste-posten': {
    titel: 'Vaste Posten instellingen',
    tekst: 'Hier stel je zes dingen in:\n\n• Periode voor verwachte datum — hoeveel maanden terug FBS de gemiddelde dag berekent waarop een vaste post normaal binnenkomt.\n\n• Periode voor gemiddeld bedrag — hoeveel maanden terug het gemiddeld bedrag wordt berekend. Hierop wordt de afwijkingsbadge gebaseerd.\n\n• Drempel afwijkings-badge — vanaf welk percentage afwijking van het gemiddelde een badge "gestegen met €X" of "gedaald met €X" getoond wordt.\n\n• Periode voor "nieuw" badge — wanneer een vaste post als nieuw gezien wordt (lang niet voorgekomen).\n\n• Periode voor weergave transacties — hoeveel transacties zichtbaar zijn in de uitklapbare subtabel onder een rij.\n\n• Periode voor automatisch verbergen — na hoeveel maanden zonder transacties verdwijnt een vaste post uit het overzicht.',
    selector: '[data-onboarding="inst-vaste-posten"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-rekeningen': {
    titel: 'Rekeningen',
    tekst: {
      potjesbeheer: 'Hier beheer je al je bankrekeningen. Je kunt rekeningen toevoegen, bewerken of verwijderen. Elke rekening heeft een type (betaal/spaar).\n\nIn de kolom Gekoppelde Categorieën zie je welke categorieën aan een rekening verbonden zijn. Een koppeling betekent dat transacties van die categorie verwacht worden op deze rekening — wijkt dat af, dan verschijnt er een afwijking in de Balans Budgetten en Potjes tabel op het Dashboard. Koppelingen pas je aan via de bewerkknop per rij.\n\nVerder vind je hier ook de genegeerde rekeningen — IBAN-nummers die bij toekomstige imports automatisch worden overgeslagen.',
      uitgavenbeheer: 'Hier beheer je al je bankrekeningen. Je kunt rekeningen toevoegen, bewerken of verwijderen. Elke rekening heeft een type (betaal/spaar).\n\nVerder vind je hier ook de genegeerde rekeningen — IBAN-nummers die bij toekomstige imports automatisch worden overgeslagen.',
    },
    selector: '[data-onboarding="inst-rekeningen"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-rekeninggroepen': {
    titel: 'Rekeninggroepen',
    tekst: {
      potjesbeheer: 'Rekeninggroepen bundelen je rekeningen tot logische eenheden — bijvoorbeeld "Dagelijks" en "Sparen". Sleep rekeningen tussen groepen om ze in te delen.\n\nEen rekeninggroep heeft zelf geen directe categorie-koppelingen. De gekoppelde categorieën van de rekeningen binnen de groep worden samengevoegd wanneer de groep als tabblad op het Dashboard getoond wordt — zo zie je in één tabblad alle afwijkingen van categorieën die op rekeningen in die groep horen.\n\nRekeninggroepen worden niet automatisch ergens voor gebruikt. Je moet ze bewust als tabblad instellen via Dashboard instellingen of Transacties instellingen.',
      uitgavenbeheer: 'Rekeninggroepen bundelen je rekeningen tot logische eenheden. Ze worden niet automatisch ergens voor gebruikt — je stelt ze bewust in als tabblad via Dashboard instellingen of Transacties instellingen.',
    },
    selector: '[data-onboarding="inst-rekeninggroepen"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-categorieen': {
    titel: 'Categorisatie instellingen',
    tekst: 'Hier beheer je alles rondom categorisatie: hoe omboekingen tussen je eigen rekeningen behandeld worden, en welke categorieën en subcategorieën beschikbaar zijn.\n\nKlik op het getal in de kolom Subcategorieën om de subtabel uit te klappen en subcategorieën te beheren.',
    selector: '[data-onboarding="inst-categorieen"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-omboekingen-cat': {
    titel: 'Omboekingen categorisatie',
    tekst: {
      potjesbeheer: 'Omboekingen zijn overboekingen tussen je eigen rekeningen. Met de schakelaar Automatisch categoriseren bepaal je hoe FBS hier mee omgaat.\n\nAan: alle transacties tussen eigen rekeningen worden automatisch als Omboekingen gecategoriseerd. Voorbeeld: je boekt €500 van je betaalrekening naar je spaarrekening — FBS categoriseert dit automatisch als Omboeking.\n\nUit: geen automatische categorisatie. Gebruik Handmatige toewijzing om specifieke rekening-paren aan te wijzen. Handig als je sommige overschrijvingen wél als uitgave wilt zien.\n\nDe subcategorie wordt automatisch bepaald op basis van de omschrijving: staat "Vakantie" in de omschrijving, dan wordt Vakantie als subcategorie gebruikt — maar alleen als "Vakantie" ook als categorie bestaat in de Categorieën-tabel. Zo niet, dan blijft de subcategorie leeg.\n\nLet op: sommige instellingen hierboven kunnen uitgegrijsd zijn. Dat komt doordat ze door het actieve gebruikersprofiel (Budgetbeheer of Uitgavenbeheer) worden beheerd. Wissel van profiel via de instelling hierboven als je ze zelf wilt aanpassen.',
      uitgavenbeheer: 'Overboekingen tussen je eigen rekeningen worden bij Uitgavenbeheer standaard niet automatisch herkend als omboeking — ze verschijnen gewoon als transactie.\n\nHeb je toch meerdere rekeningen en wil je overschrijvingen daartussen apart bijhouden? Schakel dan Automatisch categoriseren in. FBS categoriseert die transacties dan als Omboekingen en telt ze niet mee als uitgave.\n\nJe kunt ook handmatig een specifiek rekening-paar koppelen via Handmatige toewijzing — handig als je alleen bepaalde overboekingen als omboeking wilt behandelen.',
    },
    afbeeldingPad: '/onboarding-omboekingen.png',
    selector: '[data-onboarding="inst-omboekingen-cat"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-categorieen-tabel': {
    titel: 'De Categorieën-tabel',
    tekst: 'Dit is de tabel waarin al je categorieën beheerd worden. Per categorie zie je de Naam, Kleur, Gekoppelde Rekeningen en het aantal Subcategorieën.\n\nNieuwe categorieën en subcategorieën maak je niet hier aan — die ontstaan tijdens het categoriseren van transacties op de Transactiespagina. In deze tabel pas je achteraf de kleur, de gekoppelde rekeningen of de naam aan.\n\nKlik op een rij om de kleur en gekoppelde rekeningen te bewerken. Categorieën met een 🔒 zijn beschermd en kunnen niet hernoemd of verwijderd worden. Hernoem je een categorie, dan wordt de nieuwe naam automatisch overal bijgewerkt — in alle categorisatieregels en transacties.',
    selector: '[data-onboarding="inst-categorieen-tabel"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-subcategorieen': {
    titel: 'Subcategorieën beheren',
    tekst: 'Klik op het aantal subcategorieën bij een categorie om de subtabel uit te klappen. Hier kun je subcategorieën hernoemen of gecontroleerd verwijderen.\n\nBij verwijderen controleert FBS of de subcategorie nog in gebruik is door categorisatieregels of aangepaste transacties. Zo ja, dan word je doorgestuurd naar de Categorisatiepagina om de betreffende regels eerst aan te passen.',
    selector: '[data-onboarding="inst-subcategorie-knop"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-developer': {
    titel: 'Developer opties',
    tekst: 'Developer options.... dont touch! 🛠️',
    selector: '[data-onboarding="inst-developer"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'inst-backup': {
    titel: 'Backup & Restore',
    tekst: 'FBS maakt automatisch een backup na elke wijziging die je maakt. Een backup is een momentopname van al je data — transacties, categorieën, rekeningen en instellingen.\n\nWe lopen de onderdelen stap voor stap door.',
    selector: '[data-onboarding="inst-backup"]',
    href: '/instellingen',
    knop: 'Start rondleiding →',
  },
  'backup-auto': {
    titel: 'Wijzigingen ongedaan maken',
    tekst: 'Elke wijziging wordt automatisch opgeslagen in het wijzigingenlog. Hier stel je in hoe lang afzonderlijke wijzigingen ongedaan kunnen worden gemaakt via "Importeer backup".\n\nVoorbeeld: bij een termijn van 30 dagen kun je elke wijziging van de afgelopen 30 dagen losstaand terugdraaien. Net voordat een wijziging die termijn overschrijdt, wordt automatisch een ankerpunt vastgelegd — een volledig backupbestand dat als basis dient voor herstel. Backups en oude ankerpunten ouder dan de bewaartermijn worden opgeruimd; alleen het meest recente ankerpunt blijft altijd staan zodat de huidige staat altijd reconstrueerbaar is.',
    selector: '[data-onboarding="backup-auto"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'backup-extern': {
    titel: 'Externe backup locatie',
    tekst: 'Stel een tweede locatie in waar backups naartoe gekopieerd worden — bijvoorbeeld een gedeelde map in OneDrive, een NAS of een USB-schijf.\n\nVoorbeeld: je stelt C:\\Users\\Jij\\OneDrive\\FBS-Backup in als externe locatie. Bij elke wijziging wordt de backup automatisch naar beide locaties geschreven.\n\nGebruik je FBS op meerdere apparaten — bijvoorbeeld een werk-laptop en een privé-pc? Stel dan op beide apparaten dezelfde OneDrive-map of netwerklocatie in als externe locatie. FBS controleert bij elke start of er een nieuwere backup beschikbaar is en vraagt of je wilt bijwerken. Zo blijven beide apparaten automatisch gesynchroniseerd.\n\nExterne backups kunnen versleuteld worden met AES-256 encryptie. Handig als de externe locatie gedeeld of openbaar toegankelijk is.',
    selector: '[data-onboarding="backup-extern"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'backup-encryptie': {
    titel: 'Versleuteling externe backups',
    tekst: 'Zodra je een externe backup-locatie hebt ingesteld, verschijnt daaronder de versleutelings-optie. Daarmee kun je de backups op de externe locatie beveiligen met AES-256 encryptie — zodat niemand zonder wachtwoord de inhoud kan lezen.\n\nNuttig als de externe locatie gedeeld wordt (bijvoorbeeld via OneDrive) of buiten je eigen netwerk staat. Lokale backups naast de database blijven altijd onversleuteld — zo houd je zelf altijd toegang tot je data.\n\nBij het instellen geef je een wachtwoord en een geheugensteun op. FBS genereert daarnaast een herstelsleutel die je eenmalig kunt bewaren. Raak je zowel het wachtwoord als de herstelsleutel kwijt, dan zijn de versleutelde externe backups niet meer te openen.\n\nGebruik je FBS op meerdere apparaten? Het eerste apparaat stelt de versleuteling in; daarna koppel je volgende apparaten met hetzelfde wachtwoord of de herstelsleutel, zodat alle apparaten dezelfde backups kunnen lezen.',
    selector: null,
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'backup-download': {
    titel: 'Download backup',
    tekst: 'Hier kun je handmatig een backup downloaden als JSON-bestand. Je kiest zelf welke tabellen je wilt meenemen.\n\nVoorbeeld: je wilt alleen je categorisatieregels exporteren om op een ander apparaat te importeren — selecteer dan alleen "Categorieregels".',
    selector: '[data-onboarding="backup-download"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'backup-restore': {
    titel: 'Importeer backup',
    tekst: 'Hier kun je een eerder gedownloade backup terugzetten. Het bestand wordt gevalideerd voordat het wordt geïmporteerd — je ziet precies hoeveel records er hersteld worden.\n\nVoorbeeld: je hebt per ongeluk categorieregels verwijderd. Download je meest recente backup, en importeer alleen de categorieregels om ze te herstellen.',
    selector: '[data-onboarding="backup-restore"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'backup-wissen': {
    titel: 'Alles Wissen',
    tekst: 'Met deze knop kun je de volledige database wissen en opnieuw beginnen. Alle transacties, categorieën, rekeningen en instellingen worden verwijderd.\n\nDit is onomkeerbaar — maak altijd eerst een backup via de downloadknop hierboven voordat je deze functie gebruikt.',
    selector: '[data-onboarding="backup-wissen"]',
    href: '/instellingen',
    knop: 'Volgende →',
  },
  'klaar': {
    titel: 'Je bent er klaar voor!',
    tekst: {
      potjesbeheer: 'Je weet nu hoe FBS werkt. Importeer de CSV-bestanden van al je rekeningen voor een compleet overzicht in de Balans Budgetten en Potjes tabel.\n\nDeze rondleiding is altijd opnieuw te starten via Instellingen → Rondleiding opnieuw starten.',
      uitgavenbeheer: 'Je weet nu hoe FBS werkt. Categoriseer je transacties en ontdek in de Overzicht per Categorie en op de Trends-pagina waar je geld naartoe gaat.\n\nDeze rondleiding is altijd opnieuw te starten via Instellingen → Rondleiding opnieuw starten.',
    },
    selector: null,
    knop: 'Klaar!',
  },
};

// ── Tour definities ────────────────────────────────────────────────────────────
// Elke tour is een geordende lijst van stap-IDs uit STAP_LIBRARY.
// Tours kunnen stappen delen — een stap is een los herbruikbaar bouwblok.

export const MINI_TOURS: Record<string, string[]> = {
  // Volledige onboarding (eigen-rekeningen wordt voor potjesbeheer dynamisch verplaatst)
  'onboarding-volledig': [
    'welkom', 'maand-startdag', 'profiel-keuze',
    'import-link', 'dropzone', 'onbekende-rekeningen',
    'transacties', 'categorie-rij',
    'popup-intro', 'popup-datum', 'popup-rekeningen', 'popup-categorie',
    'popup-rekening-koppeling', 'popup-subcategorie', 'popup-naam-match',
    'popup-omschrijving-match', 'popup-bedrag-bereik', 'popup-toelichting', 'popup-scope', 'popup-opslaan',
    'felicitatie', 'eigen-rekeningen', 'categorisatie-pagina', 'categorisatie-regel',
    'dashboard-link', 'dashboard-bls', 'dashboard-cat',
    'vaste-posten-link', 'vaste-posten', 'trends-link', 'trends',
    'instellingen-intro',
    // Volgorde matcht de visuele volgorde van secties op /instellingen:
    'inst-startdag', 'inst-profiel',                                       // AlgemeneInstellingen (bovenaan)
    'inst-dashboard', 'inst-transacties', 'inst-vaste-posten',             // Dashboard/Transacties/Vaste Posten secties
    'inst-rekeningen', 'inst-rekeninggroepen',                              // Rekeningen sectie
    'inst-categorieen', 'inst-omboekingen-cat', 'inst-categorieen-tabel', 'inst-subcategorieen', // Categorieën
    'inst-minitour', 'inst-rondleiding',                                    // Hulp & Rondleiding (komt pas na categorieën)
    'inst-developer',                                                       // (wordt in code gefilterd)
    'inst-backup', 'backup-auto', 'backup-extern', 'backup-encryptie', 'backup-download', 'backup-restore', 'backup-wissen',
    'klaar',
  ],

  // Mini-tours per sectie
  'inst-startdag':   ['inst-startdag', 'inst-startdag-transacties', 'inst-startdag-dashboard'],
  'dashboard':       ['inst-dashboard', 'inst-dashboard-bls', 'inst-dashboard-bls-indicator', 'inst-dashboard-bls-badges', 'inst-dashboard-bls-bedragen', 'inst-dashboard-bls-uitklappen', 'inst-dashboard-kopieer', 'inst-dashboard-instellingen', 'inst-dashboard-hb', 'inst-dashboard-cat'],
  'dashboard-bls':   ['inst-dashboard-bls', 'inst-dashboard-bls-indicator', 'inst-dashboard-bls-badges', 'inst-dashboard-bls-bedragen', 'inst-dashboard-bls-uitklappen', 'inst-dashboard-kopieer', 'inst-dashboard-instellingen', 'inst-dashboard-hb'],
  'dashboard-cat':   ['inst-dashboard-cat'],
  'vaste-posten':    ['inst-vaste-posten'],
  'rekeningen':      ['inst-rekeningen'],
  'rekeninggroepen': ['inst-rekeninggroepen'],
  'categorieen':     ['inst-categorieen', 'inst-omboekingen-cat', 'inst-subcategorieen'],
  'backup':          ['inst-backup', 'backup-auto', 'backup-extern', 'backup-download', 'backup-restore', 'backup-wissen'],

  // Sidebar-pagina-tours (korte context bij elke sectie in de navigatie)
  'import':          ['import-link', 'dropzone'],
  'transacties':     ['transacties', 'categorie-rij'],
  'categorisatie':   ['categorisatie-pagina', 'categorisatie-regel'],
  'trends':          ['trends'],
  'instellingen':    ['instellingen-intro', 'inst-startdag', 'inst-startdag-transacties', 'inst-startdag-dashboard', 'inst-profiel', 'inst-minitour', 'inst-rondleiding'],
};

const STORAGE_KEY  = 'onboarding-voltooid';
const PAD          = 10;

/**
 * Profiel-specifieke aanpassingen op de onboarding-volledig tour:
 * - potjesbeheer: `eigen-rekeningen` direct na `onbekende-rekeningen` schuiven
 * - uitgavenbeheer: `eigen-rekeningen` (omboekingen-uitleg) helemaal overslaan —
 *   bij dit profiel importeert de gebruiker slechts één rekening, dus omboekingen zijn niet van toepassing.
 */
export function tourstappenVoorProfiel(tourId: string, profiel: Profiel | null): string[] {
  const basis = MINI_TOURS[tourId] ?? [];
  if (tourId === 'onboarding-volledig') {
    // inst-developer zit niet in Tauri/productie builds — altijd overslaan in de tour
    const zonderDev = basis.filter(id => id !== 'inst-developer');
    if (profiel === 'potjesbeheer') {
      const zonder = zonderDev.filter(id => id !== 'eigen-rekeningen');
      const idx = zonder.indexOf('onbekende-rekeningen');
      if (idx !== -1) return [...zonder.slice(0, idx + 1), 'eigen-rekeningen', ...zonder.slice(idx + 1)];
      return zonder;
    } else if (profiel === 'uitgavenbeheer') {
      // eigen-rekeningen (omboekingen) + dashboard-bls (BLS-tabel) zijn niet van toepassing
      // bij uitgavenbeheer — de BLS-tabel staat standaard verborgen in dit profiel.
      const overslaan = new Set(['eigen-rekeningen', 'dashboard-bls']);
      return zonderDev.filter(id => !overslaan.has(id));
    }
    return zonderDev;
  }
  return basis;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [actief, setActief]         = useState(false);
  const [stapIndex, setStapIndex]   = useState(0);
  const [rect, setRect]             = useState<DOMRect | null>(null);
  const [extraRects, setExtraRects] = useState<DOMRect[]>([]);
  const [startdag, setStartdag]     = useState(1);
  const [, setDagOpgeslagen] = useState(false);
  const [dagBezig, setDagBezig]     = useState(false);
  const [profiel, setProfiel]       = useState<Profiel | null>(null);
  const [importMaand, setImportMaand] = useState<string | null>(null);
  const [terugHref, setTerugHref]     = useState<string | null>(null);
  const [activeTourId, setActiveTourId] = useState<string>('onboarding-volledig');
  const [devModus, setDevModus]         = useState(false);

  const activeTourIds = useMemo(
    () => tourstappenVoorProfiel(activeTourId, profiel),
    [activeTourId, profiel]
  );
  const vindStap  = useCallback((id: string) => activeTourIds.indexOf(id), [activeTourIds]);
  const stapId    = activeTourIds[stapIndex] ?? '';
  const stap      = useMemo(() => {
    const basis = STAP_LIBRARY[stapId];
    if (!basis) return basis;
    const overrides = getStapOverrides();
    const ov = overrides[stapId];
    return ov ? { ...basis, ...ov } : basis;
  }, [stapId]);

  const router   = useRouter();
  const pathname = usePathname();
  const observerRef  = useRef<ResizeObserver | null>(null);
  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselineRef  = useRef<{ imports: number; gecategoriseerd: number } | null>(null);
  const modalObsRef  = useRef<MutationObserver | null>(null);

  // Scroll blokkeren tijdens rondleiding
  useEffect(() => {
    if (!actief) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [actief]);

  // Start bij eerste bezoek. DB-vlag `onboardingVoltooid` is leidend (overleeft Tauri
  // dynamic port wisseling en backup-restore). localStorage dient als offline-cache.
  // Ook auto-voltooid markeren als er al data in de DB zit (bv. na backup-restore).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dev-spotlight')) return;

    (async () => {
      try {
        const r = await fetch('/api/instellingen', { cache: 'no-store' });
        const inst = r.ok ? await r.json() as { onboardingVoltooid?: boolean } : null;
        if (inst?.onboardingVoltooid) {
          localStorage.setItem(STORAGE_KEY, 'true');
          return;
        }
      } catch { /* ga verder met fallback */ }

      if (localStorage.getItem(STORAGE_KEY)) {
        // localStorage zegt voltooid maar DB niet — sync naar DB.
        fetch('/api/instellingen', { method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboardingVoltooid: true }) }).catch(() => {});
        return;
      }

      try {
        const s = await fetch('/api/app-status').then(r => r.ok ? r.json() : null);
        const heeftData = !!s && (s.heeftImports || s.heeftGecategoriseerd);
        if (heeftData) {
          localStorage.setItem(STORAGE_KEY, 'true');
          fetch('/api/instellingen', { method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onboardingVoltooid: true }) }).catch(() => {});
          return;
        }
        baselineRef.current = { imports: s?.aantalImports ?? 0, gecategoriseerd: s?.aantalGecategoriseerd ?? 0 };
        setActief(true);
      } catch {
        baselineRef.current = { imports: 0, gecategoriseerd: 0 };
        setActief(true);
      }
    })();
  }, []);

  // Herstart via custom event (DEV-knop of instellingen)
  useEffect(() => {
    function herstart() {
      localStorage.removeItem(STORAGE_KEY);
      fetch('/api/instellingen', { method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingVoltooid: false }) }).catch(() => {});
      setActiveTourId('onboarding-volledig');
      setStapIndex(0);
      setDagOpgeslagen(false);
      setStartdag(1);
      setProfiel(null);
      setActief(true);
      fetch('/api/app-status').then(r => r.ok ? r.json() : null).then((s) => {
        if (s) {
          baselineRef.current = { imports: s.aantalImports ?? 0, gecategoriseerd: s.aantalGecategoriseerd ?? 0 };
        }
      }).catch(() => { baselineRef.current = { imports: 0, gecategoriseerd: 0 }; });
    }
    window.addEventListener('onboarding-herstart', herstart);
    return () => window.removeEventListener('onboarding-herstart', herstart);
  }, []);

  // Start mini-tour via tourId
  useEffect(() => {
    function startTour(e: Event) {
      const detail = (e as CustomEvent<{ tourId: string }>).detail;
      if (!detail.tourId || !MINI_TOURS[detail.tourId]) return;
      setActiveTourId(detail.tourId);
      setStapIndex(0);
      setTerugHref(window.location.pathname);
      setActief(true);
    }
    window.addEventListener('start-mini-tour', startTour);
    return () => window.removeEventListener('start-mini-tour', startTour);
  }, []);

  // Dev: start tour op specifieke stap
  useEffect(() => {
    function onDevStart(e: Event) {
      const { tourId, stapIndex: idx } = (e as CustomEvent<{ tourId: string; stapIndex: number }>).detail;
      if (!tourId || !MINI_TOURS[tourId]) return;
      localStorage.removeItem(STORAGE_KEY);
      setActiveTourId(tourId);
      setStapIndex(idx ?? 0);
      setTerugHref(window.location.pathname);
      setDevModus(true);
      setActief(true);
    }
    window.addEventListener('dev-start-tour', onDevStart);
    return () => window.removeEventListener('dev-start-tour', onDevStart);
  }, []);

  if (!stap) return null;

  // ── Derived values ────────────────────────────────────────────────────────────
  const isPopupTour = stapId.startsWith('popup-');

  // Popup z-index verhogen tijdens mini-tour stappen (maar onder spotlight/ballon)
  useEffect(() => {
    const el = document.querySelector('[data-onboarding="categorie-popup"]') as HTMLElement | null;
    if (el && isPopupTour) {
      el.style.zIndex = '9003';
      return () => { el.style.zIndex = ''; };
    }
  }, [isPopupTour, stapIndex]);

  // Tour-lock: markeer body + spotlight-element zodat CSS in globals.css interacties blokkeert
  // buiten het gehighlighte gebied tijdens popup-tour-stappen.
  useEffect(() => {
    if (!actief || !isPopupTour) {
      document.body.removeAttribute('data-tour-popup-actief');
      document.querySelectorAll('[data-tour-spotlight]').forEach(el => el.removeAttribute('data-tour-spotlight'));
      return;
    }
    document.body.setAttribute('data-tour-popup-actief', '1');
    // Markeer huidige spotlight-element
    document.querySelectorAll('[data-tour-spotlight]').forEach(el => el.removeAttribute('data-tour-spotlight'));
    if (stapId !== 'popup-intro' && stap.selector) {
      const el = document.querySelector(stap.selector);
      if (el) el.setAttribute('data-tour-spotlight', '1');
    }
    return () => {
      document.body.removeAttribute('data-tour-popup-actief');
      document.querySelectorAll('[data-tour-spotlight]').forEach(el => el.removeAttribute('data-tour-spotlight'));
    };
  }, [actief, isPopupTour, stapId, stap.selector]);

  // Skip popup-sub-stappen waarvan het target niet in de DOM zit
  useEffect(() => {
    if (!actief || !isPopupTour || stapId === 'popup-intro') return;
    if (!stap.selector) return;
    const t = setTimeout(() => {
      if (!document.querySelector(stap.selector!)) {
        setStapIndex(s => s + 1);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [actief, stapIndex, stap.selector, stapId, isPopupTour]);

  // Subcategorieën automatisch uitklappen bij subcategorieën-stap
  useEffect(() => {
    if (!actief || stapId !== 'inst-subcategorieen') return;
    const t = setTimeout(() => {
      const el = document.querySelector('[data-onboarding="inst-subcategorie-knop"]') as HTMLElement | null;
      if (el) el.click();
    }, 300);
    return () => clearTimeout(t);
  }, [actief, stapId]);

  // Bedrag-bereik automatisch uitklappen bij bedrag-bereik-stap
  useEffect(() => {
    if (!actief || stapId !== 'popup-bedrag-bereik') return;
    const t = setTimeout(() => {
      const container = document.querySelector('[data-onboarding="popup-bedrag-bereik"]');
      if (!container) return;
      const toggle = container.querySelector('button') as HTMLElement | null;
      // Alleen klikken als de sectie nog dicht is (geen input-velden zichtbaar)
      if (toggle && !container.querySelector('input')) toggle.click();
    }, 300);
    return () => clearTimeout(t);
  }, [actief, stapId]);

  // Contextmenu tonen op eerste vaste-posten-rij
  useEffect(() => {
    if (!actief || stapId !== 'vaste-posten') return;
    const t = setTimeout(() => {
      const rij = document.querySelector('[data-onboarding="vaste-posten-rij"]') as HTMLElement | null;
      if (!rij) return;
      const r = rij.getBoundingClientRect();
      rij.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      }));
    }, 600);
    return () => clearTimeout(t);
  }, [actief, stapId]);

  // Rect bijhouden van het target element (scroll in beeld indien nodig)
  const updateRect = useCallback(() => {
    if (stap.tekenGebied) {
      const tg = stap.tekenGebied;
      const anker = document.querySelector(tg.ankerSelector);
      if (anker) {
        const ar = anker.getBoundingClientRect();
        setRect(new DOMRect(ar.left + tg.relLeft, ar.top + tg.relTop, tg.width, tg.height));
        setExtraRects([]);
      } else { setRect(null); setExtraRects([]); }
      return;
    }
    if (!stap.selector) { setRect(null); setExtraRects([]); return; }
    if (stap.multiSelect) {
      const els = Array.from(document.querySelectorAll(stap.selector));
      if (!els.length) { setRect(null); setExtraRects([]); return; }
      const rects = els.map(e => e.getBoundingClientRect());
      const union = new DOMRect(
        Math.min(...rects.map(r => r.left)),
        Math.min(...rects.map(r => r.top)),
        Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
        Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)),
      );
      setRect(union);
      setExtraRects([]);
      return;
    }
    const el = document.querySelector(stap.selector);
    if (!el) { setRect(null); setExtraRects([]); return; }
    const r = el.getBoundingClientRect();
    const extras = (stap.extraSelectors ?? [])
      .map(s => document.querySelector(s)?.getBoundingClientRect() ?? null)
      .filter((r): r is DOMRect => r !== null);
    const scrollNaarBoven = pathname === '/instellingen';
    if (scrollNaarBoven || r.top < 0 || r.bottom > window.innerHeight) {
      if (scrollNaarBoven) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        window.scrollBy({ top: -140, behavior: 'instant' });
        setRect(el.getBoundingClientRect());
        setExtraRects(extras);
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { setRect(el.getBoundingClientRect()); setExtraRects(extras); }, 400);
      }
    } else {
      setRect(r);
      setExtraRects(extras);
    }
  }, [stap.selector, stap.extraSelectors, stap.multiSelect, pathname]);

  // Helpmodus aan tijdens inst-minitour stappen, daarna terugzetten. Staat nu in DB (DIR-21).
  useEffect(() => {
    if (!actief) return;
    const helpmodus_stappen = new Set(['inst-minitour', 'inst-minitour-knop']);
    if (!helpmodus_stappen.has(stapId)) return;
    let wasAan = false;
    let actiefFlag = true;
    (async () => {
      try {
        const r = await fetch('/api/instellingen');
        if (r.ok) { const inst = await r.json(); wasAan = !!inst?.helpModus; }
      } catch { /* default uit */ }
      if (!actiefFlag) return;
      await fetch('/api/instellingen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpModus: true }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent('helpmodus-changed', { detail: { aan: true } }));
    })();
    return () => {
      actiefFlag = false;
      if (!wasAan) {
        fetch('/api/instellingen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ helpModus: false }),
        }).catch(() => {});
        window.dispatchEvent(new CustomEvent('helpmodus-changed', { detail: { aan: false } }));
      }
    };
  }, [actief, stapId]);

  // Navigeren + rect updaten bij stapwisseling
  useEffect(() => {
    if (!actief) return;
    const effectiefHref = stapId === 'transacties' && importMaand ? `/transacties?maand=${importMaand}` : stap.href;
    if (!devModus && effectiefHref && pathname !== (stap.href ?? effectiefHref)) { router.push(effectiefHref); return; }
    const t = setTimeout(updateRect, 150);
    observerRef.current?.disconnect();
    observerRef.current = new ResizeObserver(updateRect);
    observerRef.current.observe(document.body);
    const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
    if (sidebar) observerRef.current.observe(sidebar);
    let resizeTimer: ReturnType<typeof setTimeout>;
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(updateRect, 250); }
    window.addEventListener('resize', onResize);
    let mutObs: MutationObserver | undefined;
    if (isPopupTour) {
      const popup = document.querySelector('[data-onboarding="popup-kaart"]');
      if (popup) {
        mutObs = new MutationObserver(updateRect);
        mutObs.observe(popup, { childList: true, subtree: true, attributes: true });
      }
    }
    return () => { clearTimeout(t); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); observerRef.current?.disconnect(); mutObs?.disconnect(); };
  }, [actief, stapIndex, pathname, stap.href, updateRect, router, isPopupTour]);

  // Polling voor wacht-condities
  useEffect(() => {
    if (!actief || !stap.wachtOp) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    modalObsRef.current?.disconnect();

    if (stap.wachtOp === 'import') {
      modalObsRef.current = new MutationObserver(() => {
        if (document.querySelector('[data-onboarding="onbekende-rekeningen-modal"]')) {
          modalObsRef.current?.disconnect();
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStapIndex(vindStap('onbekende-rekeningen'));
        }
      });
      modalObsRef.current.observe(document.body, { childList: true, subtree: true });
    }

    pollingRef.current = setInterval(async () => {
      if (stap.wachtOp === 'import') {
        const heeftModalNu = !!document.querySelector('[data-onboarding="onbekende-rekeningen-modal"]');
        if (heeftModalNu) {
          clearInterval(pollingRef.current!);
          modalObsRef.current?.disconnect();
          setStapIndex(vindStap('onbekende-rekeningen'));
          return;
        }
        try {
          const r = await fetch('/api/app-status');
          const s = await r.json() as { heeftImports: boolean; aantalImports: number; laatsteImportDatum: string | null };
          const baseline = baselineRef.current?.imports ?? 0;
          if (baseline === 0 ? !s.heeftImports : s.aantalImports <= baseline) return;
          clearInterval(pollingRef.current!);
          modalObsRef.current?.disconnect();
          if (s.laatsteImportDatum) {
            const d = new Date(s.laatsteImportDatum);
            setImportMaand(`${d.getFullYear()}-${d.getMonth() + 1}`);
          }
          setStapIndex(vindStap('transacties'));
          router.push(s.laatsteImportDatum ? `/transacties?maand=${new Date(s.laatsteImportDatum).getFullYear()}-${new Date(s.laatsteImportDatum).getMonth() + 1}` : '/transacties');
        } catch { /* negeer */ }
      } else if (stap.wachtOp === 'onbekende-weg') {
        const heeftModal = !!document.querySelector('[data-onboarding="onbekende-rekeningen-modal"]');
        const heeftFase2 = !!document.querySelector('[data-onboarding="fase2-rekeningen"]');
        if (!heeftModal && !heeftFase2) {
          clearInterval(pollingRef.current!);
          setStapIndex(prev => prev + 1);
        }
      } else if (stap.wachtOp === 'popup-open') {
        const heeftPopup = !!document.querySelector('[data-onboarding="categorie-popup"]');
        if (heeftPopup) {
          clearInterval(pollingRef.current!);
          setStapIndex(vindStap('popup-intro'));
        }
      } else if (stap.wachtOp === 'popup-weg') {
        const heeftPopup = !!document.querySelector('[data-onboarding="categorie-popup"]');
        if (!heeftPopup) {
          clearInterval(pollingRef.current!);
          setStapIndex(prev => prev + 1);
        }
      } else if (stap.wachtOp === 'categorisatie') {
        try {
          const r = await fetch('/api/app-status');
          const s = await r.json() as { heeftGecategoriseerd: boolean; aantalGecategoriseerd: number };
          const baseline = baselineRef.current?.gecategoriseerd ?? 0;
          if (baseline === 0 ? !s.heeftGecategoriseerd : s.aantalGecategoriseerd <= baseline) return;
          clearInterval(pollingRef.current!);
          setStapIndex(prev => prev + 1);
        } catch { /* negeer */ }
      }
    }, 800);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      modalObsRef.current?.disconnect();
    };
  }, [actief, stapIndex, stap.wachtOp, router]);

  async function slaStartdagOp() {
    setDagBezig(true);
    try {
      await fetch('/api/instellingen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maandStartDag: startdag }),
      });
      // Periode-configuratie ook leggen — anders valt de backend terug op
      // default 27 voor periode-bereik berekeningen. Geldig voor alle maanden
      // (geldigVanaf '0000-01' = van het begin der tijden), gelijk aan de
      // 'alle maanden' keuze in Instellingen → Algemeen → maand-start-dag.
      await fetch('/api/periode-configuraties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maandStartDag: startdag, geldigVanaf: '0000-01' }),
      });
      setDagOpgeslagen(true);
      setStapIndex(s => s + 1);
    } catch { /* negeer */ }
    setDagBezig(false);
  }

  function volgende() {
    if (stapIndex >= activeTourIds.length - 1) afsluiten();
    else setStapIndex(s => s + 1);
  }

  function vorige() {
    if (stapIndex > 0) setStapIndex(s => s - 1);
  }

  const PROFIEL_DEFAULTS: Record<Profiel, { dashboardBlsTonen: boolean; dashboardCatTonen: boolean; omboekingenAuto: boolean }> = {
    potjesbeheer:   { dashboardBlsTonen: true,  dashboardCatTonen: true, omboekingenAuto: true  },
    uitgavenbeheer: { dashboardBlsTonen: false, dashboardCatTonen: true, omboekingenAuto: false },
  };

  async function kiesProfiel(p: Profiel) {
    setProfiel(p);
    const defaults = PROFIEL_DEFAULTS[p];
    // Awaiten vóór volgende stap: dashboard-tabs/route.ts leest gebruikersProfiel
    // uit instellingen bij het aanmaken van een tab. Zonder await kan een rekening
    // die later in de wizard wordt aangemaakt nog het OUDE profiel zien → tab krijgt
    // bls_tonen=1 en de balans-tabel blijft zichtbaar ondanks 'uitgavenbeheer'.
    try {
      await Promise.all([
        fetch('/api/instellingen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gebruikersProfiel: p, ...defaults }),
        }),
        fetch('/api/dashboard-tabs/profiel-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blsTonen: defaults.dashboardBlsTonen, catTonen: defaults.dashboardCatTonen }),
        }),
      ]);
    } catch { /* niet kritiek voor wizard-flow */ }
    setStapIndex(s => s + 1);
  }

  function afsluiten() {
    localStorage.setItem(STORAGE_KEY, 'true');
    // Persist in DB zodat Tauri dynamic port wisseling (localStorage per origin) de keuze niet wist.
    fetch('/api/instellingen', { method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingVoltooid: true }) }).catch(() => {});
    setDevModus(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (terugHref && pathname !== terugHref) {
      router.push(terugHref);
    }
    setTerugHref(null);
    setActief(false);
  }

  if (!actief) return null;

  const isEerste   = stapIndex === 0;
  const totaal     = activeTourIds.length;
  const stapTitel  = resolve(stap.titel, profiel);
  const stapTekst  = resolve(stap.tekst, profiel);
  const stapAfbeelding  = stap.afbeeldingPad ?? (stap.afbeelding && profiel ? stap.afbeelding[profiel] ?? null : null);
  const stapAfbeelding2 = stap.afbeelding2 && profiel ? stap.afbeelding2[profiel] ?? null : null;

  // ── Knoppen ─────────────────────────────────────────────────────────────────
  const knoppen = (groot = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: groot ? 28 : 16, gap: 12 }}>
      <button onClick={afsluiten} style={{ fontSize: groot ? 12 : 11, color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: groot ? '8px 16px' : '6px 12px', whiteSpace: 'nowrap' }}>
        Overslaan
      </button>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: stap.knop !== null ? 0 : undefined }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4, whiteSpace: 'nowrap' }}>{stapIndex + 1} / {totaal}</span>
        {!isEerste && stap.knop !== null && (
          <button onClick={vorige} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: groot ? '8px 16px' : '6px 12px', fontSize: groot ? 13 : 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Terug
          </button>
        )}
        {stap.knop !== null ? (
          <button onClick={volgende} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: groot ? '8px 20px' : '6px 14px', fontSize: groot ? 13 : 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {stap.knop}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'onboarding-blink 1.2s ease-in-out infinite', flexShrink: 0 }} />
            {stap.wachtTekst ?? 'Wacht…'}
          </span>
        )}
      </div>
    </div>
  );

  // ── Profielkeuze-stap (twee kaarten) ──────────────────────────────────────────
  if (stapId === 'profiel-keuze') {
    const wrapperStijl = (_p: Profiel): React.CSSProperties => ({
      flex: 1, minWidth: 200, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 10,
      cursor: 'pointer',
    });
    const kaartStijl = (p: Profiel): React.CSSProperties => ({
      width: '100%', paddingBottom: '100%', height: 0, borderRadius: 12, position: 'relative', overflow: 'hidden',
      border: profiel === p ? '2px solid var(--accent)' : '2px solid var(--border)',
      transition: 'border-color 0.15s',
    });

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 36, maxWidth: 740, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-h)', marginBottom: 8 }}>{stapTitel}</p>
          <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 24 }}>{stapTekst}</p>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Budgetbeheer kaart */}
            <div style={wrapperStijl('potjesbeheer')} onClick={() => kiesProfiel('potjesbeheer')}>
              <div style={kaartStijl('potjesbeheer')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/PotjesbeheerCard.png" alt="Budgetbeheer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Budgetbeheer</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0' }}>Budgetten · Omboekingen · Categoriekoppeling</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>Ik heb meerdere rekeningen en budgetten en wil bijhouden of uitgaven uit het juiste potje betaald worden. Omboekingen tussen eigen rekeningen worden automatisch herkend en niet als uitgave meegeteld.</p>
            </div>

            {/* Uitgavenbeheer kaart */}
            <div style={wrapperStijl('uitgavenbeheer')} onClick={() => kiesProfiel('uitgavenbeheer')}>
              <div style={kaartStijl('uitgavenbeheer')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/UitgavenbeheerCard.png" alt="Uitgavenbeheer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Uitgavenbeheer</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0' }}>Categorieën · Trends · Bestedingspatroon</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>Ik wil weten waar mijn geld naartoe gaat. Ik categoriseer mijn transacties en wil inzicht in mijn uitgavenpatroon. Gebruik je later meerdere rekeningen? Dan groeit FBS met je mee.</p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            <button onClick={afsluiten} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Overslaan
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{stapIndex + 1} / {totaal}</span>
          </div>
        </div>
        <style>{`@keyframes onboarding-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    );
  }

  // ── Hoek-modus (eigen floating kaart, geen overlay) ───
  if (stap.hoek || (stap.wachtOp && !rect)) {
    return (
      <>
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9100,
          background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 14, padding: '20px 22px', width: 320,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)', marginBottom: 10 }}>{stapTitel}</p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 0 }}>{stapTekst}</p>
          {knoppen(false)}
        </div>
        <style>{`@keyframes onboarding-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </>
    );
  }

  // ── Fullscreen paneel: uitleg links over sidebar, afbeelding(en) rechts ──────
  if (!stap.selector && stapAfbeelding) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.72)', display: 'flex' }}>
        <div style={{
          width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '36px 28px 36px 24px', zIndex: 1,
        }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-h)', marginBottom: 14 }}>{stapTitel}</p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 0 }}>{stapTekst}</p>
          {knoppen(true)}
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '24px 32px', overflow: 'hidden',
        }}>
          <img src={stapAfbeelding} alt="" style={{ maxWidth: stapAfbeelding2 ? 'calc(50% - 8px)' : '100%', maxHeight: 'calc(100vh - 80px)', objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)' }} />
          {stapAfbeelding2 && <img src={stapAfbeelding2} alt="" style={{ maxWidth: 'calc(50% - 8px)', maxHeight: 'calc(100vh - 80px)', objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)' }} />}
        </div>
        <style>{`@keyframes onboarding-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    );
  }

  // ── Gecentreerde modal (geen target of niet gevonden) ────────────────────────
  if (!rect) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 36, maxWidth: stapAfbeelding ? 720 : 480, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-h)', marginBottom: 14 }}>{stapTitel}</p>
          <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: stapId === 'maand-startdag' ? 20 : 0 }}>{stapTekst}</p>
          {stapAfbeelding && <img src={stapAfbeelding} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginTop: 14 }} />}
          {stapAfbeelding2 && <img src={stapAfbeelding2} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginTop: 10 }} />}
          {stapId === 'maand-startdag' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <label style={{ fontSize: 14, color: 'var(--text-h)', fontWeight: 600, whiteSpace: 'nowrap' }}>Maand begint op dag</label>
              <select
                value={startdag}
                onChange={e => { setStartdag(Number(e.target.value)); setDagOpgeslagen(false); }}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-h)', fontSize: 14, cursor: 'pointer', colorScheme: 'dark' }}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <button
                onClick={slaStartdagOp}
                disabled={dagBezig}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: dagBezig ? 'default' : 'pointer', opacity: dagBezig ? 0.7 : 1 }}
              >
                {dagBezig ? 'Opslaan…' : 'Opslaan en doorgaan →'}
              </button>
            </div>
          )}
          {stapId !== 'maand-startdag' && knoppen(true)}
          {stapId === 'maand-startdag' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <button onClick={afsluiten} style={{ fontSize: 12, color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '8px 16px', whiteSpace: 'nowrap' }}>
                Overslaan
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{stapIndex + 1} / {totaal}</span>
            </div>
          )}
        </div>
        <style>{`@keyframes onboarding-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    );
  }

  // ── Spotlight modus ──────────────────────────────────────────────────────────
  const effectiefPAD = stap.padding ?? PAD;
  const sTop  = rect.top    - effectiefPAD;
  const sLeft = rect.left   - effectiefPAD;
  const sRight  = rect.right  + effectiefPAD;
  const sBottom = rect.bottom + effectiefPAD;
  const sW = rect.width  + effectiefPAD * 2;
  const sH = rect.height + effectiefPAD * 2;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  const ballonW    = stapAfbeelding ? 520 : 440;
  const ballonMaxH = stapAfbeelding ? 600 : 360;
  const marge      = 16;

  let ballonLeft: number;
  let ballonTop: number;

  if (stap.ballonHoek) {
    ballonLeft = winW - ballonW - marge;
    ballonTop  = winH - ballonMaxH - marge;
  } else if (stap.ballonOnder) {
    ballonLeft = Math.max(marge, Math.min(sLeft + sW / 2 - ballonW / 2, winW - ballonW - marge));
    ballonTop  = Math.max(marge, Math.min(sBottom + marge, winH - ballonMaxH - marge));
  } else if (winW - sRight - marge >= ballonW + marge) {
    ballonLeft = sRight + marge;
    ballonTop  = Math.max(marge, Math.min(sTop + sH / 2 - ballonMaxH / 2, winH - ballonMaxH - marge));
  } else if (sLeft - marge >= ballonW + marge) {
    ballonLeft = sLeft - ballonW - marge;
    ballonTop  = Math.max(marge, Math.min(sTop + sH / 2 - ballonMaxH / 2, winH - ballonMaxH - marge));
  } else if (sTop - marge >= ballonMaxH) {
    ballonLeft = Math.max(marge, Math.min(sLeft + sW / 2 - ballonW / 2, winW - ballonW - marge));
    ballonTop  = sTop - ballonMaxH - marge;
  } else {
    ballonLeft = Math.max(marge, Math.min(sLeft + sW / 2 - ballonW / 2, winW - ballonW - marge));
    ballonTop  = Math.max(marge, Math.min(sBottom + marge, winH - ballonMaxH - marge));
  }

  return (
    <>
      {/* Donkere overlay — SVG mask ondersteunt meerdere cutouts (verborgen bij popup-tour) */}
      {!isPopupTour && (() => { const noPointer = !!stap.wachtOp; return (
        <svg
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 9000, pointerEvents: noPointer ? 'none' : 'auto' }}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={sLeft} y={sTop} width={sW} height={sH} rx={10} fill="black" />
              {extraRects.map((er, i) => (
                <rect key={i} x={er.left - PAD} y={er.top - PAD} width={er.width + PAD * 2} height={er.height + PAD * 2} rx={6} fill="black" />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#spotlight-mask)" />
        </svg>
      ); })()}

      {/* Spotlight rand — primair element */}
      <div style={{
        position: 'fixed', top: sTop, left: sLeft, width: sW, height: sH,
        border: '2px solid var(--accent)', borderRadius: 10,
        zIndex: isPopupTour ? 9004 : 9001, pointerEvents: 'none',
        animation: 'onboarding-pulse 2s ease-in-out infinite',
      }} />

      {/* Spotlight randen — extra elementen */}
      {extraRects.map((er, i) => (
        <div key={i} style={{
          position: 'fixed',
          top: er.top - PAD, left: er.left - PAD,
          width: er.width + PAD * 2, height: er.height + PAD * 2,
          border: '2px solid var(--accent)', borderRadius: 6,
          zIndex: 9001, pointerEvents: 'none',
          animation: 'onboarding-pulse 2s ease-in-out infinite',
        }} />
      ))}

      {/* Ballon */}
      <div style={{
        position: 'fixed', top: ballonTop, left: ballonLeft, width: ballonW,
        maxHeight: winH - ballonTop - marge, overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 22px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: isPopupTour ? 9005 : 9002,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0, flex: 1 }}>{stapTitel}</p>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 0 }}>{stapTekst}</p>
        {stapAfbeelding && <img src={stapAfbeelding} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)', marginTop: 10 }} />}
        {stapAfbeelding2 && <img src={stapAfbeelding2} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)', marginTop: 8 }} />}
        {knoppen(false)}
      </div>

      <style>{`
        @keyframes onboarding-pulse {
          0%,100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent); }
          50%      { box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 10%, transparent); }
        }
        @keyframes onboarding-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </>
  );
}
