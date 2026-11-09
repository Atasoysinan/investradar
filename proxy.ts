import { NextResponse, type NextRequest } from 'next/server';
import { trafficLog } from '@/lib/requestTracking';

export function proxy(request: NextRequest) {
  try {
    console.info(trafficLog(request, process.env.VERCEL_ENV));
  } catch {
    // Telemetry must never prevent an application request from continuing.
  }
  return NextResponse.next();
}

export const config = {
  // Full counts for APIs, provider-backed details and probes; no Proxy on ordinary
  // light-page navigation/RSC/prefetch. Bot hints on those pages use the second rule.
  matcher: [
    '/((?!_next(?:/|$)|(?:favicon\\.ico|window\\.svg|globe\\.svg|next\\.svg|vercel\\.svg|file\\.svg)/?$|(?:markets|videos|sitemap\\.xml|robots\\.txt)?/?$).*)',
    {
      source: '/((?:markets|videos|sitemap\\.xml|robots\\.txt)?)',
      has: [{ type: 'header', key: 'user-agent', value: '.*(?:[bB][oO][tT]|[cC][rR][aA][wW][lL][eE][rR]|[sS][pP][iI][dD][eE][rR]|[sS][lL][uU][rR][pP]|[cC][uU][rR][lL]/|[wW][gG][eE][tT]/|[pP][yY][tT][hH][oO][nN]-[rR][eE][qQ][uU][eE][sS][tT][sS]|[pP][yY][tT][hH][oO][nN]-[hH][tT][tT][pP][xX]|[hH][eE][aA][dD][lL][eE][sS][sS]|[pP][lL][aA][yY][wW][rR][iI][gG][hH][tT]|[pP][uU][pP][pP][eE][tT][eE][eE][rR]|[gG][oO]-[hH][tT][tT][pP]-[cC][lL][iI][eE][nN][tT]|[cC][hH][aA][tT][gG][pP][tT]-[uU][sS][eE][rR]|[fF][aA][cC][eE][bB][oO][oO][kK][eE][xX][tT][eE][rR][nN][aA][lL][hH][iI][tT]|[bB][iI][nN][gG][pP][rR][eE][vV][iI][eE][wW]|[gG][oO][oO][gG][lL][eE]-[iI][nN][sS][pP][eE][cC][tT][iI][oO][nN][tT][oO][oO][lL]|[aA][nN][tT][hH][rR][oO][pP][iI][cC]-[aA][iI]|[bB][yY][tT][eE][sS][pP][iI][dD][eE][rR]|[aA][hH][rR][eE][fF][sS]|[sS][eE][mM][rR][uU][sS][hH]).*' }],
    },
  ],
};
