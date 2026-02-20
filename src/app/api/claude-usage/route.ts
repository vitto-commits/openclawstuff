import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface ClaudeUsageData {
  id: string;
  current_session_pct?: number;
  current_session_resets_in?: string;
  weekly_all_models_pct?: number;
  weekly_all_models_resets?: string;
  weekly_sonnet_pct?: number;
  weekly_sonnet_resets?: string;
  scraped_at: string;
  created_at: string;
}

async function fetchSupabase(method: string, path: string, body?: any) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials not configured');
  }

  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase API error: ${response.status} - ${error}`);
  }

  if (method === 'DELETE' || response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function GET() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      );
    }

    // Fetch the latest usage record
    const data = await fetchSupabase(
      'GET',
      '/claude_usage?select=*&order=scraped_at.desc&limit=1'
    );

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { message: 'No usage data available yet' },
        { status: 200 }
      );
    }

    const latest = data[0] as ClaudeUsageData;

    // Calculate time since last scrape
    const scrapedAt = new Date(latest.scraped_at);
    const now = new Date();
    const diffMs = now.getTime() - scrapedAt.getTime();
    const minutesAgo = Math.floor(diffMs / 60000);

    return NextResponse.json({
      ...latest,
      minutesAgo,
    });
  } catch (error) {
    console.error('Error fetching Claude usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    );
  }
}
