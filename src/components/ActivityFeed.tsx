'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import { fadeInDown } from '@/lib/animations';
import { apiJson } from '@/lib/api';

const LEVEL_STYLE: Record<string, string> = {
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-yellow-50 text-yellow-700',
  error: 'bg-red-50 text-red-700',
};

export default function ActivityFeed() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>('/api/activity?limit=100');
      setItems(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({
    handlers: { activity: (d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); } },
    pollInterval: 15000,
    pollFallbacks: { activity: load },
  });

  const formatTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (s: string) => {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Activity Feed</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Live updates via SSE</span>
          <motion.button whileHover={{ scale: 1.1, rotate: 180 }} whileTap={{ scale: 0.9 }} onClick={load} className="text-sm text-gray-500 hover:text-gray-700" transition={{ duration: 0.3 }}>↻</motion.button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <motion.div
          className="text-center text-gray-400 py-12"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >Loading...</motion.div>
      ) : items.length === 0 ? (
        <motion.div className="text-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="text-gray-400">No activity yet</p>
          <p className="text-xs text-gray-300 mt-1">Agent actions will appear here</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.div
                key={item.id || i}
                variants={fadeInDown}
                initial="hidden"
                animate="visible"
                layout
                className="px-5 py-3 flex items-start gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="text-right min-w-[80px] mt-0.5">
                  <div className="text-xs text-gray-400">{formatDate(item.created_at)}</div>
                  <div className="text-[10px] text-gray-300">{formatTime(item.created_at)}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LEVEL_STYLE[item.level] || LEVEL_STYLE.info}`}>
                      {item.level}
                    </span>
                    {item.agent && <span className="text-xs text-gray-500">{item.agent}</span>}
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5">{item.action}</p>
                  {item.details && <p className="text-xs text-gray-400 mt-0.5">{item.details}</p>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
