'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import { fadeInUp, staggerContainer, popIn } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface NarrativeJournal {
  date: string;
  dayLabel: string;
  narrative?: string;
  tags: string[];
  accomplishments: string[];
  problems: string[];
  struggles: string[];
  stats: {
    totalTokens: number;
    totalCost: number;
    subagentsSpawned: number;
    activeTimeMinutes: number;
  };
}

const TAG_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-purple-50 text-purple-600 border-purple-200',
  'bg-green-50 text-green-600 border-green-200',
  'bg-amber-50 text-amber-600 border-amber-200',
  'bg-rose-50 text-rose-600 border-rose-200',
  'bg-cyan-50 text-cyan-600 border-cyan-200',
  'bg-indigo-50 text-indigo-600 border-indigo-200',
  'bg-teal-50 text-teal-600 border-teal-200',
];

function formatActiveTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Journal() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<NarrativeJournal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchJournal = useCallback(async () => {
    try {
      const raw = await apiJson<any>(`/api/journal?date=${date}`);
      if (raw && typeof raw === 'object') {
        setData({
          date: raw.date || date,
          dayLabel: raw.dayLabel || date,
          narrative: raw.narrative || '',
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          accomplishments: Array.isArray(raw.accomplishments) ? raw.accomplishments : [],
          problems: Array.isArray(raw.problems) ? raw.problems : [],
          struggles: Array.isArray(raw.struggles) ? raw.struggles : [],
          stats: {
            totalTokens: raw.stats?.totalTokens ?? 0,
            totalCost: raw.stats?.totalCost ?? 0,
            subagentsSpawned: raw.stats?.subagentsSpawned ?? 0,
            activeTimeMinutes: raw.stats?.activeTimeMinutes ?? 0,
          },
        });
      } else {
        setData(null);
      }
    } catch {} finally { setLoading(false); }
  }, [date]);

  useEffect(() => { setLoading(true); fetchJournal(); }, [fetchJournal]);

  const isToday = date === new Date().toISOString().slice(0, 10);

  useSSE({
    handlers: { journal: (d: any) => { if (isToday) setData(d); } },
    pollInterval: 60000,
    pollFallbacks: isToday ? { journal: fetchJournal } : {},
  });

  const changeDate = (delta: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
        Loading…
      </motion.div>
    </div>
  );

  if (!data) return <div className="text-gray-400 py-20 text-center">No data available</div>;

  const isEmpty = !data.narrative && data.accomplishments.length === 0 && data.problems.length === 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-6 md:mb-10 flex-wrap">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </motion.button>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" disabled={isToday}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </motion.button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-500 bg-white min-w-0 flex-shrink" />
        {!isToday && <button onClick={() => setDate(new Date().toISOString().slice(0, 10))} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Today</button>}
        {isToday && (
          <motion.span
            className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium border border-green-200"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
          >Live</motion.span>
        )}
      </div>

      {/* Date header */}
      <motion.div
        key={data.date}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-1">{data.dayLabel}</h1>
        <p className="text-sm text-gray-400">Daily Journal</p>
      </motion.div>

      {isEmpty ? (
        <motion.div
          className="text-center py-16 text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-3xl mb-3 opacity-50">📓</p>
          <p className="text-sm">Nothing happened this day.</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          key={data.date}
        >
          {/* Tags */}
          {data.tags.length > 0 && (
            <motion.div className="flex flex-wrap gap-2 mb-8" variants={staggerContainer} initial="hidden" animate="visible">
              {data.tags.map((tag, i) => (
                <motion.span
                  key={tag}
                  variants={popIn}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${TAG_COLORS[i % TAG_COLORS.length]}`}
                >
                  #{tag}
                </motion.span>
              ))}
            </motion.div>
          )}

          {/* Narrative — the main journal entry */}
          {data.narrative && (
            <div className="mb-10 space-y-4">
              {data.narrative.split('\n\n').map((paragraph, i) => (
                <motion.p
                  key={i}
                  className="text-[15px] leading-relaxed text-gray-700"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                >
                  {paragraph}
                </motion.p>
              ))}
            </div>
          )}

          {/* Fallback: if no narrative, show accomplishments as prose-ish list */}
          {!data.narrative && data.accomplishments.length > 0 && (
            <div className="mb-10">
              <p className="text-[15px] leading-relaxed text-gray-700 mb-4">
                Completed {data.accomplishments.length} task{data.accomplishments.length !== 1 ? 's' : ''} today:
              </p>
              <ul className="space-y-2 ml-1">
                {data.accomplishments.map((item, i) => (
                  <motion.li
                    key={i}
                    className="text-[14px] text-gray-600 flex gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + i * 0.03 }}
                  >
                    <span className="text-gray-300">—</span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}

          {/* Problems */}
          {data.problems.length > 0 && (
            <motion.div
              className="mb-8 border-l-2 border-amber-200 pl-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-xs font-medium text-amber-500 uppercase tracking-wide mb-2">Issues</p>
              {data.problems.map((item, i) => (
                <p key={i} className="text-sm text-gray-600 mb-1" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </motion.div>
          )}

          {/* Struggles */}
          {data.struggles.length > 0 && (
            <motion.div
              className="mb-8 border-l-2 border-red-200 pl-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Struggles</p>
              {data.struggles.map((item, i) => (
                <p key={i} className="text-sm text-gray-600 mb-1">{item}</p>
              ))}
            </motion.div>
          )}

          {/* Stats footer — subtle */}
          {(data.stats.subagentsSpawned > 0 || data.stats.totalCost > 0) && (
            <motion.footer
              className="border-t border-gray-100 pt-5 mt-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex flex-wrap gap-5 text-xs text-gray-400">
                {data.stats.subagentsSpawned > 0 && (
                  <span>{data.stats.subagentsSpawned} subagents</span>
                )}
                {data.stats.activeTimeMinutes > 0 && (
                  <span>{formatActiveTime(data.stats.activeTimeMinutes)} compute</span>
                )}
                {data.stats.totalTokens > 0 && (
                  <span>{data.stats.totalTokens.toLocaleString()} tokens</span>
                )}
                {data.stats.totalCost > 0 && (
                  <span>${data.stats.totalCost.toFixed(2)}</span>
                )}
              </div>
            </motion.footer>
          )}
        </motion.div>
      )}
    </div>
  );
}
