import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// GET /api/messages?agent=otto|felix|nova
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get('agent');

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ items: [], local_only: true });
  }

  try {
    let url = `${supabaseUrl}/rest/v1/messages?order=created_at.desc&limit=100`;
    if (agent) {
      url += `&agent_name=eq.${encodeURIComponent(agent)}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      console.error('Supabase error:', response.status);
      return NextResponse.json({ items: [] });
    }

    const data = await response.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Messages GET error:', error);
    return NextResponse.json({ items: [] });
  }
}

// POST /api/messages
export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { agent_name, content, direction = 'inbound' } = body;

    if (!agent_name || !content) {
      return NextResponse.json({ error: 'Missing agent_name or content' }, { status: 400 });
    }

    const url = `${supabaseUrl}/rest/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        agent_name,
        content,
        direction,
      }),
    });

    if (!response.ok) {
      console.error('Supabase POST error:', response.status, await response.text());
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(Array.isArray(data) ? data[0] : data);
  } catch (error) {
    console.error('Messages POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
