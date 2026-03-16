'use client';

import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { renderMarkdown } from '@/lib/markdown';

type Role = 'user' | 'assistant';
type Image = { data: string; mimeType: string }; // base64, no prefix
type Message = { role: Role; content: string; html?: string; images?: Image[] };

const MODELS = [
  { id: 'gpt-5.4',                label: 'GPT-5.4',           provider: 'openai' },
  { id: 'claude-opus-4-6',        label: 'Claude Opus 4.6',   provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',      label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',    provider: 'google' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',    provider: 'google' },
];

const MODEL_KEY = 'gippidy-model';

export default function Home() {
  const [messages, setMessages]                 = useState<Message[]>([]);
  const [input, setInput]                       = useState('');
  const [model, setModel]                       = useState('claude-sonnet-4-6');
  const [systemPrompt, setSystemPrompt]         = useState('');
  const [streaming, setStreaming]               = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showSettings, setShowSettings]         = useState(false);
  const [pendingImages, setPendingImages]       = useState<Image[]>([]);
  const [shareLabel, setShareLabel]             = useState('[SHARE]');
  const bottomRef      = useRef<HTMLDivElement>(null);
  const messagesRef    = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const fileRef        = useRef<HTMLInputElement>(null);
  const pinnedRef        = useRef(true);
  const lastScrollTop    = useRef(0);
  const saveSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamBufferRef  = useRef('');
  const rafRef           = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved) setModel(saved);

    fetch('/api/settings')
      .then(r => r.json())
      .then(({ systemPrompt }) => { if (systemPrompt) setSystemPrompt(systemPrompt); })
      .catch(() => {});

    const fork = localStorage.getItem('gippidy-fork');
    if (fork) {
      const { messages: m, model: mo, systemPrompt: sp } = JSON.parse(fork);
      setMessages(m);
      setModel(mo);
      localStorage.setItem(MODEL_KEY, mo);
      if (sp) { setSystemPrompt(sp); }
      localStorage.removeItem('gippidy-fork');
    }
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (atBottom) {
        pinnedRef.current = true;
      } else if (el.scrollTop < lastScrollTop.current) {
        // Only unpin when the user actually scrolls up, not on viewport resize
        pinnedRef.current = false;
      }
      lastScrollTop.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pinnedRef.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleShare = async () => {
    setShareLabel('[SHARING…]');
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model, systemPrompt }),
      });
      const { id } = await res.json();
      await navigator.clipboard.writeText(`${window.location.origin}/share/${id}`);
      setShareLabel('[COPIED!]');
    } catch {
      setShareLabel('[ERROR]');
    }
    setTimeout(() => setShareLabel('[SHARE]'), 3000);
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    localStorage.setItem(MODEL_KEY, m);
  };

  const handleSystemChange = (s: string) => {
    setSystemPrompt(s);
    if (saveSettingsTimer.current) clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: s }),
      });
    }, 600);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);

    if (imageFiles.length === 0) return;
    e.preventDefault();
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = (reader.result as string).split(',')[1];
        setPendingImages(imgs => [...imgs, { data, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const data = dataUrl.split(',')[1];
        setPendingImages(imgs => [...imgs, { data, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && pendingImages.length === 0) || streaming) return;

    // Focus synchronously here — iOS only honours programmatic focus
    // when called within the originating user gesture handler.
    textareaRef.current?.focus();

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
    };
    const newMessages = [...messages, userMessage];
    pinnedRef.current = true;
    setMessages(newMessages);
    setInput('');
    setPendingImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setStreaming(true);
    setStreamingContent('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, model, systemPrompt }),
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
        streamBufferRef.current = content;
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            setStreamingContent(streamBufferRef.current);
            rafRef.current = null;
          });
        }
      }

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setMessages(m => [...m, { role: 'assistant', content, html: renderMarkdown(content) }]);
      setStreamingContent('');
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `[ERROR] ${String(err)}` }]);
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="app">
      <header>
        <a className="logo" href="/">GIPPIDY</a>
        <span className="model-label">{MODELS.find(m => m.id === model)?.label}</span>
        <div className="header-spacer" />
        <div className="header-actions">
          <button onClick={() => setShowSettings(s => !s)}>[SETTINGS]</button>
          {messages.length > 0 && !streaming && (
            <button onClick={handleShare}>{shareLabel}</button>
          )}
          {messages.length > 0 && (
            <button onClick={() => setMessages([])}>[CLEAR]</button>
          )}
          <button onClick={() => signOut({ callbackUrl: '/login' })}>[SIGN OUT]</button>
        </div>
      </header>

      {showSettings && (
        <div className="settings">
          <div className="settings-row">
            <label>Model</label>
            <select value={model} onChange={e => handleModelChange(e.target.value)}>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
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

      <div className="messages" ref={messagesRef}>
        {messages.length === 0 && !streaming && (
          <div className="empty">&gt; ready. select a model and start typing.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <span className="role">{msg.role === 'user' ? '>' : '#'}</span>
            <div className="content">
              {msg.images && msg.images.length > 0 && (
                <div className="message-images">
                  {msg.images.map((img, j) => (
                    <img key={j} src={`data:${img.mimeType};base64,${img.data}`} alt="" className="message-image" />
                  ))}
                </div>
              )}
              {msg.role === 'assistant'
                ? <div dangerouslySetInnerHTML={{ __html: msg.html ?? renderMarkdown(msg.content) }} />
                : msg.content && <span>{msg.content}</span>
              }
            </div>
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
        {pendingImages.length > 0 && (
          <div className="pending-images">
            {pendingImages.map((img, i) => (
              <div key={i} className="pending-image">
                <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
                <button type="button" onClick={() => setPendingImages(imgs => imgs.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <span className="input-prompt">&gt;</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="type a message… (enter to send, shift+enter for newline)"
            rows={1}
          />
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={streaming}>[IMG]</button>
          <button
            type="submit"
            disabled={streaming || (!input.trim() && pendingImages.length === 0)}
            onPointerDown={(e) => e.preventDefault()}
          >
            {streaming ? '[…]' : '[SEND]'}
          </button>
        </div>
      </form>
    </div>
  );
}
