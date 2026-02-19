'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface Skill {
  name: string;
  description: string;
  source: 'built-in' | 'custom';
  content: string;
  dirName: string;
}

export default function SkillsManager() {
  const [custom, setCustom] = useState<Skill[]>([]);
  const [builtin, setBuiltin] = useState<Skill[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiJson<any>('/api/skills')
      .then(d => {
        setCustom(Array.isArray(d?.custom) ? d.custom : []);
        setBuiltin(Array.isArray(d?.builtin) ? d.builtin : []);
      })
      .catch(() => {});
  }, []);

  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  const filter = (skills: Skill[]) =>
    search ? skills.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    ) : skills;

  const filteredCustom = filter(custom);
  const filteredBuiltin = filter(builtin);

  const SkillCard = ({ skill, index }: { skill: Skill; index: number }) => {
    const key = `${skill.source}-${skill.dirName}`;
    const isExpanded = expanded === key;
    return (
      <motion.div
        variants={fadeInUp}
        className={`border border-gray-200 rounded-xl bg-white transition-shadow duration-200 ${isExpanded ? 'shadow-md' : 'shadow-sm'}`}
        whileHover={!isExpanded ? { y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } : undefined}
        layout
      >
        <button
          onClick={() => toggle(key)}
          className="w-full text-left px-5 py-4 flex items-start gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 text-sm">{skill.name}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                skill.source === 'custom'
                  ? 'bg-purple-50 text-purple-600'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {skill.source}
              </span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{skill.description || 'No description'}</p>
          </div>
          <motion.svg
            className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </button>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4 border-t border-gray-100">
                <pre className="mt-3 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                  {skill.content}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const Section = ({ title, skills }: { title: string; skills: Skill[] }) => {
    if (skills.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{title} ({skills.length})</h2>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {skills.map((s, i) => <SkillCard key={`${s.source}-${s.dirName}`} skill={s} index={i} />)}
        </motion.div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Skills</h1>
          <p className="text-sm text-gray-500 mt-1">{custom.length + builtin.length} skills installed</p>
        </div>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
      </div>
      <Section title="Custom Skills" skills={filteredCustom} />
      <Section title="Built-in Skills" skills={filteredBuiltin} />
      {filteredCustom.length === 0 && filteredBuiltin.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-12">No skills found.</p>
      )}
    </div>
  );
}
