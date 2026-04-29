import { NextResponse } from 'next/server';
import os from 'os';

type Server = { ip: string; schemaVersion: number | null };

const SCAN_PORT = 3210;
const HOST_TIMEOUT_MS = 600;

function detectSubnet(): { base: string; mask: string; iface: string } | null {
  const ifaces = os.networkInterfaces();
  const candidates: { base: string; mask: string; iface: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address;
      const netmask = a.netmask;
      if (!netmask.startsWith('255.255.255.')) continue;
      const ipParts = ip.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) continue;
      const base = ipParts.map((p, i) => p & maskParts[i]).join('.');
      let score = 100;
      const nameLower = name.toLowerCase();
      if (nameLower.includes('vethernet') || nameLower.includes('docker') || nameLower.includes('vmware') || nameLower.includes('virtualbox') || nameLower.includes('hyper-v')) score -= 80;
      if (ip.startsWith('169.254.')) score -= 90;
      candidates.push({ base, mask: netmask, iface: name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

async function probe(ip: string): Promise<Server | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HOST_TIMEOUT_MS);
  try {
    const r = await fetch(`http://${ip}:${SCAN_PORT}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const data = (await r.json()) as { ok?: boolean; app?: string; schemaVersion?: number };
    if (data.app !== 'fbs') return null;
    return { ip, schemaVersion: data.schemaVersion ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const subnet = detectSubnet();
  if (!subnet) {
    return NextResponse.json({ ok: false, error: 'no_subnet_detected' }, { status: 200 });
  }
  const baseParts = subnet.base.split('.').map(Number);
  const targets: string[] = [];
  for (let i = 1; i <= 254; i++) {
    targets.push(`${baseParts[0]}.${baseParts[1]}.${baseParts[2]}.${i}`);
  }
  const results = await Promise.all(targets.map(probe));
  const servers = results.filter((s): s is Server => s !== null);
  return NextResponse.json({
    ok: true,
    subnet: `${subnet.base}/24`,
    iface: subnet.iface,
    port: SCAN_PORT,
    servers,
  });
}
