import { NextResponse } from 'next/server';
import getDb, { setUseEmptyDb, getUseEmptyDb, initFallbackSchema } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not available' }, { status: 403 });
  return NextResponse.json({ actief: getUseEmptyDb() });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { actief } = await req.json() as { actief: boolean };
  setUseEmptyDb(actief);
  if (actief) {
    runMigrations();
    initFallbackSchema(getDb());
  }
  return NextResponse.json({ actief: getUseEmptyDb() });
}
