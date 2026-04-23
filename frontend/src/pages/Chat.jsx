import React, { useState, useRef, useEffect } from 'react';
import { Send, BotMessageSquare, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BOT_NAME = 'Ransara Support AI';

function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }

    try {
      const res = await fetch('http://localhost:8000/chat/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Just load the most recent session if it exists, or create new.
        if (data && data.length > 0) {
          const latestSession = data[0];
          setSessionToken(latestSession.session_token);
          const formatted = latestSession.messages.map(msg => ({
            from: msg.role === 'assistant' ? 'bot' : 'user',
            text: msg.content,
            time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setMessages(formatted);
        } else {
          // New conversation
          setMessages([{ from: 'bot', text: 'Hello! I am Ransara AI Support. How can I help you today?', time: formatTime() }]);
        }
      }
    } catch {
      console.error("Failed to load chat history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || loading) return;

    const userText = inputText;
    const userMsg = { from: 'user', text: userText, time: formatTime() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const payload = { content: userText };
      if (sessionToken) payload.session_token = sessionToken;

      const res = await fetch('http://localhost:8000/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.session_token) setSessionToken(data.session_token);
        setMessages(prev => [...prev, { from: 'bot', text: data.assistant.content, time: formatTime() }]);
      } else {
        setMessages(prev => [...prev, { from: 'bot', text: "I'm having trouble processing that right now.", time: formatTime() }]);
      }
    } catch {
      setMessages(prev => [...prev, { from: 'bot', text: 'Connection error. Please check your network.', time: formatTime() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (historyLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
        <p style={{ color: 'var(--text-light)' }}>Loading your conversation...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto' }}>
      <div style={{ marginBottom: '25px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>AI Support</h1>
        <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Ask questions about orders, products, and more.</p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '650px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        
        {/* Chat Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', backgroundColor: 'var(--color-primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0, 162, 71, 0.2)' }}>
              <BotMessageSquare size={22} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-main)' }}>{BOT_NAME}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-primary)', fontWeight: '500' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'inline-block' }}></span>
                Online
              </div>
            </div>
          </div>
        </div>

        {/* Messages Layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'white' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%',
                padding: '14px 18px',
                borderRadius: msg.from === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                backgroundColor: msg.from === 'user' ? 'var(--color-primary)' : 'var(--bg-main)',
                color: msg.from === 'user' ? 'white' : 'var(--text-main)',
                fontSize: '15px',
                lineHeight: '1.5',
                boxShadow: msg.from === 'user' ? '0 4px 12px rgba(0, 162, 71, 0.15)' : 'none',
              }}>
                {msg.text}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '6px', padding: '0 4px' }}>{msg.time}</span>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
               <div style={{ padding: '14px 18px', borderRadius: '4px 20px 20px 20px', backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '15px' }}>
                Typing...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-main)' }}>
          <form 
            onSubmit={handleSend}
            style={{ display: 'flex', gap: '12px' }}
          >
            <input
              type="text"
              placeholder="Ask me anything..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{ flex: 1, padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-light)', fontSize: '15px', backgroundColor: 'white', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,162,71,0.1)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button 
              type="submit"
              disabled={loading}
              style={{ backgroundColor: loading ? 'var(--text-light)' : 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '12px', width: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s', boxShadow: loading ? 'none' : '0 4px 12px rgba(0, 162, 71, 0.2)' }}
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Chat;
