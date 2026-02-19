'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer, popIn } from '@/lib/animations';
import { apiJson } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskData {
  todo: { id: string; title: string; created_at: string }[];
  in_progress: { id: string; label: string; status: string; spawned_at: string; duration?: string }[];
  done: { id: string; label: string; status: string; completed_at?: string; spawned_at: string; duration?: string }[];
}

interface Agent {
  name: string;
  model?: string;
  status: string;
  last_active?: string;
}

interface JournalData {
  narrative?: string;
  tags: string[];
  stats: {
    subagentsSpawned: number;
    totalTokens: number;
    totalCost: number;
  };
}

interface ActivityItem {
  action: string;
  details?: string;
  created_at: string;
}

interface SkillsData {
  custom: unknown[];
  builtin: unknown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  // Asia/Manila is UTC+8
  const now = new Date();
  const manilaHour = (now.getUTCHours() + 8) % 24;
  if (manilaHour >= 5 && manilaHour < 12) return 'Good morning';
  if (manilaHour >= 12 && manilaHour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TAG_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-purple-50 text-purple-600 border-purple-200',
  'bg-green-50 text-green-600 border-green-200',
  'bg-amber-50 text-amber-600 border-amber-200',
  'bg-rose-50 text-rose-600 border-rose-200',
  'bg-cyan-50 text-cyan-600 border-cyan-200',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 min-w-0"
    >
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-bold ${accent ?? 'text-gray-900'}`}>{value}</span>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardOverview({
  onTabChange,
}: {
  onTabChange?: (tab: string) => void;
}) {
  const [tasks, setTasks] = useState<TaskData>({ todo: [], in_progress: [], done: [] });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [skillsCount, setSkillsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  const fetchAll = useCallback(async () => {
    try {
      const [rawTasks, rawAgents, rawJournal, rawActivity, rawSkills] = await Promise.allSettled([
        apiJson<any>('/api/tasks'),
        apiJson<any>('/api/agents'),
        apiJson<any>(`/api/journal?date=${today}`),
        apiJson<any>('/api/activity'),
        apiJson<any>('/api/skills'),
      ]);

      if (rawTasks.status === 'fulfilled' && rawTasks.value) {
        const r = rawTasks.value;
        setTasks({
          todo: Array.isArray(r.todo) ? r.todo : [],
          in_progress: Array.isArray(r.in_progress) ? r.in_progress : [],
          done: Array.isArray(r.done) ? r.done : [],
        });
      }

      if (rawAgents.status === 'fulfilled') {
        setAgents(Array.isArray(rawAgents.value) ? rawAgents.value : []);
      }

      if (rawJournal.status === 'fulfilled' && rawJournal.value) {
        const j = rawJournal.value;
        setJournal({
          narrative: j.narrative || '',
          tags: Array.isArray(j.tags) ? j.tags : [],
          stats: {
            subagentsSpawned: j.stats?.subagentsSpawned ?? 0,
            totalTokens: j.stats?.totalTokens ?? 0,
            totalCost: j.stats?.totalCost ?? 0,
          },
        });
      }

      if (rawActivity.status === 'fulfilled') {
        setActivity(Array.isArray(rawActivity.value) ? rawActivity.value.slice(0, 5) : []);
      }

      if (rawSkills.status === 'fulfilled' && rawSkills.value) {
        const s = rawSkills.value as SkillsData;
        setSkillsCount(
          (Array.isArray(s.custom) ? s.custom.length : 0) +
          (Array.isArray(s.builtin) ? s.builtin.length : 0)
        );
      }
    } catch {}
    setLoading(false);
  }, [today]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const onlineAgents = agents.filter((a) => a.status === 'online');
  const recentDone = tasks.done.slice(0, 5);
  const narrativePreview = journal?.narrative
    ? journal.narrative.slice(0, 200) + (journal.narrative.length > 200 ? '…' : '')
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          Loading…
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header ── */}
      <motion.div variants={fadeInUp} className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {getGreeting()} 👋
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{getTodayFormatted()}</p>
      </motion.div>

      {/* ── Stats bar ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <StatCard
          label="Tasks"
          value={tasks.todo.length + tasks.in_progress.length}
          sub={`· ${tasks.done.length} done`}
        />
        <StatCard
          label="Agents"
          value={onlineAgents.length}
          sub="online"
          accent={onlineAgents.length > 0 ? 'text-green-600' : 'text-gray-400'}
        />
        <StatCard
          label="Subagents today"
          value={journal?.stats.subagentsSpawned ?? 0}
        />
        <StatCard
          label="Skills"
          value={skillsCount}
          sub="installed"
        />
      </motion.div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column — 3/5 */}
        <div className="lg:col-span-3 space-y-4">

          {/* Recent Tasks card */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Tasks</h2>
              {onTabChange && (
                <button
                  onClick={() => onTabChange('tasks')}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  View all →
                </button>
              )}
            </div>

            {/* In-progress tasks */}
            {tasks.in_progress.length > 0 && (
              <div className="mb-3 space-y-2">
                {tasks.in_progress.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-lg"
                  >
                    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800 truncate flex-1">
                      {task.label}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {timeAgo(task.spawned_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent done tasks */}
            {recentDone.length > 0 ? (
              <motion.div variants={staggerContainer} className="space-y-1.5">
                {recentDone.map((task) => (
                  <motion.div
                    key={task.id}
                    variants={fadeInUp}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-green-500 text-xs font-bold flex-shrink-0">✓</span>
                    <span className="text-sm text-gray-700 truncate flex-1">{task.label}</span>
                    {task.duration && (
                      <span className="text-xs text-gray-400 whitespace-nowrap">{task.duration}</span>
                    )}
                    <span className="text-xs text-gray-300 whitespace-nowrap">
                      {timeAgo(task.spawned_at)}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">No completed tasks yet</p>
            )}

            {/* Todo count hint */}
            {tasks.todo.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-400">
                  {tasks.todo.length} task{tasks.todo.length !== 1 ? 's' : ''} queued
                </p>
              </div>
            )}
          </motion.div>

          {/* Today's Journal snippet */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Today&apos;s Journal</h2>
              {onTabChange && (
                <button
                  onClick={() => onTabChange('journal')}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  Read more →
                </button>
              )}
            </div>

            {narrativePreview ? (
              <>
                <p className="text-sm text-gray-600 leading-relaxed">{narrativePreview}</p>
                {journal?.tags && journal.tags.length > 0 && (
                  <motion.div
                    variants={staggerContainer}
                    className="flex flex-wrap gap-1.5 mt-3"
                  >
                    {journal.tags.slice(0, 6).map((tag, i) => (
                      <motion.span
                        key={tag}
                        variants={popIn}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TAG_COLORS[i % TAG_COLORS.length]}`}
                      >
                        #{tag}
                      </motion.span>
                    ))}
                  </motion.div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">No journal entry yet today</p>
            )}
          </motion.div>
        </div>

        {/* Right column — 2/5 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Agent Status card */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Agents</h2>
              {onTabChange && (
                <button
                  onClick={() => onTabChange('agents')}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  Manage →
                </button>
              )}
            </div>

            {agents.length > 0 ? (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        agent.status === 'online' ? 'bg-green-400' : 'bg-gray-300'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{agent.name}</p>
                      {agent.model && (
                        <p className="text-[10px] text-gray-400 truncate">{agent.model}</p>
                      )}
                    </div>
                    {agent.last_active && (
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {timeAgo(agent.last_active)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No agents configured</p>
            )}
          </motion.div>

          {/* Activity Feed mini */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Activity</h2>
              {onTabChange && (
                <button
                  onClick={() => onTabChange('activity')}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  View all →
                </button>
              )}
            </div>

            {activity.length > 0 ? (
              <motion.div variants={staggerContainer} className="space-y-2">
                {activity.map((item, i) => (
                  <motion.div
                    key={i}
                    variants={fadeInUp}
                    className="flex items-start gap-3 py-1"
                  >
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5 w-14 flex-shrink-0">
                      {timeAgo(item.created_at)}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-gray-600">{item.action}</span>
                      {item.details && (
                        <p className="text-[11px] text-gray-400 truncate">{item.details}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
            )}
          </motion.div>

          {/* Quick Links */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <h2 className="text-base font-semibold text-gray-900 mb-3">Quick Links</h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Memory', icon: '🧠', tab: 'memory' },
                { label: 'Skills', icon: '🧩', tab: 'board' },
                { label: 'Cron', icon: '⏱️', tab: 'cron' },
              ].map((link) => (
                <motion.button
                  key={link.tab}
                  variants={popIn}
                  onClick={() => onTabChange?.(link.tab)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-gray-50 transition-colors text-center"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <span className="text-lg">{link.icon}</span>
                  <span className="text-xs text-gray-500 font-medium">{link.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
