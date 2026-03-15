'use client';

import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { renderMarkdown } from '@/lib/markdown';

type Role = 'user' | 'assistant';
type Message = { role: Role; content: string };
type Provider = 'openai' | 'anthropic';

const MODELS: { id: string; label: string; provider: Provider }[] = [
  { id: 'gpt-4o',                      label: 'GPT-4o',             provider: 'openai' },
  { id: 'gpt-4o-mini',                 label: 'GPT-4o mini',        provider: 'openai' },
  { id: 'claude-opus-4-6',             label: 'Claude Opus 4.6',    provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',           label: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4.5',   provider: 'anthropic' },
];

const KEYS_KEY   = 'gippidy-keys';
const MODEL_KEY  = 'gippidy-model';
const SYSTEM_KEY = 'gippidy-system';

export default function Home() {
  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [model, setModel]                   = useState('claude-sonnet-4-6');
  const [apiKeys, setApiKeys]               = useState<Record<Provider, string>>({ openai: '', anthropic: '' });
  const [systemPrompt, setSystemPrompt]     = useState('');
  const [streaming, setStreaming]           = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showSettings, setShowSettings]     = useState(false);
  const [serverKeys, setServerKeys]         = useState<Record<Provider, boolean>>({ openai: false, anthropic: false });
  const bottomRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const keys   = localStorage.getItem(KEYS_KEY);
    const saved  = localStorage.getItem(MODEL_KEY);
    const system = localStorage.getItem(SYSTEM_KEY);
    if (keys)   setApiKeys(JSON.parse(keys));
    if (saved)  setModel(saved);
    if (system) setSystemPrompt(system);

    fetch('/api/config')
      .then(r => r.json())
      .then(setServerKeys)
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const saveKeys = (keys: Record<Provider, string>) => {
    setApiKeys(keys);
    localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    localStorage.setItem(MODEL_KEY, m);
  };

  const handleSystemChange = (s: string) => {
    setSystemPrompt(s);
    localStorage.setItem(SYSTEM_KEY, s);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || streaming) return;

    const provider = MODELS.find(m => m.id === model)?.provider ?? 'openai';
    const apiKey   = apiKeys[provider];

    if (!apiKey && !serverKeys[provider]) {
      setShowSettings(true);
      return;
    }

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setStreaming(true);
    setStreamingContent('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // omit apiKey if empty — server will use its env var
        body: JSON.stringify({ messages: newMessages, model, apiKey: apiKey || undefined, systemPrompt }),
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages(m => [...m, { role: 'assistant', content: `[ERROR] ${err}` }]);
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let content   = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setStreamingContent(content);
      }

      setMessages(m => [...m, { role: 'assistant', content }]);
      setStreamingContent('');
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `[ERROR] ${String(err)}` }]);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="app">
      <header>
        <span className="logo">GIPPIDY</span>
        <select value={model} onChange={e => handleModelChange(e.target.value)}>
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div className="header-spacer" />
        <button onClick={() => setShowSettings(s => !s)}>[SETTINGS]</button>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}>[CLEAR]</button>
        )}
        <button onClick={() => signOut({ callbackUrl: '/login' })}>[SIGN OUT]</button>
      </header>

      {showSettings && (
        <div className="settings">
          <div className="settings-row">
            <label>OpenAI API Key</label>
            <input
              type="password"
              value={apiKeys.openai}
              onChange={e => saveKeys({ ...apiKeys, openai: e.target.value })}
              placeholder={serverKeys.openai ? 'server key configured' : 'sk-...'}
            />
          </div>
          <div className="settings-row">
            <label>Anthropic API Key</label>
            <input
              type="password"
              value={apiKeys.anthropic}
              onChange={e => saveKeys({ ...apiKeys, anthropic: e.target.value })}
              placeholder={serverKeys.anthropic ? 'server key configured' : 'sk-ant-...'}
            />
          </div>
          <div className="settings-row">
            <label>System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={e => handleSystemChange(e.target.value)}
              placeholder="Optional system instructions..."
            />
          </div>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && !streaming && (
          <div className="empty">&gt; ready. select a model and start typing.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <span className="role">{msg.role === 'user' ? '>' : '#'}</span>
            {msg.role === 'assistant'
              ? <div className="content" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              : <span className="content">{msg.content}</span>
            }
          </div>
        ))}
        {streaming && (
          <div className="message assistant">
            <span className="role">#</span>
            {streamingContent
              ? <div className="content" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
              : <span className="content thinking">...</span>
            }
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <span className="input-prompt">&gt;</span>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="type a message… (enter to send, shift+enter for newline)"
          disabled={streaming}
          rows={1}
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          {streaming ? '[…]' : '[SEND]'}
        </button>
      </form>
    </div>
  );
}
