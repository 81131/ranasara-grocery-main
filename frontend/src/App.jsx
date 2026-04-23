import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, ShoppingCart, Package, Bell, Settings, LogOut, User, MessageSquare, LayoutDashboard, Sparkles, Menu, X } from 'lucide-react';

import Home from './pages/Home';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminPanel from './pages/AdminPanel';
import Notifications from './pages/Notifications';
import ProductDetails from './pages/ProductDetails';
import CustomerDashboard from './pages/CustomerDashboard';
import Feedback from './pages/Feedback';
import Chat from './pages/Chat';
import DriverDashboard from './pages/DriverDashboard';
import { ToastProvider } from './context/ToastContext';

function NavBar({ isLoggedIn, userRole, handleLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isLoggedIn) {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      fetch(`${API_URL}/orders/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUnreadCount(data.count || 0); })
      .catch(() => {});
    }
  }, [isLoggedIn]);

  const linkStyle = {
    color: 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 2px',
    transition: 'color 0.2s',
  };

  return (
    <nav style={{
      backgroundColor: 'white',
      borderBottom: '1px solid var(--border-light)',
      padding: '0 40px',
      height: '64px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <style>{`
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .nav-links.mobile-open {
            display: flex !important;
            flex-direction: column;
            position: absolute;
            top: 64px; left: 0; right: 0;
            background: white;
            padding: 20px;
            border-bottom: 1px solid var(--border-light);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            align-items: flex-start !important;
          }
          .hamburger { display: block !important; }
          nav { padding: 0 20px !important; }
        }
        .hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--text-main); }
        .nav-links { display: flex; gap: 20px; align-items: center; }
      `}</style>

      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => setMobileOpen(false)}>
        <div style={{ backgroundColor: 'var(--color-primary)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShoppingBag size={18} color="white" />
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)' }}>Ransara</span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {isLoggedIn && (
          <Link to="/notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center', color: 'var(--text-main)' }}>
            <Bell size={20} /> 
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: 'var(--danger)', color: 'white', fontSize: '10px', fontWeight: 'bold', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        )}

        <button className="hamburger" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className={`nav-links ${mobileOpen ? 'mobile-open' : ''}`} onClick={() => setMobileOpen(false)}>
        <Link to="/" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>Home</Link>

        {isLoggedIn ? (
          <>
            <Link to="/cart" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <ShoppingCart size={16} /> Cart
            </Link>
            <Link to="/orders" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <Package size={16} /> Orders
            </Link>
            <Link to="/feedback" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <MessageSquare size={16} /> Feedback
            </Link>
            <Link to="/dashboard" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
              <LayoutDashboard size={16} /> My Account
            </Link>
            <Link to="/chat" style={{ ...linkStyle, color: 'var(--color-primary)', fontWeight: '600' }}>
              <Sparkles size={16} /> AI Chat
            </Link>
            {userRole === 'admin' && (
              <Link to="/admin" style={{ ...linkStyle, backgroundColor: 'var(--color-primary)', color: 'white', padding: '7px 14px', borderRadius: '7px' }}>
                <Settings size={15} /> Admin
              </Link>
            )}
            {userRole === 'driver' && (
              <Link to="/driver" style={{ ...linkStyle, backgroundColor: '#00a247', color: 'white', padding: '7px 14px', borderRadius: '7px' }}>
                <LayoutDashboard size={15} /> Driver Portal
              </Link>
            )}
            <button
              onClick={(e) => { e.preventDefault(); handleLogout(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '7px', padding: '7px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
            >
              <LogOut size={15} /> Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={linkStyle} onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>Login</Link>
            <Link to="/register" style={{ backgroundColor: 'var(--color-primary)', color: 'white', textDecoration: 'none', padding: '8px 18px', borderRadius: '7px', fontSize: '14px', fontWeight: '600' }}>
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'customer');
  const [isActive, setIsActive] = useState(localStorage.getItem('isActive') !== 'false');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('isActive');
    setIsLoggedIn(false);
    setUserRole('customer');
    setIsActive(true);
    window.location.href = '/';
  };

  return (
    <ToastProvider>
      <Router>
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
          <NavBar isLoggedIn={isLoggedIn} userRole={userRole} handleLogout={handleLogout} />

          {isLoggedIn && !isActive && (
            <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '12px 20px', textAlign: 'center', fontWeight: '500' }}>
              ⚠️ Your account has been suspended. Contact{' '}
              <a href="mailto:admin@ransara.com" style={{ color: 'white', textDecoration: 'underline', fontWeight: 'bold' }}>admin@ransara.com</a>
            </div>
          )}

          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 30px' }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} setUserRole={setUserRole} setIsActive={setIsActive} />} />
              <Route path="/register" element={<Register />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/product/:id" element={<ProductDetails />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/dashboard" element={<CustomerDashboard />} />
              <Route path="/driver" element={<DriverDashboard />} />
              <Route path="/chat" element={<Chat />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ToastProvider>
  );
}

export default App;