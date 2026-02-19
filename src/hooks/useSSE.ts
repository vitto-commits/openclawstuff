'use client';

import { useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/api';

type SSEEventHandler = (data: any) => void;

interface UseSSEOptions {
  /** Map of event names to handlers */
  handlers: Record<string, SSEEventHandler>;
  /** Fallback polling interval in ms (default: 15000) */
  pollInterval?: number;
  /** Fallback polling functions keyed by event name */
  pollFallbacks?: Record<string, () => Promise<void>>;
}

export function useSSE({ handlers, pollInterval = 15000, pollFallbacks }: UseSSEOptions) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const pollFallbacksRef = useRef(pollFallbacks);
  pollFallbacksRef.current = pollFallbacks;

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let cancelled = false;

    const startPolling = () => {
      if (cancelled || pollTimer) return;
      const fbs = pollFallbacksRef.current;
      if (!fbs) return;
      pollTimer = setInterval(() => {
        for (const fn of Object.values(fbs)) fn().catch(() => {});
      }, pollInterval);
    };

    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const connect = () => {
      if (cancelled) return;
      es = new EventSource(buildApiUrl('/api/events'));

      es.onopen = () => {
        stopPolling();
      };

      // Register named event listeners
      const eventNames = Object.keys(handlersRef.current);
      for (const name of eventNames) {
        es.addEventListener(name, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlersRef.current[name]?.(data);
          } catch {}
        });
      }

      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
        // Reconnect after 3s
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      es?.close();
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []); // stable — handlers accessed via ref
}
