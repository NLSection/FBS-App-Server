'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import type { TransactieMetCategorie } from '@/lib/transacties';
import type { Periode } from '@/lib/maandperiodes';
import type { PatronModalData } from '@/features/shared/components/CategoriePopup';
import CategoriePopup from '@/features/shared/components/CategoriePopup';
import { buildCategoriePopupData, bevestigCategorisatie } from '@/features/transacties/utils/categorisatieHelpers';
import { TypeLabel } from '@/features/shared/components/TypeLabel';
import { formatBedrag, formatDatum } from '@/features/shared/utils/format';

interface BudgetPotjeNaam { id: number; naam: string; kleur: string | null; rekening_ids: number[]; }
interface Rekening { id: number; naam: string; iban: string; type?: string; kleur?: string | null; }

function kleurBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

interface Props { importId: number; }

export default function ImportTransactiesSubtabel({ importId }: Props) {
  const [trx, setTrx]                             = useState<TransactieMetCategorie[] | 'laden'>('laden');
  const [reloadTrigger, setReloadTrigger]          = useState(0);
  const [patronModal, setPatronModal]              = useState<PatronModalData | null>(null);
  const [budgettenPotjes, setBudgettenPotjes]      = useState<BudgetPotjeNaam[]>([]);
  const [rekeningen, setRekeningen]                = useState<Rekening[]>([]);
  const [periodes, setPeriodes]                    = useState<Periode[]>([]);
  const [uniekeCat, setUniekeCat]                  = useState<string[]>([]);
  const [gebruikersProfiel, setGebruikersProfiel]  = useState<'potjesbeheer' | 'uitgavenbeheer' | 'handmatig' | null>(null);

  useEffect(() => {
    fetch('/api/budgetten-potjes').then(r => r.ok ? r.json() : []).then(setBudgettenPotjes).catch(() => {});
    fetch('/api/rekeningen').then(r => r.ok ? r.json() : []).then(setRekeningen).catch(() => {});
    fetch('/api/periodes').then(r => r.ok ? r.json() : []).then(setPeriodes).catch(() => {});
    fetch('/api/categorieen/uniek').then(r => r.ok ? r.json() : []).then(setUniekeCat).catch(() => {});
    fetch('/api/instellingen').then(r => r.ok ? r.json() : null).then((d: { gebruikersProfiel?: string | null } | null) => {
      const p = d?.gebruikersProfiel;
      setGebruikersProfiel((p === 'potjesbeheer' || p === 'uitgavenbeheer' || p === 'handmatig') ? p : null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setTrx('laden');
    fetch(`/api/imports/${importId}/transacties`)
      .then(r => r.ok ? r.json() : [])
      .then((data: TransactieMetCategorie[]) => setTrx(data))
      .catch(() => setTrx([]));
  }, [importId, reloadTrigger]);

  const openPopup = useCallback(async (t: TransactieMetCategorie) => {
    setPatronModal(await buildCategoriePopupData(t));
  }, []);

  async function handleBevestig() {
    if (!patronModal) return;
    const snap = patronModal;
    setPatronModal(null);
    const { hermatch } = await bevestigCategorisatie(snap);
    setReloadTrigger(n => n + 1);
    if (hermatch) hermatch.then(() => setReloadTrigger(n => n + 1));
  }

  async function handleDatumWijzig(datum: string | null) {
    if (!patronModal) return;
    await fetch(`/api/transacties/${patronModal.transactie.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datum_aanpassing: datum }),
    });
  }

  function handleVoegRekeningToe() {
    fetch('/api/rekeningen').then(r => r.ok ? r.json() : []).then(setRekeningen).catch(() => {});
  }

  if (trx === 'laden') return <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Laden…</div>;
  if (trx.length === 0) return <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Geen transacties gevonden.</div>;

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>Datum</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>IBAN eigen</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>IBAN tegen</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap', width: 250, minWidth: 250 }}>Naam tegenpartij</th>
              <th style={{ textAlign: 'right', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>Bedrag</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>Categorie</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>Subcategorie</th>
              <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500, whiteSpace: 'nowrap', minWidth: 150 }}>Omschrijving</th>
            </tr>
          </thead>
          <tbody>
            {trx.map(t => {
              const catKleur = budgettenPotjes.find(bp => bp.naam === t.categorie)?.kleur ?? 'var(--accent)';
              return (
                <tr
                  key={t.id}
                  onClick={() => openPopup(t)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: t.datum_aanpassing ? 'var(--accent)' : 'var(--text-dim)', fontSize: 12 }}
                      title={t.datum_aanpassing ? `Origineel geboekt op ${formatDatum(t.datum)}` : undefined}>
                    {t.datum_aanpassing && <Calendar size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                    {formatDatum(t.datum_aanpassing ?? t.datum)}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.iban_bban ?? '—'}
                    {t.rekening_naam && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{t.rekening_naam}</div>}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.tegenrekening_iban_bban ?? '—'}
                    {t.tegenrekening_naam && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{t.tegenrekening_naam}</div>}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-h)', fontWeight: 500, fontSize: 12, width: 250, minWidth: 250, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.handmatig_gecategoriseerd === 1 && <span style={{ color: 'var(--text-dim)', marginRight: 4, fontSize: 11 }}>🔒</span>}
                    {t.naam_tegenpartij ?? '—'}
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: (t.bedrag ?? 0) < 0 ? 'var(--red)' : 'var(--green)' }}>
                    {formatBedrag(t.bedrag)}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontSize: 12 }}>
                    <TypeLabel type={t.type} />
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    {t.categorie
                      ? <span className="badge" style={{ background: kleurBg(catKleur.startsWith('#') ? catKleur : '#6366f1'), border: `1px solid ${catKleur}`, color: catKleur }}>{t.categorie}</span>
                      : <span className="badge-outline-red">Ongecategoriseerd</span>}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    {t.subcategorie
                      ? <span className="badge-outline" style={{ borderColor: catKleur, color: catKleur }}>{t.subcategorie}</span>
                      : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 12, minWidth: 150, maxWidth: 350, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden' }}>
                    {t.toelichting && <div style={{ color: 'var(--accent)', marginBottom: 2 }}>{t.toelichting}</div>}
                    <span style={{ color: 'var(--text-dim)' }}>
                      {[t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' ') || '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {patronModal && (
        <CategoriePopup
          patronModal={patronModal}
          setPatronModal={setPatronModal}
          onBevestig={handleBevestig}
          onSluiten={() => setPatronModal(null)}
          onDatumWijzig={handleDatumWijzig}
          onVoegRekeningToe={handleVoegRekeningToe}
          onAnalyseer={async () => {
            const naam = patronModal.transactie.naam_tegenpartij;
            if (!naam) return {};
            const res = await fetch(`/api/transacties?naam_tegenpartij=${encodeURIComponent(naam)}`);
            const trns: { omschrijving_1?: string | null; omschrijving_2?: string | null; omschrijving_3?: string | null }[] = res.ok ? await res.json() : [];
            const tellers: Record<string, number> = {};
            for (const t of trns) {
              const omschr = [t.omschrijving_1, t.omschrijving_2, t.omschrijving_3].filter(Boolean).join(' ');
              const woorden = new Set(
                omschr.split(/[\s.,/()\[\]{}'"!?:;]+/)
                  .filter(w => w.length >= 1)
                  .map(w => w.toLowerCase().replace(/[^a-z0-9&-]/g, ''))
                  .filter(w => w.length > 0)
              );
              for (const w of woorden) tellers[w] = (tellers[w] ?? 0) + 1;
            }
            return tellers;
          }}
          budgettenPotjes={budgettenPotjes}
          rekeningen={rekeningen}
          periodes={periodes}
          uniekeCategorieenDropdown={uniekeCat}
          gebruikersProfiel={gebruikersProfiel}
        />
      )}
    </>
  );
}
