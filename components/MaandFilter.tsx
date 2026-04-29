import type { Periode } from '@/lib/maandperiodes';

const MAAND_NAMEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const MAAND_KORT  = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

const jaarKnop = (actief: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  fontWeight: actief ? 600 : 400,
  background: actief ? 'var(--accent)' : 'var(--bg-card)',
  color: actief ? '#fff' : 'var(--text-dim)',
  border: actief ? '1px solid transparent' : '1px solid var(--border)',
});

interface MaandFilterProps {
  periodes: Periode[];
  geselecteerdJaar: number;
  geselecteerdePeriode: Periode | null;
  onJaarChange: (jaar: number) => void;
  onPeriodeChange: (periode: Periode | null) => void;
  toonAlle?: boolean;
  toonAlleJaren?: boolean;
  toonJaren?: boolean;
  toonMaanden?: boolean;
  alleJarenActief?: boolean;
  onAlleJaren?: () => void;
  beschikbareJaren?: number[];
  beschikbareMaanden?: number[];
}

export default function MaandFilter({
  periodes,
  geselecteerdJaar,
  geselecteerdePeriode,
  onJaarChange,
  onPeriodeChange,
  toonAlle = true,
  toonAlleJaren = false,
  toonJaren = true,
  toonMaanden = true,
  alleJarenActief = false,
  onAlleJaren,
  beschikbareJaren,
  beschikbareMaanden,
}: MaandFilterProps) {
  const jaarOpties       = [...new Set(periodes.map(p => p.jaar))].sort((a, b) => a - b)
    .filter(j => !beschikbareJaren || beschikbareJaren.includes(j));
  const periodesVoorJaar = periodes.filter(p => p.jaar === geselecteerdJaar && (!beschikbareMaanden || beschikbareMaanden.includes(p.maand)));

  return (
    <div>
      {/* Jaarknoppen */}
      {toonJaren && jaarOpties.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {toonAlleJaren && (
            <button onClick={onAlleJaren} style={jaarKnop(alleJarenActief)}>Alle</button>
          )}
          {jaarOpties.map(jaar => (
            <button
              key={jaar}
              onClick={() => onJaarChange(jaar)}
              style={jaarKnop(!alleJarenActief && geselecteerdJaar === jaar)}
            >
              {jaar}
            </button>
          ))}
        </div>
      )}

      {/* Maandknoppen */}
      {toonMaanden && periodesVoorJaar.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: toonAlle
            ? `auto repeat(${periodesVoorJaar.length}, 1fr)`
            : `repeat(${periodesVoorJaar.length}, 1fr)`,
          gap: 6,
        }}>
          {toonAlle && (
            <button
              onClick={() => onPeriodeChange(null)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, textAlign: 'center', cursor: 'pointer',
                fontWeight: !geselecteerdePeriode ? 600 : 400,
                background: !geselecteerdePeriode ? 'var(--accent)' : 'var(--bg-card)',
                color: !geselecteerdePeriode ? '#fff' : 'var(--text-dim)',
                border: !geselecteerdePeriode ? '1px solid transparent' : '1px solid var(--border)',
              }}
            >
              Alle
            </button>
          )}
          {periodesVoorJaar.map(p => {
            const geselecteerd = alleJarenActief
              ? geselecteerdePeriode?.maand === p.maand
              : geselecteerdePeriode?.jaar === p.jaar && geselecteerdePeriode?.maand === p.maand;
            const toekomstig   = p.status === 'toekomstig';
            const actueel      = p.status === 'actueel';
            const leeg         = p.heeftData === false; // maand binnen een jaar-met-data, maar zelf zonder transacties
            const niet_klikbaar = (toekomstig || leeg) && !alleJarenActief;

            let bg: string, kleur: string, border: string, cursor: string, opacity: number;
            if (geselecteerd) {
              bg = 'var(--accent)'; kleur = '#fff';
              border = '1px solid transparent'; cursor = 'pointer'; opacity = 1;
            } else if (niet_klikbaar) {
              // Toekomstige én lege maanden: zelfde uitgegrijsde stijl
              bg = 'var(--bg-card)'; kleur = 'var(--text-dim)';
              border = '1px solid var(--border)'; cursor = 'not-allowed'; opacity = 0.3;
            } else if (actueel && !alleJarenActief) {
              bg = 'transparent'; kleur = 'var(--accent)';
              border = '1px solid var(--accent)'; cursor = 'pointer'; opacity = 1;
            } else {
              bg = 'var(--bg-card)'; kleur = 'var(--text-dim)';
              border = '1px solid var(--border)'; cursor = 'pointer'; opacity = 1;
            }

            return (
              <button
                key={`${p.jaar}-${p.maand}`}
                onClick={() => !niet_klikbaar && onPeriodeChange(p)}
                style={{
                  padding: '4px 0', borderRadius: 6, fontSize: 12, textAlign: 'center',
                  fontWeight: geselecteerd ? 600 : 400,
                  background: bg, color: kleur, border, cursor, opacity,
                  pointerEvents: niet_klikbaar ? 'none' : 'auto',
                }}
              >
                <span className="maand-vol">{MAAND_NAMEN[p.maand - 1]}</span>
                <span className="maand-kort">{MAAND_KORT[p.maand - 1]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
