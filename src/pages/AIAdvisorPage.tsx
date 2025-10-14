// bua/pages/AIAdvisorPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types';
import { geminiService } from '../lib/gemini';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Spinner } from '@/components/Spinner';
import { IconPaperAirplane, IconSparkles } from '@/components/Icons';

interface AIAdvisorPageProps {
  onNavigate: (page: string, context?: any) => void;
}

const AIAdvisorPage: React.FC<AIAdvisorPageProps> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'ai',
      text:
        "Hi! I'm Bua, your AI advisor. You can ask me anything about school life, from policies to clubs. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  
  const lastUserTextRef = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages, isLoading]);

  const handleSend = async () => {
    if (isLoading) return;                 
    const trimmed = input.trim();
    if (!trimmed) return;

    
    lastUserTextRef.current = trimmed;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const aiText = await geminiService.getAdvisorResponse(trimmed);
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), sender: 'ai', text: aiText };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && !isLoading) handleSend();
  };

  const startReportFromLastUser = () =>
    onNavigate('report', { prefill: lastUserTextRef.current });

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">AI Advisor</h1>
      <Card className="flex-grow flex flex-col">
        <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-4">
          {messages.map((msg) => {
            const isAI = msg.sender === 'ai';
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${!isAI ? 'justify-end' : ''}`}>
                {isAI && (
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                    <IconSparkles />
                  </div>
                )}
                <div
                  className={`max-w-md p-3 rounded-lg ${
                    !isAI
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* If the latest AI message invites to start a report, show CTA */}
                  {isAI && msg.text.toLowerCase().includes('start a report') && (
                    <Button className="mt-3" variant="secondary" onClick={startReportFromLastUser}>
                      Start a Report
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                <IconSparkles />
              </div>
              <div className="max-w-md p-3 rounded-lg bg-slate-200 dark:bg-slate-700">
                <div className="flex items-center gap-2 text-slate-500">
                  <Spinner /> Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about rules, clubs, wellbeing..."
            disabled={isLoading}
            aria-label="Chat input"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} aria-label="Send message">
            {isLoading ? <Spinner /> : <IconPaperAirplane />}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AIAdvisorPage;
