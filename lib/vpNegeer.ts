import getDb from '@/lib/db';

export interface VpNegeerRegel { regel_id: number; periode: string; }

export function getVpNegeer(): VpNegeerRegel[] {
  return getDb().prepare('SELECT regel_id, periode FROM vp_negeer').all() as VpNegeerRegel[];
}

export function addVpNegeer(regelId: number, periode: string): void {
  getDb().prepare('INSERT OR REPLACE INTO vp_negeer (regel_id, periode) VALUES (?, ?)').run(regelId, periode);
}

export function removeVpNegeer(regelId: number, periode: string): void {
  getDb().prepare('DELETE FROM vp_negeer WHERE regel_id = ? AND periode = ?').run(regelId, periode);
}
