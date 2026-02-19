'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import KanbanBoard from '@/components/KanbanBoard';
import SkillsManager from '@/components/SkillsManager';
import AgentPanel from '@/components/AgentPanel';
import ActivityFeed from '@/components/ActivityFeed';
import CostTracker from '@/components/CostTracker';
import FileUpload from '@/components/FileUpload';
import MemoryViewer from '@/components/MemoryViewer';
import QuickChat from '@/components/QuickChat';
import CronManager from '@/components/CronManager';
import Journal from '@/components/Journal';
import { pageTransition } from '@/lib/animations';
import { apiJson } from '@/lib/api';

type Tab = 'tasks' | 'board' | 'agents' | 'activity' | 'journal' | 'costs' | 'files' | 'memory' | 'chat' | 'cron';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'board', label: 'Skills', icon: '🧩' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'activity', label: 'Activity', icon: '📡' },
  { id: 'journal', label: 'Journal', icon: '📓' },
  { id: 'costs', label: 'Costs', icon: '💰' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'cron', label: 'Cron', icon: '⏱️' },
];

const tabContent: Record<Tab, (props: { agents: any[]; fetchAgents: () => void }) => React.ReactElement> = {
  tasks: () => <KanbanBoard />,
  board: () => <SkillsManager />,
  agents: ({ agents, fetchAgents }) => <AgentPanel agents={agents} onRefresh={fetchAgents} />,
  activity: () => <ActivityFeed />,
  journal: () => <Journal />,
  costs: () => <CostTracker />,
  files: () => <FileUpload />,
  memory: () => <MemoryViewer />,
  chat: ({ agents }) => <QuickChat agents={agents} />,
  cron: () => <CronManager />,
};

export default function Home() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [agents, setAgents] = useState<any[]>([]);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await apiJson<any[]>('/api/agents');
      setAgents(data);
    } catch {}
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  useSSE({
    handlers: { agents: (d) => setAgents(d) },
    pollInterval: 30000,
    pollFallbacks: { agents: fetchAgents },
  });

  const Content = tabContent[tab];

  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen bg-white border-r border-gray-200 flex flex-col z-50 w-[200px] lg:w-[200px] md:w-[200px] sm:w-[56px] max-[767px]:w-[56px] transition-all duration-200">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 min-h-[57px]">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          <h1 className="text-base font-semibold text-gray-900 truncate max-[767px]:hidden">Dashboard</h1>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {tabs.map(t => (
            <motion.button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              whileHover={{ scale: 1.01, backgroundColor: tab === t.id ? undefined : 'rgba(0,0,0,0.03)' }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              {tab === t.id && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-gray-100 rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="text-base flex-shrink-0 relative z-10">{t.icon}</span>
              <span className="truncate max-[767px]:hidden relative z-10">{t.label}</span>
            </motion.button>
          ))}
        </nav>

        {/* Status */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
          <motion.span
            className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          />
          <span className="max-[767px]:hidden">{agents.filter(a => a.status === 'online').length} online</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[200px] max-[767px]:ml-[56px] transition-all duration-200 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              variants={pageTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Content agents={agents} fetchAgents={fetchAgents} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
