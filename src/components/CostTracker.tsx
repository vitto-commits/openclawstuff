'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import AnimatedCounter from './AnimatedCounter';
import { apiJson } from '@/lib/api';

export default function CostTracker() {
  const [data, setData] = useState<{ byModel: any[]; bySession: any[] }>({ byModel: [], bySession: [] });

  const load = useCallback(async () => {
    try {
      const raw = await apiJson<any>('/api/costs');
      setData({
        byModel: Array.isArray(raw?.byModel) ? raw.byModel : [],
        bySession: Array.isArray(raw?.bySession) ? raw.bySession : [],
      });
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({
    handlers: { costs: (d) => setData({ byModel: Array.isArray(d?.byModel) ? d.byModel : [], bySession: Array.isArray(d?.bySession) ? d.bySession : [] }) },
    pollInterval: 30000,
    pollFallbacks: { costs: load },
  });

  const costs = data.byModel || [];
  const sessions = data.bySession || [];
  const totalCost = costs.reduce((sum, c) => sum + (c.total_cost || 0), 0);
  const totalTokens = costs.reduce((sum, c) => sum + (c.total_input || 0) + (c.total_output || 0) + (c.cache_read || 0) + (c.cache_write || 0), 0);
  const totalMessages = costs.reduce((s, c) => s + (c.messages || 0), 0);

  const fmt = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString();
  const fmtAnimated = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : Math.round(n).toString();

  const statCards = [
    { label: 'Total Cost', value: totalCost, format: (n: number) => '$' + n.toFixed(4) },
    { label: 'Total Tokens', value: totalTokens, format: fmtAnimated },
    { label: 'API Calls', value: totalMessages, format: (n: number) => Math.round(n).toString() },
    { label: 'Sessions', value: sessions.length, format: (n: number) => Math.round(n).toString() },
  ];

  return (
    <div>
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">Cost Tracker</h2>

      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((card) => (
          <motion.div
            key={card.label}
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
            whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-gray-400 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              <AnimatedCounter value={card.value} format={card.format} />
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Per-model breakdown */}
      {costs.length === 0 ? (
        <motion.div className="text-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="text-gray-400">No cost data yet</p>
          <p className="text-xs text-gray-300 mt-1">Usage data will appear as agents run</p>
        </motion.div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">By Model</h3>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6 md:mb-8">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Model</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Input</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Output</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Cache R/W</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Cost</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {costs.map((c, i) => (
                    <motion.tr
                      key={i}
                      className="hover:bg-gray-50"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.05 * i }}
                    >
                      <td className="px-4 md:px-5 py-3">
                        <span className="font-mono text-xs text-gray-700">{c.model}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{c.provider}</span>
                      </td>
                      <td className="px-4 md:px-5 py-3 text-right text-gray-600">{fmt(c.total_input || 0)}</td>
                      <td className="px-4 md:px-5 py-3 text-right text-gray-600">{fmt(c.total_output || 0)}</td>
                      <td className="px-4 md:px-5 py-3 text-right text-gray-600">{fmt(c.cache_read || 0)} / {fmt(c.cache_write || 0)}</td>
                      <td className="px-4 md:px-5 py-3 text-right font-medium text-gray-900">${(c.total_cost || 0).toFixed(4)}</td>
                      <td className="px-4 md:px-5 py-3 text-right text-gray-600">{c.messages}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </motion.div>

          {sessions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">By Session</h3>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Session</th>
                      <th className="text-left px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Model</th>
                      <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Tokens</th>
                      <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Cost</th>
                      <th className="text-right px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Messages</th>
                      <th className="text-left px-4 md:px-5 py-3 text-xs text-gray-400 font-medium uppercase">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessions.map((s, i) => (
                      <motion.tr
                        key={i}
                        className="hover:bg-gray-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.03 * i }}
                      >
                        <td className="px-4 md:px-5 py-3 font-mono text-xs text-gray-700">{s.id}</td>
                        <td className="px-4 md:px-5 py-3 font-mono text-xs text-gray-500">{s.model}</td>
                        <td className="px-4 md:px-5 py-3 text-right text-gray-600">{fmt(s.tokens)}</td>
                        <td className="px-4 md:px-5 py-3 text-right font-medium text-gray-900">${(s.cost || 0).toFixed(4)}</td>
                        <td className="px-4 md:px-5 py-3 text-right text-gray-600">{s.messages}</td>
                        <td className="px-4 md:px-5 py-3 text-xs text-gray-400">{s.timestamp ? new Date(s.timestamp).toLocaleString() : '—'}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
