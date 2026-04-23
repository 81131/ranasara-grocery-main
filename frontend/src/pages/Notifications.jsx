import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, Clock, Truck, AlertCircle, Package, ArrowRight, CheckCheck } from 'lucide-react';

const STATUS_META = {
  Delivered:          { color: '#00a247', bg: '#eefcf2', icon: CheckCircle },
  Processing:         { color: '#3b82f6', bg: '#eff6ff', icon: Clock },
  'Out for Delivery': { color: '#a855f7', bg: '#faf5ff', icon: Truck },
  Pending:            { color: '#f59e0b', bg: '#fffbeb', icon: AlertCircle },
  Cancelled:          { color: '#ef4444', bg: '#fef2f2', icon: AlertCircle },
  Assigned:           { color: '#06b6d4', bg: '#ecfeff', icon: Truck },
  Shipped:            { color: '#a855f7', bg: '#faf5ff', icon: Truck },
};

function NotificationCard({ n, onMarkRead }) {
  const meta = STATUS_META[n.status] || { color: '#6b7280', bg: '#f3f4f6', icon: Package };
  const Icon = meta.icon;
  const navigate = useNavigate();

  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      style={{
        backgroundColor: n.is_read ? 'white' : '#f0fdf4',
        border: `1px solid ${n.is_read ? 'var(--border-light)' : '#bbf7d0'}`,
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        transition: 'all 0.2s',
        cursor: n.destination_url ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (n.destination_url) navigate(n.destination_url);
      }}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        backgroundColor: meta.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={meta.color} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: '12px', fontWeight: '700', textTransform: 'uppercase',
            letterSpacing: '0.5px', color: meta.color,
            backgroundColor: meta.bg, padding: '2px 8px', borderRadius: '20px',
          }}>
            {n.status}
          </span>
          {!n.is_read && (
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: 'var(--color-primary)', flexShrink: 0,
            }} />
          )}
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 4px 0', fontWeight: '500' }}>
          Order #{n.order_id} status updated to <strong>{n.status}</strong>
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-light)', margin: 0 }}>
          {timeAgo(n.changed_at || n.created_at)}
        </p>
      </div>

      {n.destination_url && (
        <ArrowRight size={16} color="var(--text-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
      )}
    </div>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const loadNotifications = async () => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    try {
      const res = await fetch(`${API}/orders/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifications(await res.json());
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API}/orders/notifications/mark-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error('Failed to mark notifications as read', e);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const unread = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: '36px', height: '36px', border: '3px solid var(--border-light)',
            borderTopColor: 'var(--color-primary)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 14px',
          }} />
          <p>Loading notifications…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '30px 0 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{
            fontSize: '26px', fontWeight: '700', color: 'var(--text-main)',
            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px',
          }}>
            <Bell size={24} color="var(--color-primary)" /> Notifications
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            {unread > 0 ? `${unread} unread` : 'All caught up!'} · {notifications.length} total
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-light)',
              backgroundColor: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
              color: 'var(--color-primary)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
          >
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          backgroundColor: 'white', borderRadius: '16px',
          border: '1px solid var(--border-light)',
        }}>
          <Bell size={52} style={{ color: 'var(--text-light)', marginBottom: '16px', opacity: 0.4 }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '8px' }}>
            No notifications yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Order status updates and alerts will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifications.map((n, i) => (
            <NotificationCard key={n.id || i} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Notifications;