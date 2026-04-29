import { formatType } from '@/lib/formatType';

// Gedeelde rendering voor het transactie/regel-type.
//
// variant='badge' (regels-tabel op de categorisatie-pagina): pill-vorm met
//   af/bij-kleur (rood/groen) en cyaan border voor omboekingen. Op die plek
//   is geen bedrag-kolom zichtbaar, dus de kleur draagt extra informatie.
// variant='plain' (transacties-, import-, aangepast-, gearchiveerd-tabellen):
//   neutrale platte tekst — daar toont de bedrag-kolom al af/bij via kleur,
//   dus extra kleur op het type zou alleen ruis toevoegen.
const ROOD_ZACHT  = 'rgba(240,82,82,0.7)';   // var(--red) #f05252
const GROEN_ZACHT = 'rgba(64,201,110,0.75)'; // var(--green) #40c96e
const OMB_ZACHT   = 'rgba(0,188,212,0.7)';   // omboekingen-categoriekleur #00BCD4

export function TypeLabel({ type, variant = 'plain' }: { type: string; variant?: 'plain' | 'badge' }) {
  if (variant !== 'badge') return <>{formatType(type)}</>;

  if (type === 'normaal-af' || type === 'normaal-bij') {
    const kleur = type === 'normaal-af' ? ROOD_ZACHT : GROEN_ZACHT;
    return (
      <span className="badge-outline" style={{ borderColor: kleur, color: kleur, borderRadius: 999 }}>
        {formatType(type)}
      </span>
    );
  }
  if (type === 'omboeking-af' || type === 'omboeking-bij') {
    const tekst = type === 'omboeking-af' ? ROOD_ZACHT : GROEN_ZACHT;
    return (
      <span className="badge-outline" style={{ borderColor: OMB_ZACHT, color: tekst, borderRadius: 999 }}>
        {formatType(type)}
      </span>
    );
  }
  return <span className="badge" style={{ borderRadius: 999 }}>{formatType(type)}</span>;
}
