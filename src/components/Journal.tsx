'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import { fadeInUp, staggerContainer, staggerContainerSlow, popIn } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface NarrativeJournal {
  date: string;
  dayLabel: string;
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
  'bg-orange-50 text-orange-600 border-orange-200',
  'bg-pink-50 text-pink-600 border-pink-200',
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
      const data = await apiJson<NarrativeJournal>(`/api/journal?date=${date}`);
      setData(data);
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
        Loading journal…
      </motion.div>
    </div>
  );
  if (!data) return <div className="text-gray-400 py-20 text-center">No data available</div>;

  const isEmpty = data.accomplishments.length === 0 && data.problems.length === 0 && data.struggles.length === 0 && data.stats.totalTokens === 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Cron note */}
      <motion.div
        className="text-xs text-gray-400 mb-6 flex items-center gap-1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        auto-logged daily at 12:00 AM PHT
      </motion.div>

      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-8">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </motion.button>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" disabled={isToday}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </motion.button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-500 bg-white" />
        {!isToday && <button onClick={() => setDate(new Date().toISOString().slice(0, 10))} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Today</button>}
        {isToday && (
          <motion.span
            className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium border border-green-200"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >Live</motion.span>
        )}
      </div>

      {/* Date header */}
      <motion.h1
        className="text-4xl font-bold text-gray-900 tracking-tight mb-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        key={data.date}
      >{data.dayLabel}</motion.h1>
      <p className="text-sm text-gray-400 mb-6">Daily Brief</p>

      {isEmpty ? (
        <motion.div
          className="text-center py-20 text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-4xl mb-3">📓</p>
          <p>No activity recorded for this day</p>
        </motion.div>
      ) : (
        <motion.div variants={staggerContainerSlow} initial="hidden" animate="visible" key={data.date}>
          {/* Tags */}
          {data.tags.length > 0 && (
            <motion.div className="flex flex-wrap gap-2 mb-10" variants={staggerContainer} initial="hidden" animate="visible">
              {data.tags.map((tag, i) => (
                <motion.span
                  key={tag}
                  variants={popIn}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TAG_COLORS[i % TAG_COLORS.length]}`}
                >
                  #{tag}
                </motion.span>
              ))}
            </motion.div>
          )}

          {/* What We Did Today */}
          {data.accomplishments.length > 0 && (
            <motion.section className="mb-10" variants={fadeInUp}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-green-500">✦</span> What We Did Today
              </h2>
              <motion.ul className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                {data.accomplishments.map((item, i) => (
                  <motion.li key={i} variants={fadeInUp} className="flex gap-3 text-gray-700 leading-relaxed">
                    <span className="text-gray-300 mt-0.5 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.section>
          )}

          {/* Problems and Solutions */}
          {data.problems.length > 0 && (
            <motion.section className="mb-10" variants={fadeInUp}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-amber-500">⚡</span> Problems &amp; Solutions
              </h2>
              <motion.ul className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                {data.problems.map((item, i) => (
                  <motion.li key={i} variants={fadeInUp} className="flex gap-3 text-gray-700 leading-relaxed">
                    <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>
                    <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  </motion.li>
                ))}
              </motion.ul>
            </motion.section>
          )}

          {/* Struggles */}
          {data.struggles.length > 0 && (
            <motion.section className="mb-10" variants={fadeInUp}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-red-400">🔥</span> Struggles
              </h2>
              <motion.ul className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                {data.struggles.map((item, i) => (
                  <motion.li key={i} variants={fadeInUp} className="flex gap-3 text-gray-600 leading-relaxed">
                    <span className="text-red-300 mt-0.5 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.section>
          )}

          {/* Stats footer */}
          <motion.footer className="border-t border-gray-100 pt-6 mt-12" variants={fadeInUp}>
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-1.5">
                <span>📊</span>
                <span>{data.stats.totalTokens.toLocaleString()} tokens</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>💰</span>
                <span>${data.stats.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>🤖</span>
                <span>{data.stats.subagentsSpawned} subagents spawned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>⏱️</span>
                <span>{formatActiveTime(data.stats.activeTimeMinutes)} active</span>
              </div>
            </div>
          </motion.footer>
        </motion.div>
      )}
    </div>
  );
}
