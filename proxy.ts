import { NextResponse, type NextRequest } from 'next/server';
import { trafficRecord } from '@/lib/requestTracking';

export function proxy(request: NextRequest) {
  try {
    console.info(JSON.stringify(trafficRecord(request, process.env.VERCEL_ENV)));
  } catch {
    // Telemetry must never prevent an application request from continuing.
  }
  return NextResponse.next();
}

export const config = {
  // Exclude only actual root assets and Next internals, not arbitrary extensions.
  // Keep this literal asset list in sync with public/ (checked by regression tests).
  matcher: ['/((?!_next(?:/|$)|(?:favicon\\.ico|window\\.svg|globe\\.svg|next\\.svg|vercel\\.svg|file\\.svg)/?$).*)'],
};
