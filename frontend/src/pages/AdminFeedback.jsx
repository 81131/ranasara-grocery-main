import React, { useState, useEffect } from 'react';
import { Star, Reply, AlertTriangle, MessageSquare, Search, Pencil, Trash2 } from 'lucide-react';
function StarRating({ value }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={13} color={value >= i ? '#f59e0b' : '#d1d5db'} fill={value >= i ? '#f59e0b' : 'none'} />
      ))}
    </div>
  );
}

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [replyInputs, setReplyInputs] = useState({});
  const [stats, setStats] = useState(null);
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyText, setEditingReplyText] = useState('');

  const token = localStorage.getItem('token');

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch('http://localhost:8000/feedback/', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
      fetch('http://localhost:8000/feedback/stats', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
    ]).then(([data, statsData]) => {
      setFeedbacks(data);
      setStats(statsData);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleReply = async (id) => {
  const reply = replyInputs[id]?.trim();
  if (!reply) return;

  await fetch(`http://localhost:8000/feedback/${id}/reply`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ reply }),
  });

  fetchAll();
  setReplyInputs(prev => ({
    ...prev,
    [id]: ''
  }));
  };

  const filtered = feedbacks.filter(fb =>
    fb.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    fb.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    fb.message?.toLowerCase().includes(search.toLowerCase())
  );

 const startReplyEdit = (fb) => {
  setEditingReplyId(fb.id);
  setEditingReplyText(fb.reply || '');
};

const cancelReplyEdit = () => {
  setEditingReplyId(null);
  setEditingReplyText('');
};

const handleReplyUpdate = async (id) => {
  const reply = editingReplyText.trim();
  if (!reply) return;

  await fetch(`http://localhost:8000/feedback/${id}/reply`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ reply }),
  });

  setEditingReplyId(null);
  setEditingReplyText('');
  fetchAll();
};

const handleReplyDelete = async (id) => {
  const confirmed = window.confirm('Are you sure you want to delete this reply?');
  if (!confirmed) return;

  try {
    const res = await fetch(`http://localhost:8000/feedback/${id}/reply`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reply: '' }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Failed to delete reply');
      return;
    }

    setEditingReplyId(null);
    setEditingReplyText('');
    setReplyInputs(prev => ({
      ...prev,
      [id]: ''
    }));
    fetchAll();
  } catch {
    alert('Network error while deleting reply');
  }
};
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="text-title" style={{ fontSize: '26px', marginBottom: '6px' }}>Feedback Management</h1>
        <p className="text-subtitle" style={{ fontSize: '14px' }}>Review and respond to customer feedback</p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Reviews', value: stats.total, color: '#3b82f6' },
            { label: 'Avg Rating', value: `${stats.avg_rating} / 5.0`, color: '#f59e0b' },
            { label: 'Flagged', value: stats.flagged, color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: '20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
              <p style={{ fontSize: '26px', fontWeight: '700', color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Search size={16} color="var(--text-light)" />
        <input
          className="input-field"
          placeholder="Search feedbacks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', padding: '4px 0', fontSize: '14px', flex: 1, outline: 'none', background: 'none' }}
        />
      </div>

      {/* Feedback Cards */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>Loading feedbacks...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-light)' }}>
          <MessageSquare size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <p>No feedback found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map(fb => (
            <div key={fb.id} className="card" style={{ padding: '20px', borderLeft: fb.offensive ? '4px solid #ef4444' : '4px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>{fb.user_name}</span>
                    <span style={{ fontSize: '12px', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: '20px', color: 'var(--text-muted)' }}>{fb.product_name}</span>
                    {fb.offensive && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#ef4444', backgroundColor: '#fef2f2', padding: '2px 8px', borderRadius: '20px' }}>
                        <AlertTriangle size={11} /> Flagged
                      </span>
                    )}
                  </div>
                  <StarRating value={fb.rating} />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>{fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}</span>
                 
                </div>
              </div>

              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '14px' }}>{fb.message}</p>

              {fb.reply && (
  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
  <div>
    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-primary)' }}>
      Your Reply
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
      {fb.replied_at ? new Date(fb.replied_at).toLocaleString() : ''}
    </div>
  </div>

  <div style={{ display: 'flex', gap: '8px' }}>
    <button
      type="button"
      onClick={() => startReplyEdit(fb)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      title="Edit Reply"
    >
      <Pencil size={15} />
    </button>

    <button
      type="button"
      onClick={() => handleReplyDelete(fb.id)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      title="Delete Reply"
    >
      <Trash2 size={15} />
    </button>
  </div>
</div>

    {editingReplyId === fb.id ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          className="input-field"
          value={editingReplyText}
          onChange={(e) => setEditingReplyText(e.target.value)}
          style={{ padding: '9px 12px', fontSize: '13px' }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleReplyUpdate(fb.id)}
            className="btn btn-primary"
            style={{ padding: '8px 14px', borderRadius: '7px' }}
          >
            Save
          </button>

          <button
            type="button"
            onClick={cancelReplyEdit}
            className="btn"
            style={{ padding: '8px 14px', borderRadius: '7px', border: '1px solid var(--border-light)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
        {fb.reply}
      </p>
    )}
  </div>
)}

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="input-field"
                  placeholder="Write a reply..."
                  value={replyInputs[fb.id] || ''}
                  onChange={e => setReplyInputs(prev => ({ ...prev, [fb.id]: e.target.value }))}
                  style={{ flex: 1, padding: '9px 12px', fontSize: '13px' }}
                />
                <button onClick={() => handleReply(fb.id)} className="btn btn-primary" style={{ padding: '9px 14px', gap: '5px', borderRadius: '7px' }}>
                  <Reply size={14} /> Reply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
