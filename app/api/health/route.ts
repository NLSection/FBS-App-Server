import { NextResponse } from 'next/server';
import { SCHEMA_VERSION } from '@/lib/migrations';
import pkg from '../../../package.json';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'fbs',
    version: (pkg as { version?: string }).version ?? null,
    schemaVersion: SCHEMA_VERSION,
    serverDeployment: process.env.FBS_SERVER_DEPLOYMENT ?? null,
  });
}
