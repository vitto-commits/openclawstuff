import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

function isValidSession(cookieValue: string, secret: string): boolean {
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = cookieValue.slice(0, dotIndex);
  const hmac = cookieValue.slice(dotIndex + 1);

  // Verify HMAC
  const expectedHmac = createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  if (hmac !== expectedHmac) return false;

  // Check expiry (7 days)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - ts < sevenDaysMs;
}

export async function GET(req: NextRequest) {
  const { AUTH_USERNAME, AUTH_PASSWORD_HASH, AUTH_SECRET } = process.env;

  // Local dev: no env vars → always authenticated
  if (!AUTH_USERNAME || !AUTH_PASSWORD_HASH || !AUTH_SECRET) {
    return NextResponse.json({ authenticated: true });
  }

  const cookieValue = req.cookies.get('dashboard_session')?.value;
  if (!cookieValue) {
    return NextResponse.json({ authenticated: false });
  }

  const authenticated = isValidSession(cookieValue, AUTH_SECRET);
  return NextResponse.json({ authenticated });
}
