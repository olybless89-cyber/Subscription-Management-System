import { NextRequest, NextResponse } from 'next/server';

/**
 * Routes any request whose Host header isn't one of this app's own
 * domains to /suspended, at every path — this is what makes "manually
 * repoint a suspended customer's domain at this app in Railway" actually
 * show them a landing page, instead of just serving this app's own
 * homepage/dashboard for whatever path they happened to load.
 *
 * Deliberately an allow-list of KNOWN OWN domains, not a deny-list of
 * customer domains — a customer domain gets added to the Domain table
 * long before it's ever suspended, so a deny-list would have to be kept
 * in sync with every domain ever mapped. An allow-list of "domains this
 * app is actually meant to serve its own UI on" only ever needs updating
 * when this app itself gets a new domain, which is rare and deliberate.
 *
 * /suspended itself, /api/*, /_next/*, and known static assets are
 * always let through untouched — the rewritten request still needs to
 * reach /suspended's own page and the API route (and assets) it calls.
 */
const OWN_HOST_SUFFIXES = ['.up.railway.app', '.railway.app'];

// Hardcoded alongside APP_URL (not instead of it) because APP_URL is
// whatever's currently set in Railway's Variables tab — easy to leave
// stale after a domain change — while this app's real production domain
// should never accidentally start rewriting to /suspended.
const KNOWN_OWN_HOSTS = ['dworacle.com', 'www.dworacle.com'];

function ownHostnames(): string[] {
  const fromEnv = process.env.APP_URL ? [safeHostname(process.env.APP_URL)] : [];
  return [...fromEnv, ...KNOWN_OWN_HOSTS, 'localhost', '127.0.0.1'].filter((h): h is string => !!h);
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isOwnHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ownHostnames().includes(h)) return true;
  return OWN_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

const PASSTHROUGH_PREFIXES = ['/suspended', '/api', '/_next', '/favicon.ico', '/dwo-logo.jpg', '/og-image.png'];

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const { pathname } = request.nextUrl;

  if (isOwnHost(hostname)) {
    return NextResponse.next();
  }

  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/suspended';
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next's own static-file requests outright (perf only — the
  // PASSTHROUGH_PREFIXES check above would let them through anyway).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
