'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp } from '@/lib/animations';
import { apiJson } from '@/lib/api';

export default function QuickChat({ agents }: { agents: any[] }) {
  const [agent, setAgent] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ agent: string; message: string; timestamp: string }[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiJson<any>('/api/chat')
      .then((d: any) => {
        const items = Array.isArray(d) ? d : d?.items || [];
        setHistory(items.reverse().slice(0, 50));
      })
      .catch(() => {});
  }, []);

  const send = async () => {
    if (!agent || !message.trim()) return;
    setSending(true);
    try {
      const data = await apiJson<any>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ agent, message }),
      });
      if (data.entry) {
        setHistory(prev => [data.entry, ...prev]);
      }
    } catch {}
    setMessage('');
    setSending(false);
  };

  return (
    <div>
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">Quick Chat</h2>
      
      <div className="w-full max-w-2xl">
        <div className="mb-4">
          <label className="text-sm text-gray-500 block mb-1.5">Send to</label>
          <div className="flex gap-2 flex-wrap">
            {agents.map(a => (
              <motion.button
                key={a.id}
                onClick={() => setAgent(a.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  agent === a.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                layout
              >
                {a.name}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400"
            placeholder={agent ? `Message ${agents.find(a => a.id === agent)?.name || agent}...` : 'Select an agent first'}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            disabled={!agent}
          />
          <motion.button
            onClick={send}
            disabled={!agent || !message.trim() || sending}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {sending ? '...' : 'Send'}
          </motion.button>
        </div>

        {history.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
            <AnimatePresence initial={false}>
              {history.map((h, i) => (
                <motion.div
                  key={`${h.timestamp}-${i}`}
                  className="px-5 py-3"
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  layout
                >
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <span>→ {agents.find(a => a.id === h.agent)?.name || h.agent}</span>
                    <span>•</span>
                    <span>{h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  <p className="text-sm text-gray-800">{h.message}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Messages are saved to chat-log.json and shown in the activity feed. Full OpenClaw integration coming in v2.
        </p>
      </div>
    </div>
  );
}
