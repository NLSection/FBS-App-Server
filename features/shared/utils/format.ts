export function formatBedrag(bedrag: number | null): string {
  if (bedrag === null) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

export function formatDatum(datum: string | null): string {
  if (!datum) return '—';
  const p = datum.split('-');
  if (p.length !== 3) return datum;
  return `${p[2]}-${p[1]}-${p[0]}`;
}
