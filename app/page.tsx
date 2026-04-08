'use client';

import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { renderMarkdown } from '@/lib/markdown';
import { getOrCreateKey, encrypt, decrypt } from '@/lib/crypto';
import { MODELS } from '@/lib/models';
import type { Role, Image, Pdf, Message } from '@/lib/chat';

type PendingFile = { name: string; content: string };         // text/code files
type PendingPdf  = Pdf;

const MODEL_KEY    = 'gippidy-model';
const KEY_WARNED   = 'gippidy-key-warned';

type HistoryItem = { id: string; title: string; updatedAt: string; messages: Message[]; model: string; systemPrompt: string };

function parseStreamError(status: number, body: string): string {
  if (status === 429) return '[RATE LIMITED] Wait a moment and try again.';
  if (status === 401 || status === 403) return '[AUTH ERROR] API key issue — contact the admin.';
  const b = body.toLowerCase();
  if (
    b.includes('context_length_exceeded') ||
    b.includes('maximum context length') ||
    b.includes('prompt is too long') ||
    b.includes('tokens exceed') ||
    b.includes('reduce your prompt')
  ) return '[TOO LONG] Conversation exceeds this model\'s context limit. Use [CLEAR] to start fresh.';
  if (status >= 500) return `[SERVER ERROR] The model returned an error (${status}). Try again.`;
  return `[ERROR ${status}] ${body.slice(0, 120)}`;
}

function readImageFiles(files: File[], onEach: (img: Image) => void) {
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string).split(',')[1];
      onEach({ data, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  });
}

function readTextFiles(files: File[], onEach: (f: PendingFile) => void) {
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => onEach({ name: file.name, content: reader.result as string });
    reader.readAsText(file);
  });
}

function readPdfFiles(files: File[], onEach: (f: PendingPdf) => void) {
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string).split(',')[1];
      onEach({ name: file.name, data });
    };
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [messages, setMessages]                 = useState<Message[]>([]);
  const [input, setInput]                       = useState('');
  const [model, setModel]                       = useState('claude-sonnet-4-6');
  const [systemPrompt, setSystemPrompt]         = useState('');
  const [streaming, setStreaming]               = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [connected, setConnected]               = useState(false);
  const [showSettings, setShowSettings]         = useState(false);
  const [pendingImages, setPendingImages]       = useState<Image[]>([]);
  const [pendingFiles, setPendingFiles]         = useState<PendingFile[]>([]);
  const [pendingPdfs, setPendingPdfs]           = useState<PendingPdf[]>([]);
  const [shareLabel, setShareLabel]             = useState('[SHARE]');
  const [showScrollBtn, setShowScrollBtn]       = useState(false);
  const [copiedMsgIndex, setCopiedMsgIndex]     = useState<number | null>(null);
  const [editingIndex, setEditingIndex]         = useState<number | null>(null);
  const [editingContent, setEditingContent]     = useState('');
  const [savedFlash, setSavedFlash]             = useState(false);
  const [webSearch, setWebSearch]               = useState(false);
  const [webSearchPhase, setWebSearchPhase]     = useState<'off' | 'searching' | 'generating'>('off');
  const webSearchPhaseRef = useRef<'off' | 'searching' | 'generating'>('off');
  const [saveHistory, setSaveHistory]           = useState(false);
  const [showHistory, setShowHistory]           = useState(false);
  const [historyItems, setHistoryItems]         = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading]     = useState(false);
  const [historySearch, setHistorySearch]       = useState('');
  const chatIdRef    = useRef<string | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const messagesRef        = useRef<HTMLDivElement>(null);
  const textareaRef        = useRef<HTMLTextAreaElement>(null);
  const fileRef            = useRef<HTMLInputElement>(null);
  const pinnedRef          = useRef(true);
  const lastScrollTop      = useRef(0);
  const saveSettingsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivedRef        = useRef('');
  const displayPosRef      = useRef(0);
  const streamDoneRef      = useRef(false);
  const rafRef             = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputHistoryRef    = useRef<string[]>([]);
  const historyIndexRef    = useRef(-1);
  const draftInputRef      = useRef('');

  // Resolves when the crypto key has been loaded from/saved to the server.
  // loadHistory awaits this so it never races against the settings fetch.
  const keyResolveRef = useRef<(() => void) | null>(null);
  const keyReadyRef   = useRef<Promise<void>>(new Promise(resolve => { keyResolveRef.current = resolve; }));

  useEffect(() => {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved) setModel(saved);

    fetch('/api/settings')
      .then(r => r.json())
      .then(async ({ systemPrompt, saveHistory: sh, keyJwk }) => {
        if (systemPrompt) setSystemPrompt(systemPrompt);
        if (sh) setSaveHistory(true);
        // Load or create the encryption key (shared across all deployments via DB)
        const { key, jwk } = await getOrCreateKey(keyJwk ?? null);
        cryptoKeyRef.current = key;
        keyResolveRef.current?.();
        if (jwk) {
          // New key (or migrated from localStorage) — save to server so all deployments use it
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: systemPrompt ?? '', saveHistory: sh ?? false, keyJwk: jwk }),
          }).catch(() => {});
        }
      })
      .catch(() => {});

    const fork = localStorage.getItem('gippidy-fork');
    if (fork) {
      const { messages: m, model: mo, systemPrompt: sp } = JSON.parse(fork);
      setMessages(m);
      setModel(mo);
      localStorage.setItem(MODEL_KEY, mo);
      if (sp) { setSystemPrompt(sp); }
      localStorage.removeItem('gippidy-fork');
      chatIdRef.current = null; // fork always starts a new history entry
    }
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      textareaRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (atBottom) {
        if (!pinnedRef.current) setShowScrollBtn(false);
        pinnedRef.current = true;
      } else if (el.scrollTop < lastScrollTop.current) {
        if (pinnedRef.current) setShowScrollBtn(true);
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

  const scrollToBottom = () => {
    pinnedRef.current = true;
    setShowScrollBtn(false);
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  };

  const handleShare = async () => {
    setShareLabel('[SHARING…]');
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model, systemPrompt }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        setShareLabel('[TOO LARGE]');
        setTimeout(() => alert(error), 0);
      } else {
        const { id } = await res.json();
        await navigator.clipboard.writeText(`${window.location.origin}/share/${id}`);
        setShareLabel('[COPIED!]');
      }
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
        body: JSON.stringify({ systemPrompt: s, saveHistory }),
      });
    }, 600);
  };

  const handleToggleSaveHistory = (val: boolean) => {
    setSaveHistory(val);
    if (val && !localStorage.getItem(KEY_WARNED)) {
      alert('Your encryption key is stored in this browser only.\nClearing browser data will make saved chats permanently unreadable.');
      localStorage.setItem(KEY_WARNED, '1');
    }
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, saveHistory: val }),
    });
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      await keyReadyRef.current;
      const key = cryptoKeyRef.current!;
      const res  = await fetch('/api/history');
      if (!res.ok) { console.error('history fetch failed', res.status, await res.text()); setHistoryItems([]); return; }
      const rows = await res.json() as { id: string; iv: string; ciphertext: string; updated_at: string }[];
      const results = await Promise.allSettled(rows.map(async row => {
        const data = await decrypt<{ messages: Message[]; model: string; systemPrompt: string; title: string }>(key, row.iv, row.ciphertext);
        return { id: row.id, updatedAt: row.updated_at, ...data };
      }));
      const items = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed) console.warn(`${failed} history row(s) failed to decrypt`);
      setHistoryItems(items);
    } catch (e) {
      console.error('loadHistory error', e);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    if (showHistory) { setShowHistory(false); setHistorySearch(''); return; }
    setShowHistory(true);
    await loadHistory();
  };

  const handleLoadChat = (item: HistoryItem) => {
    setMessages(item.messages);
    setModel(item.model);
    localStorage.setItem(MODEL_KEY, item.model);
    if (item.systemPrompt) setSystemPrompt(item.systemPrompt);
    chatIdRef.current = item.id;
    setShowHistory(false);
  };

  const handleDeleteChat = async (id: string) => {
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
    setHistoryItems(items => items.filter(i => i.id !== id));
    if (chatIdRef.current === id) chatIdRef.current = null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    historyIndexRef.current = -1;
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
    readImageFiles(imageFiles, img => setPendingImages(imgs => [...imgs, img]));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const all   = Array.from(e.target.files ?? []);
    const imgs  = all.filter(f => f.type.startsWith('image/'));
    const pdfs  = all.filter(f => f.type === 'application/pdf');
    const texts = all.filter(f => !f.type.startsWith('image/') && f.type !== 'application/pdf');
    readImageFiles(imgs, img => setPendingImages(imgs => [...imgs, img]));
    readPdfFiles(pdfs,   pdf => setPendingPdfs(ps => [...ps, pdf]));
    readTextFiles(texts, f   => setPendingFiles(fs => [...fs, f]));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    const all   = Array.from(e.dataTransfer.files);
    const imgs  = all.filter(f => f.type.startsWith('image/'));
    const pdfs  = all.filter(f => f.type === 'application/pdf');
    const texts = all.filter(f => !f.type.startsWith('image/') && f.type !== 'application/pdf');
    readImageFiles(imgs, img => setPendingImages(imgs => [...imgs, img]));
    readPdfFiles(pdfs,   pdf => setPendingPdfs(ps => [...ps, pdf]));
    readTextFiles(texts, f   => setPendingFiles(fs => [...fs, f]));
  };

  const doStream = async (msgs: Message[], useWebSearch = false) => {
    const SMOOTH_RATE = 3;

    pinnedRef.current = true;
    setShowScrollBtn(false);
    setMessages(msgs);
    setStreaming(true);
    setStreamingContent('');
    setConnected(false);
    receivedRef.current   = '';
    displayPosRef.current = 0;
    streamDoneRef.current = false;
    const phase = useWebSearch ? 'searching' : 'off';
    webSearchPhaseRef.current = phase;
    setWebSearchPhase(phase);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const finalize = (text: string) => {
      const finalMsgs: Message[] = [...msgs, { role: 'assistant', content: text, html: renderMarkdown(text) }];
      setMessages(finalMsgs);
      setStreamingContent('');
      setStreaming(false);
      textareaRef.current?.focus();
      webSearchPhaseRef.current = 'off';
      setWebSearchPhase('off');
      if (saveHistory) {
        (async () => {
          try {
            const key = cryptoKeyRef.current;
            if (!key) return;
            const title = finalMsgs.find(m => m.role === 'user')?.content.slice(0, 60) ?? 'Untitled';
            const toSave = finalMsgs.map(({ html: _, ...m }) => m);
            const { iv, ciphertext } = await encrypt(key, { messages: toSave, model, systemPrompt, title });
            const res = await fetch('/api/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: chatIdRef.current, iv, ciphertext }),
            });
            const { id } = await res.json();
            chatIdRef.current = id;
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
          } catch { /* non-critical */ }
        })();
      }
    };

    const doTick = () => {
      const received = receivedRef.current;
      const isDone   = streamDoneRef.current;
      const pos      = displayPosRef.current;

      if (pos < received.length) {
        const rate   = isDone ? Math.max(SMOOTH_RATE, Math.ceil((received.length - pos) / 8)) : SMOOTH_RATE;
        const newPos = Math.min(pos + rate, received.length);
        displayPosRef.current = newPos;
        setStreamingContent(received.slice(0, newPos));
      }

      if (isDone && displayPosRef.current >= received.length) {
        finalize(received);
        return;
      }

      rafRef.current = requestAnimationFrame(doTick);
    };
    rafRef.current = requestAnimationFrame(doTick);

    const cancelTicker = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs.map(({ html: _, ...m }) => m), model, systemPrompt, webSearch: useWebSearch }),
        signal: controller.signal,
      });

      if (!res.ok) {
        cancelTicker();
        const body = await res.text();
        setMessages(m => [...m, { role: 'assistant', content: parseStreamError(res.status, body) }]);
        setStreamingContent('');
        setStreaming(false);
        textareaRef.current?.focus();
        return;
      }

      const reader   = res.body!.getReader();
      const decoder  = new TextDecoder();
      let didConnect = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!didConnect) { didConnect = true; setConnected(true); }
        const raw = decoder.decode(value, { stream: true });
        if (raw.includes('\0') && webSearchPhaseRef.current === 'searching') {
          webSearchPhaseRef.current = 'generating';
          setWebSearchPhase('generating');
        }
        receivedRef.current += raw.replace(/\0/g, '');
      }

      streamDoneRef.current = true;

    } catch (err) {
      cancelTicker();
      const partial = receivedRef.current;
      setStreamingContent('');
      setStreaming(false);
      setWebSearchPhase('off');
      webSearchPhaseRef.current = 'off';
      textareaRef.current?.focus();
      if ((err as Error).name === 'AbortError') {
        if (partial) finalize(partial); // preserve whatever arrived before STOP
        return;
      }
      const errMsg = `[ERROR] ${String(err)}`;
      if (partial) {
        finalize(partial + '\n\n' + errMsg);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: errMsg }]);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0 && pendingPdfs.length === 0) || streaming) return;

    textareaRef.current?.focus();

    const trimmed = input.trim();
    if (trimmed) {
      inputHistoryRef.current = [trimmed, ...inputHistoryRef.current].slice(0, 50);
      historyIndexRef.current = -1;
    }

    // Attach file contents as XML-tagged blocks after the user's text
    const fileAttachments = pendingFiles
      .map(f => `<file name="${f.name}">\n${f.content}\n</file>`)
      .join('\n\n');
    const fullContent = [trimmed, fileAttachments].filter(Boolean).join('\n\n');

    const userMessage: Message = {
      role: 'user',
      content: fullContent,
      ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
      ...(pendingPdfs.length  > 0 ? { pdfs:   pendingPdfs  } : {}),
    };
    const currentWebSearch = webSearch;
    setInput('');
    setPendingImages([]);
    setPendingFiles([]);
    setPendingPdfs([]);
    setWebSearch(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    await doStream([...messages, userMessage], currentWebSearch);
  };

  const handleRetry = () => doStream(messages.slice(0, -1));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'ArrowUp') {
      const history = inputHistoryRef.current;
      if (!history.length) return;
      const el = e.currentTarget;
      const firstNewline = input.indexOf('\n');
      const firstLineEnd = firstNewline === -1 ? input.length : firstNewline;
      if (el.selectionStart > firstLineEnd) return;
      e.preventDefault();
      if (historyIndexRef.current === -1) draftInputRef.current = input;
      historyIndexRef.current = Math.min(historyIndexRef.current + 1, history.length - 1);
      setInput(inputHistoryRef.current[historyIndexRef.current]);
    }
    if (e.key === 'ArrowDown') {
      if (historyIndexRef.current === -1) return;
      historyIndexRef.current--;
      setInput(historyIndexRef.current === -1
        ? draftInputRef.current
        : inputHistoryRef.current[historyIndexRef.current]);
    }
  };

  const copyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgIndex(index);
    setTimeout(() => setCopiedMsgIndex(prev => prev === index ? null : prev), 2000);
  };

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditingContent(messages[i].content);
  };

  const confirmEdit = () => {
    if (editingIndex === null) return;
    const edited: Message = { ...messages[editingIndex], content: editingContent };
    setEditingIndex(null);
    doStream([...messages.slice(0, editingIndex), edited]);
  };

  const handleExport = () => {
    const modelLabel = MODELS.find(m => m.id === model)?.label ?? model;
    const date = new Date().toISOString().slice(0, 10);
    const lines: string[] = [`# Chat — ${date}`, ``, `**Model:** ${modelLabel}`, ``];
    for (const msg of messages) {
      lines.push(`---`, ``, `**${msg.role === 'user' ? 'User' : 'Assistant'}:**`, ``, msg.content, ``);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `gippidy-${date}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header>
        <a className="logo" href="/">GIPPIDY</a>
        <span className="model-label">
          {MODELS.find(m => m.id === model)?.label}
          {savedFlash && <span className="saved-flash"> ✓ saved</span>}
        </span>
        <div className="header-spacer" />
        <div className="header-actions">
          <button onClick={() => setShowSettings(s => !s)}>[SETTINGS]</button>
          {saveHistory && (
            <button onClick={handleOpenHistory}>{showHistory ? '[CHAT]' : '[HISTORY]'}</button>
          )}
          {messages.length > 0 && !streaming && (
            <button onClick={handleShare}>{shareLabel}</button>
          )}
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); chatIdRef.current = null; }}>[CLEAR]</button>
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
          <div className="settings-row">
            <label>Save History</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={saveHistory} onChange={e => handleToggleSaveHistory(e.target.checked)} />
              <span style={{ fontSize: 12, color: 'var(--dim)' }}>{saveHistory ? 'on — encrypted in this browser' : 'off'}</span>
            </label>
          </div>
          {messages.length > 0 && !streaming && (
            <div className="settings-row">
              <label>Export</label>
              <button onClick={handleExport}>[EXPORT MARKDOWN]</button>
            </div>
          )}
        </div>
      )}

      <div className="messages-wrapper">
        <div className="messages" ref={showHistory ? undefined : messagesRef}>
          {showHistory ? (
            <>
              {!historyLoading && historyItems.length > 0 && (
                <div className="history-search">
                  <input
                    autoFocus
                    type="text"
                    placeholder="search…"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                  />
                </div>
              )}
              {historyLoading && <div className="empty">decrypting…</div>}
              {!historyLoading && historyItems.length === 0 && (
                <div className="empty">no saved chats yet</div>
              )}
              {(() => {
                const q = historySearch.trim().toLowerCase();
                const filtered = q
                  ? historyItems.filter(i => i.title.toLowerCase().includes(q))
                  : historyItems;
                if (!historyLoading && q && filtered.length === 0) {
                  return <div className="empty">no matches</div>;
                }
                return filtered.map(item => (
                  <div key={item.id} className="history-item" onClick={() => handleLoadChat(item)}>
                    <span className="history-date">{item.updatedAt.slice(0, 10)}</span>
                    <span className="history-title">{item.title}</span>
                    <button
                      type="button"
                      className="history-delete"
                      onClick={e => { e.stopPropagation(); handleDeleteChat(item.id); }}
                    >×</button>
                  </div>
                ));
              })()}
            </>
          ) : (
            <>
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
                {editingIndex === i ? (
                  <div className="edit-form">
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmEdit(); if (e.key === 'Escape') setEditingIndex(null); }}
                      autoFocus
                    />
                    <div className="edit-actions">
                      <button type="button" onClick={confirmEdit}>[SEND]</button>
                      <button type="button" onClick={() => setEditingIndex(null)}>[CANCEL]</button>
                    </div>
                  </div>
                ) : (
                  msg.role === 'assistant'
                    ? <div dangerouslySetInnerHTML={{ __html: msg.html ?? renderMarkdown(msg.content) }} />
                    : msg.content && <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                )}
                {editingIndex === null && (
                  <div className="msg-actions">
                    {msg.role === 'assistant' && (
                      <button className="msg-copy-btn" onClick={() => copyMessage(msg.content, i)}>
                        {copiedMsgIndex === i ? '[COPIED!]' : '[COPY]'}
                      </button>
                    )}
                    {msg.role === 'assistant' && !streaming && i === messages.length - 1 && (
                      <button className="msg-retry-btn" onClick={handleRetry}>[RETRY]</button>
                    )}
                    {msg.role === 'user' && !streaming && (
                      <button className="msg-edit-btn" onClick={() => startEdit(i)}>[EDIT]</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {streaming && (
            <div className="message assistant">
              <span className="role">#</span>
              {streamingContent
                ? <div className="content" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
                : <span className="content thinking">
                    {!connected
                      ? <span className="waiting-cursor">▋</span>
                      : webSearchPhase === 'searching'
                        ? <>searching the web<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
                        : webSearchPhase === 'generating'
                          ? <>generating<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
                          : <>thinking<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
                    }
                  </span>
              }
            </div>
          )}
            </>
          )}
        </div>
        {!showHistory && showScrollBtn && (
          <button className="scroll-btn" onClick={scrollToBottom}>↓ latest</button>
        )}
      </div>

      <form
        className="input-area"
        onSubmit={handleSubmit}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {(pendingImages.length > 0 || pendingFiles.length > 0 || pendingPdfs.length > 0) && (
          <div className="pending-attachments">
            {pendingImages.map((img, i) => (
              <div key={`img-${i}`} className="pending-image">
                <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
                <button type="button" onClick={() => setPendingImages(imgs => imgs.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {pendingPdfs.map((p, i) => (
              <div key={`pdf-${i}`} className="pending-file">
                <span>📄 {p.name}</span>
                <button type="button" onClick={() => setPendingPdfs(ps => ps.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {pendingFiles.map((f, i) => (
              <div key={`file-${i}`} className="pending-file">
                <span>{f.name}</span>
                <button type="button" onClick={() => setPendingFiles(fs => fs.filter((_, j) => j !== i))}>×</button>
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,text/*,.json,.yaml,.yml,.toml,.md,.csv,.py,.js,.ts,.jsx,.tsx,.rs,.go,.rb,.java,.c,.cpp,.h,.cs,.swift,.sh,.sql"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="input-tools">
            <button type="button" className={webSearch ? 'btn-active' : ''} onClick={() => setWebSearch(s => !s)} disabled={streaming}>[WEB]</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={streaming}>[ATTACH]</button>
          </div>
          {streaming ? (
            <button type="button" onClick={() => abortControllerRef.current?.abort()}>[STOP]</button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0 && pendingPdfs.length === 0}
              onPointerDown={(e) => e.preventDefault()}
            >
              [SEND]
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
