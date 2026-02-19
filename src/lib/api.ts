/**
 * API Configuration Utility
 * 
 * Provides a configurable base URL for all API calls.
 * Uses NEXT_PUBLIC_API_URL environment variable if set,
 * otherwise defaults to relative URLs (for local dev).
 */

export function getApiUrl(): string {
  // Check for environment variable first
  if (typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_API_URL) {
    return (window as any).__NEXT_PUBLIC_API_URL;
  }
  
  // Try to read from next.config or environment
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl;
  }
  
  // Default to empty string (relative URLs)
  return '';
}

export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiUrl();
  if (!baseUrl) {
    // Relative URL for local dev
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }
  // Absolute URL when using external API
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

/**
 * Fetch wrapper that uses configured API URL
 */
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

/**
 * Fetch and parse JSON response
 */
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

/**
 * SSE connection helper
 */
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
    } catch {
      // Ignore parse errors
    }
  };

  // Listen for all custom events
  eventSource.addEventListener('tasks', (event) => {
    try {
      const data = JSON.parse((event as any).data);
      onMessage('tasks', data);
    } catch {}
  });

  eventSource.addEventListener('activity', (event) => {
    try {
      const data = JSON.parse((event as any).data);
      onMessage('activity', data);
    } catch {}
  });

  eventSource.addEventListener('agents', (event) => {
    try {
      const data = JSON.parse((event as any).data);
      onMessage('agents', data);
    } catch {}
  });

  eventSource.addEventListener('costs', (event) => {
    try {
      const data = JSON.parse((event as any).data);
      onMessage('costs', data);
    } catch {}
  });

  eventSource.onerror = (error) => {
    if (onError) {
      onError(new Error('SSE connection error'));
    }
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}
