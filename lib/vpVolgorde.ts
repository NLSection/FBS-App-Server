import getDb from '@/lib/db';

export function getVpVolgorde(periodeSleutel: string): Map<string, number> {
  const db = getDb();
  const rows = db.prepare('SELECT sleutel, periode, volgorde FROM vp_volgorde').all() as { sleutel: string; periode: string; volgorde: number }[];

  const permanent = new Map<string, number>();
  const vanaf     = new Map<string, { af: string; volgorde: number }>();
  const exact     = new Map<string, number>();

  for (const r of rows) {
    if (r.periode === 'permanent') {
      permanent.set(r.sleutel, r.volgorde);
    } else if (r.periode.startsWith('vanaf:')) {
      const af = r.periode.slice(6);
      if (periodeSleutel >= af) {
        const bestaand = vanaf.get(r.sleutel);
        if (!bestaand || af > bestaand.af) vanaf.set(r.sleutel, { af, volgorde: r.volgorde });
      }
    } else if (r.periode === periodeSleutel) {
      exact.set(r.sleutel, r.volgorde);
    }
  }

  // Prioriteit: permanent → vanaf (meest recent) → exacte maand (hoogste wint)
  const result = new Map<string, number>();
  for (const [k, v] of permanent) result.set(k, v);
  for (const [k, v] of vanaf)     result.set(k, v.volgorde);
  for (const [k, v] of exact)     result.set(k, v);
  return result;
}

export function saveVpVolgorde(items: { sleutel: string; volgorde: number }[], periode: string): void {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO vp_volgorde (sleutel, periode, volgorde) VALUES (?, ?, ?)');
  db.transaction(() => { for (const v of items) stmt.run(v.sleutel, periode, v.volgorde); })();
}
