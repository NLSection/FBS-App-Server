import { NextResponse } from 'next/server';
import { SCHEMA_VERSION } from '@/lib/migrations';

export async function GET() {
  return NextResponse.json({ ok: true, app: 'fbs', schemaVersion: SCHEMA_VERSION });
}
