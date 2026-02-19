'use client';

import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { apiJson } from '@/lib/api';

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  online: { dot: 'bg-green-400', label: 'Online' },
  offline: { dot: 'bg-gray-300', label: 'Offline' },
  busy: { dot: 'bg-yellow-400', label: 'Busy' },
  error: { dot: 'bg-red-400', label: 'Error' },
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentPanel({ agents, onRefresh }: { agents: any[]; onRefresh: () => void }) {
  const toggleStatus = async (agent: any) => {
    const next = agent.status === 'online' ? 'offline' : 'online';
    await apiJson('/api/agents', {
      method: 'PUT',
      body: JSON.stringify({ id: agent.id, status: next, last_active: next === 'online' ? new Date().toISOString() : agent.last_active }),
    });
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900">Agents</h2>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onRefresh} className="text-sm text-gray-500 hover:text-gray-700">↻ Refresh</motion.button>
      </div>
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {agents.map(agent => {
          const st = STATUS_STYLE[agent.status] || STATUS_STYLE.offline;
          return (
            <motion.div
              key={agent.id}
              variants={fadeInUp}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">🤖</div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-xs text-gray-400">{agent.id}</p>
                  </div>
                </div>
                <motion.button
                  onClick={() => toggleStatus(agent)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    agent.status === 'online' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                  {st.label}
                </motion.button>
              </div>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Model</span>
                  <span className="font-mono text-gray-700">{agent.model || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last active</span>
                  <span>{timeAgo(agent.last_active)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
