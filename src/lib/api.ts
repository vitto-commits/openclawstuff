/**
 * API Configuration Utility
 * 
 * On localhost: uses relative URLs (hits Next.js API routes)
 * On Vercel/production: fetches tunnel URL from /api/config endpoint
 */

let cachedApiUrl: string | null = null;

export function getApiUrl(): string {
  // Build-time env var (NEXT_PUBLIC_ gets inlined by Next.js)
  const envUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (envUrl && envUrl.length > 5) return envUrl;
  
  // Runtime detection: if not on localhost, check for stored tunnel URL
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('OPENCLAW_API_URL');
    if (stored) return stored;
  }
  
  // Default to relative URLs (local dev)
  return '';
}

export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiUrl();
  if (!baseUrl) {
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

export async function apiFetch(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const url = buildApiUrl(endpoint);
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

export async function apiJson<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await apiFetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function createSSEConnection(
  onMessage: (event: string, data: any) => void,
  onError?: (error: Error) => void
): () => void {
  const url = buildApiUrl('/api/events');
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage('message', data);
    } catch {}
  };

  ['tasks', 'activity', 'agents', 'costs'].forEach(type => {
    eventSource.addEventListener(type, (event) => {
      try {
        const data = JSON.parse((event as any).data);
        onMessage(type, data);
      } catch {}
    });
  });

  eventSource.onerror = () => {
    if (onError) onError(new Error('SSE connection error'));
    eventSource.close();
  };

  return () => eventSource.close();
}
// cache bust 1771506702
