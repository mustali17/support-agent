import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import api, { errorMessage } from '../api';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null); // null = new conversation
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    api
      .get('/chat/history')
      .then((r) => {
        setConversations(r.data.conversations);
        if (r.data.conversations[0]) setActiveId(r.data.conversations[0].id);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const active = conversations.find((c) => c.id === activeId);
  const messages = active?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    setSending(true);

    // Optimistically show the user's message.
    const tempId = activeId || 'temp';
    setConversations((prev) => {
      const msg = { role: 'user', content: text };
      if (activeId) return prev.map((c) => (c.id === activeId ? { ...c, messages: [...c.messages, msg] } : c));
      return [{ id: tempId, title: text.slice(0, 60), messages: [msg] }, ...prev];
    });
    setActiveId(tempId);

    try {
      const { data } = await api.post('/chat/send', { message: text, conversationId: activeId });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? { ...c, id: data.conversationId, title: data.title, messages: [...c.messages, { role: 'assistant', content: data.reply }] }
            : c
        )
      );
      setActiveId(data.conversationId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this conversation?')) return;
    try {
      await api.delete(`/chat/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <button className="new" onClick={() => setActiveId(null)}>+ New chat</button>
        <div className="convos">
          {conversations.map((c) => (
            <div key={c.id} className={`convo ${c.id === activeId ? 'on' : ''}`} onClick={() => setActiveId(c.id)}>
              <span>{c.title}</span>
              {c.id !== 'temp' && (
                <button
                  className="del"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                >×</button>
              )}
            </div>
          ))}
          {!conversations.length && <p className="muted pad">No conversations yet</p>}
        </div>
        <div className="user">
          <span>{user.name}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="chat">
        <div className="messages">
          {!messages.length && <p className="muted pad">Hi {user.name}! How can I help you today?</p>}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>{m.content}</div>
          ))}
          {sending && (
            <div className="msg assistant typing"><i /><i /><i /></div>
          )}
          <div ref={bottomRef} />
        </div>
        {error && <div className="error bar">{error}</div>}
        <form className="composer" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            maxLength={2000}
            autoFocus
          />
          <button disabled={sending || !input.trim()}>Send</button>
        </form>
      </main>
    </div>
  );
}
