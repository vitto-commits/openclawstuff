import { NextRequest, NextResponse } from 'next/server';

// Use Web Crypto API (available in Edge Runtime) to compute HMAC-SHA256
async function computeHmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isValidSession(cookieValue: string, secret: string): Promise<boolean> {
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = cookieValue.slice(0, dotIndex);
  const hmac = cookieValue.slice(dotIndex + 1);

  const expectedHmac = await computeHmac(secret, timestamp);
  if (hmac !== expectedHmac) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - ts < sevenDaysMs;
}

export async function middleware(req: NextRequest) {
  const { AUTH_USERNAME, AUTH_PASSWORD_HASH, AUTH_SECRET } = process.env;

  // Local dev: no env vars → skip auth entirely
  if (!AUTH_USERNAME || !AUTH_PASSWORD_HASH || !AUTH_SECRET) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get('dashboard_session')?.value;
  if (cookieValue && (await isValidSession(cookieValue, AUTH_SECRET))) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
