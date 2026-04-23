import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, CheckCircle, Clock, Truck, AlertCircle, AlertTriangle, RefreshCw,
  Package, XCircle, ShoppingBag,
} from 'lucide-react';

const STATUS_STYLES = {
  Delivered:          { bg: '#eefcf2', color: '#00a247', icon: CheckCircle },
  Completed:          { bg: '#eefcf2', color: '#00a247', icon: CheckCircle },
  Processing:         { bg: '#eff6ff', color: '#3b82f6', icon: Clock },
  'Out for Delivery': { bg: '#faf5ff', color: '#a855f7', icon: Truck },
  Pending:            { bg: '#fffbeb', color: '#f59e0b', icon: AlertCircle },
  Cancelled:          { bg: '#fef2f2', color: '#ef4444', icon: XCircle },
};

const STATUS_FILTER_ITEMS = [
  { key: 'All',              label: 'All Orders',       icon: ShoppingBag, color: '#475569' },
  { key: 'Pending',         label: 'Pending',           icon: AlertCircle, color: '#f59e0b' },
  { key: 'Processing',      label: 'Processing',        icon: Clock,       color: '#3b82f6' },
  { key: 'Out for Delivery',label: 'Out for Delivery',  icon: Truck,       color: '#a855f7' },
  { key: 'Completed',       label: 'Completed',         icon: CheckCircle, color: '#00a247' },
  { key: 'Cancelled',       label: 'Cancelled',         icon: XCircle,     color: '#ef4444' },
];

function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading]   = useState(true);
  const [dashData, setDashData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchDash = () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    fetch('http://localhost:8000/orders/dashboard-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDashData(d))
      .catch(() => setDashData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDash(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', marginBottom: '15px', color: 'var(--color-primary)' }} />
      <p>Loading dashboard…</p>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const recent    = dashData?.recentOrders || [];
  const lowStock  = dashData?.lowStockItems || [];
  const stats     = dashData?.stats || {};
  const statusCts = dashData?.statusCounts || {};

  const filteredRecent = statusFilter === 'All'
    ? recent
    : recent.filter(o => o.status === statusFilter);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="text-title" style={{ fontSize: '26px', marginBottom: '4px' }}>Dashboard</h1>
          <p className="text-subtitle" style={{ fontSize: '14px' }}>Welcome back! Here's what's happening today.</p>
        </div>
        <button onClick={fetchDash} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
          border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 14px',
          cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* STAT CARDS */}
      {stats.totalOrders !== undefined && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue',   value: `Rs. ${(stats.totalRevenue  || 0).toFixed(2)}`, color: 'var(--color-primary)' },
            { label: 'Total Orders',    value: stats.totalOrders  ?? 0,                        color: '#3b82f6' },
            { label: 'Total Products',  value: stats.totalProducts ?? 0,                       color: '#f97316' },
            { label: 'Active Users',    value: stats.activeUsers  ?? 0,                        color: '#a855f7' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: '20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{label}</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* STATUS BREAKDOWN CHIPS */}
      {Object.keys(statusCts).length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Order Status Breakdown
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {STATUS_FILTER_ITEMS.map(({ key, label, icon: Icon, color }) => {
              const count = key === 'All'
                ? Object.values(statusCts).reduce((a, b) => a + b, 0)
                : (statusCts[key] || 0);
              const isActive = statusFilter === key;
              return (
                <button key={key} onClick={() => setStatusFilter(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 16px', borderRadius: '10px', border: '1.5px solid',
                    borderColor: isActive ? color : 'var(--border-light)',
                    background: isActive ? color + '15' : 'white',
                    cursor: 'pointer', transition: 'all 0.15s', fontSize: '13px', fontWeight: '500',
                    color: isActive ? color : 'var(--text-main)',
                    boxShadow: isActive ? `0 0 0 2px ${color}30` : 'none',
                  }}>
                  <Icon size={14} color={isActive ? color : 'var(--text-muted)'} />
                  {label}
                  <span style={{
                    background: isActive ? color : '#e5e7eb',
                    color: isActive ? 'white' : 'var(--text-main)',
                    fontSize: '11px', fontWeight: '700',
                    padding: '1px 7px', borderRadius: '999px',
                  }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        {/* RECENT ORDERS */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <h3 className="text-title" style={{ fontSize: '16px', margin: 0 }}>Recent Orders</h3>
            {statusFilter !== 'All' && (
              <button onClick={() => setStatusFilter('All')}
                style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Show All
              </button>
            )}
          </div>
          <p className="text-subtitle" style={{ fontSize: '13px', marginBottom: '16px' }}>
            {statusFilter === 'All' ? 'Latest 10 orders' : `Showing: ${statusFilter}`}
          </p>

          {filteredRecent.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px 0', fontSize: '14px' }}>
              No {statusFilter !== 'All' ? statusFilter.toLowerCase() : ''} orders.
            </p>
          ) : filteredRecent.map((order, i) => {
            const st = STATUS_STYLES[order.status] || { bg: '#f3f4f6', color: '#6b7280', icon: AlertCircle };
            const Icon = st.icon;
            return (
              <div key={i} onClick={() => navigate('/admin?tab=orders')}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 0', borderBottom: i < filteredRecent.length - 1 ? '1px solid var(--border-light)' : 'none',
                  cursor: 'pointer', transition: 'opacity 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{order.id}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px',
                      borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: st.bg, color: st.color }}>
                      <Icon size={11} /> {order.status}
                    </span>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{order.name}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>{order.time}</span>
                </div>
                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>{order.total}</span>
              </div>
            );
          })}

          <button onClick={() => navigate('/admin?tab=orders')}
            style={{ width: '100%', marginTop: '14px', padding: '9px', borderRadius: '8px',
              border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer',
              fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>
            View All Orders →
          </button>
        </div>

        {/* LOW STOCK */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 className="text-title" style={{ fontSize: '16px', marginBottom: '4px' }}>Low Stock Alert</h3>
          <p className="text-subtitle" style={{ fontSize: '13px', marginBottom: '20px' }}>Items running low</p>
          {lowStock.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px 0', fontSize: '14px' }}>All good! ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lowStock.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px', borderRadius: '8px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={17} color="#ef4444" />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.cat}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>{item.qty} units</div>
                    <div onClick={() => navigate('/admin?tab=inventory')}
                      style={{ fontSize: '12px', color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                      Reorder
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;