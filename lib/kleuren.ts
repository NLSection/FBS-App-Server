// FILE: kleuren.ts
//
// Gedeelde kleurlogica: kleurhelpers (hex/hue conversie) en
// kiesAutomatischeKleur met 48 visueel onderscheidbare palette-kleuren.

// 48 visueel onderscheidbare kleuren — 12 hues × 4 variaties (saturatie/lichtheid)
// Volgorde geoptimaliseerd voor maximale visuele spreiding bij opeenvolgend toewijzen
const PALETTE: string[] = [
  // Ronde 1: 12 basiskleuren (hoge saturatie, middel lichtheid)
  '#e05252', '#e0a032', '#a0c040', '#40b860', '#40b8a0', '#4090d0',
  '#6060d8', '#9050d0', '#c850a8', '#d06070', '#c08830', '#60a830',
  // Ronde 2: 12 zachte varianten (middel saturatie, hoog lichtheid)
  '#e88888', '#e8c878', '#c8d888', '#78d0a0', '#78c8d0', '#88aae0',
  '#a098e0', '#c088d8', '#d888c0', '#e09098', '#d8b078', '#98c888',
  // Ronde 3: 12 diepe varianten (hoge saturatie, laag lichtheid)
  '#b03030', '#b07820', '#789028', '#208848', '#208878', '#206898',
  '#3838a8', '#6828a0', '#982878', '#a83848', '#986020', '#488020',
  // Ronde 4: 12 gedempte varianten (lage saturatie, middel lichtheid)
  '#b88080', '#b8a880', '#a0a880', '#80a890', '#80a8a8', '#8098b0',
  '#9088b0', '#a880b0', '#b080a0', '#b08888', '#b0a080', '#90a888',
];

export function hexNaarHue(hex: string): number | null {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return h * 360;
}

export function hslNaarHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function kiesRandomKleur(gebruikteKleuren: string[], huidigeKleur?: string): string {
  const gebruikt = new Set([...gebruikteKleuren, ...(huidigeKleur ? [huidigeKleur] : [])].map(k => k.toLowerCase()));
  const beschikbaar = PALETTE.filter(k => !gebruikt.has(k));
  if (beschikbaar.length === 0) return PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return beschikbaar[Math.floor(Math.random() * beschikbaar.length)];
}

export function kiesAutomatischeKleur(gebruikteKleuren: string[]): string {
  const gebruikt = new Set(gebruikteKleuren.map(k => k.toLowerCase()));
  // Pak de eerste ongebruikte kleur uit het palette
  for (const kleur of PALETTE) {
    if (!gebruikt.has(kleur)) return kleur;
  }
  // Fallback: als alle 48 op zijn, genereer op basis van hue-afstand
  const hues = gebruikteKleuren.map(hexNaarHue).filter((h): h is number => h !== null);
  let bestHue = 0, bestDist = -1;
  for (let h = 0; h < 360; h += 7) {
    const minDist = hues.length === 0
      ? 360
      : Math.min(...hues.map(eh => { const d = Math.abs(h - eh); return Math.min(d, 360 - d); }));
    if (minDist > bestDist) { bestDist = minDist; bestHue = h; }
  }
  return hslNaarHex(bestHue, 55, 50);
}
