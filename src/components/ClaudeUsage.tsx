'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface UsageData {
  current_session_pct?: number;
  current_session_resets_in?: string;
  weekly_all_models_pct?: number;
  weekly_all_models_resets?: string;
  weekly_sonnet_pct?: number;
  weekly_sonnet_resets?: string;
  scraped_at: string;
  minutesAgo?: number;
}

function getBarColor(pct: number | undefined): string {
  if (pct === undefined) return 'bg-gray-200';
  if (pct < 50) return 'bg-blue-500';
  if (pct < 80) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatReset(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffMs < 0) return 'Resetting soon';
    if (diffHours < 1) return `Resets in ${diffMins}m`;
    if (diffHours < 24) return `Resets in ${diffHours}h ${diffMins}m`;
    
    return `Resets ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

export default function ClaudeUsage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<UsageData>('/api/claude-usage');
      setUsage(data);
    } catch (error) {
      console.error('Failed to load Claude usage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <motion.div
        className="bg-white rounded-lg md:rounded-xl border border-gray-100 shadow-sm p-4 md:p-6 mb-4 md:mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-sm text-gray-400">Loading Claude usage...</p>
      </motion.div>
    );
  }

  if (!usage) {
    return (
      <motion.div
        className="bg-white rounded-lg md:rounded-xl border border-gray-100 shadow-sm p-4 md:p-6 mb-4 md:mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Claude Usage</h3>
        <p className="text-gray-400 text-sm">
          ⏳ Waiting for first sync...
        </p>
        <p className="text-xs text-gray-300 mt-2">
          The scraper runs every 30 minutes. Check back soon!
        </p>
      </motion.div>
    );
  }

  const metrics = [
    {
      label: 'Current Session',
      percentage: usage.current_session_pct,
      reset: usage.current_session_resets_in,
    },
    {
      label: 'Weekly (All Models)',
      percentage: usage.weekly_all_models_pct,
      reset: usage.weekly_all_models_resets,
    },
    {
      label: 'Weekly (Sonnet)',
      percentage: usage.weekly_sonnet_pct,
      reset: usage.weekly_sonnet_resets,
    },
  ];

  return (
    <motion.div
      className="bg-white rounded-lg md:rounded-xl border border-gray-100 shadow-sm p-4 md:p-6 mb-4 md:mb-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Claude Usage</h3>
        {usage.minutesAgo !== undefined && (
          <p className="text-xs text-gray-400">
            {usage.minutesAgo === 0 ? 'just now' : `${usage.minutesAgo}m ago`}
          </p>
        )}
      </div>

      <motion.div
        className="space-y-3 md:space-y-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {metrics.map((metric, idx) => (
          <motion.div key={idx} variants={fadeInUp}>
            <div className="flex items-center justify-between mb-1.5 md:mb-2">
              <label className="text-xs font-medium text-gray-600">
                {metric.label}
              </label>
              <span className="text-sm font-semibold text-gray-900">
                {metric.percentage !== undefined ? `${metric.percentage}%` : '—'}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 md:h-2.5 overflow-hidden">
              <motion.div
                className={`h-full ${getBarColor(metric.percentage)}`}
                style={{
                  width: metric.percentage !== undefined ? `${Math.min(metric.percentage, 100)}%` : '0%',
                }}
                initial={{ width: 0 }}
                animate={{
                  width: metric.percentage !== undefined ? `${Math.min(metric.percentage, 100)}%` : '0%',
                }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
              />
            </div>
            {metric.reset && (
              <p className="text-xs text-gray-400 mt-1">
                {formatReset(metric.reset)}
              </p>
            )}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
