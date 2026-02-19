import { NextRequest, NextResponse } from 'next/server';
import { createHmac, createHash } from 'crypto';

export async function POST(req: NextRequest) {
  const { AUTH_USERNAME, AUTH_PASSWORD_HASH, AUTH_SECRET } = process.env;

  // Local dev: no env vars set → skip auth
  if (!AUTH_USERNAME || !AUTH_PASSWORD_HASH || !AUTH_SECRET) {
    return NextResponse.json({ ok: true });
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { username, password } = body;

  // Hash submitted password with SHA-256
  const passwordHash = createHash('sha256')
    .update(password ?? '')
    .digest('hex');

  if (username !== AUTH_USERNAME || passwordHash !== AUTH_PASSWORD_HASH) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Build signed session cookie value: {timestamp}.{hmac}
  const timestamp = Date.now().toString();
  const hmac = createHmac('sha256', AUTH_SECRET)
    .update(timestamp)
    .digest('hex');
  const cookieValue = `${timestamp}.${hmac}`;

  const sevenDays = 7 * 24 * 60 * 60;

  const response = NextResponse.json({ ok: true });
  response.cookies.set('dashboard_session', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sevenDays,
    path: '/',
  });

  return response;
}
