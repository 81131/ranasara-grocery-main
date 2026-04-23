import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, Truck, ShoppingCart,
  MessageSquare, Bot, BarChart2, Settings, Search, Bell, ShoppingBag, Building2, Menu, X, BrainCircuit
} from 'lucide-react';

import AdminOrders from './AdminOrders';
import AdminInventory from './AdminInventory';
import AdminSuppliers from './AdminSuppliers';
import AdminDelivery from './AdminDelivery';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminDrivers from './AdminDrivers';
import AdminChatbot from './AdminChatbot';
import AdminFeedback from './AdminFeedback';
import AdminReports from './AdminReports';
import AdminForecasting from './AdminForecasting';

function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const navigate = useNavigate();

  // NEW: Notification States
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:8000/orders/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUnreadCount(data.unread_count || 0); })
      .catch(() => { });
  }, []);

  const fetchNotifications = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/orders/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setNotifications(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const toggleNotifications = () => {
    if (!showNotifications) fetchNotifications(); // Fetch fresh data when opening
    setShowNotifications(!showNotifications);
  };

  const handleTabChange = (tabName) => {
    setSearchParams({ tab: tabName });
    setIsMobileMenuOpen(false);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'inventory', label: 'Products & Inventory', icon: Package },
    { id: 'suppliers', label: 'Suppliers', icon: Building2 },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'drivers', label: 'Drivers', icon: Truck },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
    { id: 'chatbot', label: 'Chatbot Support', icon: Bot },
    { id: 'forecasting', label: 'AI Insights', icon: BrainCircuit },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart2 },
    { id: 'delivery', label: 'Settings', icon: Settings },
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', backgroundColor: '#f9fafb', fontFamily: '"Inter", sans-serif' }}>
      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar {
            display: none !important;
          }
          .admin-sidebar.mobile-open {
            display: flex !important;
            position: absolute;
            left: 0; top: 70px; bottom: 0;
            z-index: 10000;
            box-shadow: 4px 0 12px rgba(0,0,0,0.1);
          }
          .admin-hamburger {
            display: flex !important;
          }
        }
        .admin-hamburger {
          display: none;
          align-items: center;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-main);
          padding: 10px;
        }
      `}</style>

      {/* LEFT SIDEBAR */}
      <div className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{ width: '260px', backgroundColor: 'white', borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '70px', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }} onClick={() => navigate('/')}>
          <div style={{ backgroundColor: 'var(--color-primary)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag color="white" size={18} />
          </div>
          <h2 className="text-title" style={{ fontSize: '20px', margin: 0 }}>Ransara</h2>
        </div>

        <nav style={{ flex: 1, padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                  width: '100%', border: 'none', borderRadius: '8px', cursor: 'pointer',
                  backgroundColor: isActive ? '#f0fdf4' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--text-main)',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '14.5px', textAlign: 'left', transition: 'all 0.2s ease'
                }}
              >
                <Icon size={18} color={isActive ? 'var(--color-primary)' : 'var(--text-muted)'} strokeWidth={isActive ? 2.5 : 2} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* TOP HEADER */}
        <header style={{ height: '70px', backgroundColor: 'white', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <button className="admin-hamburger" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* SEARCH BAR */}
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: '400px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-light)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search..."
                  style={{
                    width: '100%', backgroundColor: 'var(--input-bg)', border: '1px solid transparent',
                    padding: '10px 10px 10px 36px', borderRadius: '6px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>

            {/* NOTIFICATION BELL */}
            <div style={{ position: 'relative' }}>
              <div style={{ cursor: 'pointer', position: 'relative' }} onClick={toggleNotifications}>
                <Bell size={20} color="var(--text-main)" />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: '-6px', right: '-4px', backgroundColor: 'var(--danger)', color: 'white', fontSize: '11px', fontWeight: 'bold', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>

              {/* NOTIFICATION DROPDOWN */}
              {showNotifications && (
                <div className="card" style={{ position: 'absolute', top: '35px', right: '0', width: '320px', padding: '0', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                  <div style={{ padding: '15px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--input-bg)', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                    <h3 className="text-title" style={{ fontSize: '16px', margin: 0 }}>Recent Order Activity</h3>
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '10px' }}>
                    {notifications.length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px 0', fontSize: '14px' }}>No recent activity.</p>
                    ) : (
                      notifications.map((notif, idx) => (
                        <div key={idx} style={{ padding: '12px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>Order #{notif.order_id}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status updated to <strong style={{ color: 'var(--color-primary)' }}>{notif.status}</strong></span>
                          <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>{new Date(notif.changed_at).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ADMIN PROFILE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderLeft: '1px solid var(--border-light)', paddingLeft: '20px' }}>
              <div style={{ width: '32px', height: '32px', backgroundColor: '#eefcf2', color: 'var(--color-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '12px' }}>AD</div>
              <span className="text-title" style={{ fontSize: '14px', fontWeight: '500' }}>Admin</span>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '30px', overflowY: 'auto', backgroundColor: '#f9fafb' }}>
          {activeTab === 'dashboard' && <AdminDashboard />}
          {activeTab === 'inventory' && <AdminInventory />}
          {activeTab === 'suppliers' && <AdminSuppliers />}
          {activeTab === 'orders' && <AdminOrders />}
          {activeTab === 'delivery' && <AdminDelivery />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'drivers' && <AdminDrivers />}
          {activeTab === 'chatbot' && <AdminChatbot />}
          {activeTab === 'forecasting' && <AdminForecasting />}
          {activeTab === 'feedback' && <AdminFeedback />}
          {activeTab === 'reports' && <AdminReports />}
        </main>
      </div>
    </div>
  );
}

export default AdminPanel;