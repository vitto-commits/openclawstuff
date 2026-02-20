'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp } from '@/lib/animations';
import { apiJson } from '@/lib/api';

type Agent = 'otto' | 'felix' | 'nova';
type Message = {
  id: string;
  agent_name: Agent;
  content: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
};

const agents: { id: Agent; name: string; emoji: string; color: string; bgColor: string }[] = [
  { id: 'otto', name: 'Otto', emoji: '🛡️', color: '#3B82F6', bgColor: '#EFF6FF' },
  { id: 'felix', name: 'Felix', emoji: '🔧', color: '#F59E0B', bgColor: '#FFFBEB' },
  { id: 'nova', name: 'Nova', emoji: '📝', color: '#8B5CF6', bgColor: '#F5F3FF' },
];

export default function MultiAgentChat() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>('otto');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentAgent = agents.find(a => a.id === selectedAgent);

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const data = await apiJson<any>('/api/messages?agent=' + selectedAgent);
        const items = Array.isArray(data) ? data : data?.items || [];
        setMessages(items.reverse());
      } catch (e) {
        console.error('Failed to load messages:', e);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [selectedAgent]);

  // Reload messages when agent changes
  useEffect(() => {
    setLoading(true);
    const loadMessages = async () => {
      try {
        const data = await apiJson<any>('/api/messages?agent=' + selectedAgent);
        const items = Array.isArray(data) ? data : data?.items || [];
        setMessages(items.reverse());
      } catch (e) {
        console.error('Failed to load messages:', e);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(loadMessages, 100);
    return () => clearTimeout(timer);
  }, [selectedAgent]);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await apiJson<any>('/api/messages?agent=' + selectedAgent);
        const items = Array.isArray(data) ? data : data?.items || [];
        setMessages(items.reverse());
      } catch (e) {
        console.error('Failed to poll messages:', e);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedAgent]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !currentAgent) return;

    setSending(true);
    const newMessage = input;
    setInput('');

    try {
      const response = await apiJson<any>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          agent_name: selectedAgent,
          content: newMessage,
          direction: 'inbound',
        }),
      });

      if (response) {
        // Refresh messages
        const data = await apiJson<any>('/api/messages?agent=' + selectedAgent);
        const items = Array.isArray(data) ? data : data?.items || [];
        setMessages(items.reverse());
      }
    } catch (e) {
      console.error('Failed to send message:', e);
      setInput(newMessage); // restore input on error
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* LEFT SIDEBAR - Agent List */}
      <div className="w-48 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agents</h3>
        </div>

        <nav className="flex-1 overflow-y-auto">
          {agents.map(agent => (
            <motion.button
              key={agent.id}
              onClick={() => setSelectedAgent(agent.id)}
              className={`w-full text-left px-4 py-3 border-l-2 transition-colors flex items-center gap-2 ${
                selectedAgent === agent.id
                  ? 'bg-gray-50 border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-lg flex-shrink-0">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{agent.name}</p>
                {selectedAgent === agent.id && messages.length > 0 && (
                  <p className="text-xs text-gray-400 truncate">
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              {selectedAgent === agent.id && (
                <motion.div
                  className="w-2 h-2 bg-gray-900 rounded-full"
                  layoutId="agent-indicator"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </motion.button>
          ))}
        </nav>
      </div>

      {/* RIGHT PANEL - Chat Thread */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <span className="text-2xl">{currentAgent?.emoji}</span>
          <div>
            <h2 className="font-semibold text-gray-900">{currentAgent?.name}</h2>
            <p className="text-xs text-gray-400">{messages.length} messages</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400 text-sm">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-2">No messages yet</p>
                <p className="text-xs text-gray-300">Start a conversation</p>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isAgent = msg.direction === 'outbound';
                const agentColor = agents.find(a => a.id === msg.agent_name)?.color || '#666';
                const agentBg = agents.find(a => a.id === msg.agent_name)?.bgColor || '#f0f0f0';

                return (
                  <motion.div
                    key={msg.id || idx}
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-3 rounded-lg ${
                        isAgent
                          ? `bg-gray-100 text-gray-900`
                          : `text-white`
                      }`}
                      style={!isAgent ? { backgroundColor: agentColor } : undefined}
                    >
                      <p className="text-sm break-words">{msg.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isAgent ? 'text-gray-500' : 'text-white/70'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={`Message ${currentAgent?.name}...`}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
              disabled={sending}
            />
            <motion.button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {sending ? '...' : 'Send'}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
