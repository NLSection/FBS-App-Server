// FILE: formatType.ts
// AANGEMAAKT: 25-03-2026 18:30
// VERSIE: 1
// GEWIJZIGD: 25-03-2026 18:30
//
// WIJZIGINGEN (25-03-2026 18:30):
// - Initiële aanmaak: centrale helper voor UI-weergave van transactietypes

export function formatType(type: string): string {
  switch (type) {
    case 'normaal-af':    return 'Normaal - AF';
    case 'normaal-bij':   return 'Normaal - BIJ';
    case 'omboeking-af':  return 'Omboeking - AF';
    case 'omboeking-bij': return 'Omboeking - BIJ';
    default:              return type;
  }
}
