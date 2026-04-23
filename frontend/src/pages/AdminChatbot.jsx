import React, { useState, useRef, useEffect } from 'react';
import { Send, X, BotMessageSquare, Package, Truck, HelpCircle, BadgeCheck } from 'lucide-react';

const BOT_NAME = 'Ransara Support Bot';

const QUICK_ACTIONS = [
  { label: 'Track Order', icon: BadgeCheck },
  { label: 'Product Inquiry', icon: Package },
  { label: 'Delivery Info', icon: Truck },
  { label: 'Help & Support', icon: HelpCircle },
];

const CHATBOT_STATS_MOCK = [
  { label: 'Conversations Today', value: '...' },
  { label: 'Avg Response Time', value: '...' },
  { label: 'Satisfaction Rate', value: '...' },
  { label: 'Active Users', value: '...' },
];

function AdminChatbot() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(CHATBOT_STATS_MOCK);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/chat/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setStats(await res.json());
    } catch {
      console.error("Failed to load stats");
    }
  };

  const fetchSessions = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/chat/admin/sessions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      console.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (sessionId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8000/chat/admin/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(msg => ({
          from: msg.role === 'assistant' ? 'bot' : 'user',
          text: msg.content,
          time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setSelectedSession(sessionId);
        setMessages(formatted);
      }
    } catch {
      console.error("Failed to load session messages");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async (text) => {
    // Admin replying to a customer session not yet supported fully here without backend socket, 
    // but we can mock sending a reply as the assistant temporarily or simply inform admins they are in read-only mode.
    // Assuming admin is just viewing since it's an AI chatbot.
    alert("Admins are currently in view-only mode for AI chat sessions.");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div>
      {/* HEADER */}
      <div style={{ marginBottom: '25px' }}>
        <h1 className="text-title" style={{ fontSize: '28px', marginBottom: '6px' }}>Customer Support Chatbot</h1>
        <p className="text-subtitle" style={{ fontSize: '14px', margin: 0 }}>AI-powered customer assistance</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }}>
        
        {/* CHAT WINDOW */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '600px' }}>
          
          {/* Chat Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '38px', height: '38px', backgroundColor: '#eefcf2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BotMessageSquare size={20} color="var(--color-primary)" />
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{BOT_NAME}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--color-primary)' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'inline-block' }}></span>
                  Online
                </div>
              </div>
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#f9fafb' }}>
            {messages.length === 0 && !selectedSession ? (
              <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--text-light)' }}>
                <BotMessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <p>Select a session to view the chat history</p>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--text-light)' }}>
                <p>No messages in this session.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%',
                    padding: '12px 16px',
                    borderRadius: msg.from === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    backgroundColor: msg.from === 'user' ? 'var(--color-primary)' : 'white',
                    color: msg.from === 'user' ? 'white' : 'var(--text-main)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                    border: msg.from === 'bot' ? '1px solid var(--border-light)' : 'none'
                  }}>
                    {msg.text}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '4px' }}>{msg.time}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', backgroundColor: 'white', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Admins cannot reply to AI conversations..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled
              className="input-field"
              style={{ flex: 1, padding: '10px 14px', fontSize: '14px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled
              className="btn btn-primary"
              style={{ padding: '10px 16px', borderRadius: '8px', opacity: 0.5, cursor: 'not-allowed' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Chat Sessions */}
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '400px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 16px 0' }}>Chat Sessions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', paddingRight: '10px' }}>
              {loading ? <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>Loading...</p> : 
               sessions.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>No active sessions.</p> :
               sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => loadSession(session.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '4px',
                    padding: '12px 14px', borderRadius: '8px',
                    border: selectedSession === session.id ? '2px solid var(--color-primary)' : '1px solid var(--border-light)', 
                    backgroundColor: selectedSession === session.id ? '#f0fdf4' : 'white',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => { if (selectedSession !== session.id) e.currentTarget.style.backgroundColor = '#f9fafb' }}
                  onMouseLeave={e => { if (selectedSession !== session.id) e.currentTarget.style.backgroundColor = 'white' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>User {session.user_id || 'Guest'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(session.created_at).toLocaleDateString()}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Session ID: {session.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chatbot Stats */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 16px 0' }}>Chatbot Stats</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {stats.map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AdminChatbot;
