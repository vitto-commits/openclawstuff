import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN || '';

export async function GET() {
  return NextResponse.json({
    url: GATEWAY_URL,
    token: GATEWAY_TOKEN ? '***' : '',
    configured: !!GATEWAY_TOKEN,
    endpoint: GATEWAY_URL,
    status: 'ready',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, token } = body;

    // Store in memory (in production, use secure session storage)
    const config = {
      url: url || GATEWAY_URL,
      token: token || GATEWAY_TOKEN,
      configured: !!(token || GATEWAY_TOKEN),
      endpoint: url || GATEWAY_URL,
      status: 'updated',
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
