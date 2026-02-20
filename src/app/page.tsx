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
import MultiAgentChat from '@/components/MultiAgentChat';
import CronManager from '@/components/CronManager';
import Journal from '@/components/Journal';
import DashboardOverview from '@/components/DashboardOverview';
import { pageTransition } from '@/lib/animations';
import { apiJson } from '@/lib/api';

type Tab = 'overview' | 'tasks' | 'board' | 'agents' | 'activity' | 'journal' | 'costs' | 'files' | 'memory' | 'chat' | 'cron';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
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

// Primary tabs shown in the bottom bar (5 + More)
const primaryTabs: Tab[] = ['overview', 'tasks', 'agents', 'journal', 'memory'];

type TabProps = { agents: any[]; fetchAgents: () => void; setTab: (t: Tab) => void };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabContent: Record<Tab, (props: TabProps) => React.ReactElement> = {
  overview: ({ setTab }: TabProps) => <DashboardOverview onTabChange={(t) => setTab(t as Tab)} />,
  tasks: () => <KanbanBoard />,
  board: () => <SkillsManager />,
  agents: ({ agents, fetchAgents }: TabProps) => <AgentPanel agents={agents} onRefresh={fetchAgents} />,
  activity: () => <ActivityFeed />,
  journal: () => <Journal />,
  costs: () => <CostTracker />,
  files: () => <FileUpload />,
  memory: () => <MemoryViewer />,
  chat: () => <MultiAgentChat />,
  cron: () => <CronManager />,
};

export default function Home() {
  const [tab, setTab] = useState<Tab>('overview');
  const [agents, setAgents] = useState<any[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await apiJson<any>('/api/agents');
      setAgents(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  useSSE({
    handlers: { agents: (d) => setAgents(Array.isArray(d) ? d : []) },
    pollInterval: 30000,
    pollFallbacks: { agents: fetchAgents },
  });

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setMoreOpen(false);
  };

  const Content = tabContent[tab];

  const secondaryTabs = tabs.filter(t => !primaryTabs.includes(t.id));
  const currentTabLabel = tabs.find(t => t.id === tab)?.label ?? '';

  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen bg-white border-r border-gray-200 flex-col z-50 w-[200px] transition-all duration-200">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 min-h-[57px]">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          <h1 className="text-base font-semibold text-gray-900 truncate">Dashboard</h1>
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
              <span className="truncate relative z-10">{t.label}</span>
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
          <span>{agents.filter(a => a.status === 'online').length} online</span>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-[200px] min-h-screen">
        {/* Mobile header bar */}
        <div className="md:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">{currentTabLabel}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <motion.span
              className="w-1.5 h-1.5 bg-green-400 rounded-full"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />
            <span className="text-xs text-gray-400">{agents.filter(a => a.status === 'online').length} online</span>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 py-4 md:px-6 md:py-6 pb-[84px] md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              variants={pageTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Content agents={agents} fetchAgents={fetchAgents} setTab={handleTabChange} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-bottom">
        <div className="flex items-stretch h-[60px]">
          {tabs.filter(t => primaryTabs.includes(t.id)).map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-w-0 tap-target ${
                tab === t.id
                  ? 'text-gray-900'
                  : 'text-gray-400'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-[10px] font-medium leading-none truncate px-0.5">{t.label}</span>
              {tab === t.id && (
                <motion.span
                  layoutId="bottom-nav-active"
                  className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-w-0 tap-target ${
              !primaryTabs.includes(tab) ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className="text-lg leading-none">
              {!primaryTabs.includes(tab) ? (tabs.find(t => t.id === tab)?.icon ?? '⋯') : '⋯'}
            </span>
            <span className="text-[10px] font-medium leading-none">More</span>
            {!primaryTabs.includes(tab) && (
              <motion.span
                layoutId="bottom-nav-active"
                className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        </div>
      </nav>

      {/* ── More Sheet (slide-up) ── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="md:hidden fixed inset-0 z-[60] bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              className="md:hidden fixed bottom-[60px] left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-xl pb-safe"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />
              <div className="px-4 pb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">More</p>
                <div className="grid grid-cols-3 gap-2">
                  {secondaryTabs.map(t => (
                    <motion.button
                      key={t.id}
                      onClick={() => handleTabChange(t.id)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors ${
                        tab === t.id
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="text-2xl">{t.icon}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
