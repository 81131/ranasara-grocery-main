import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, DollarSign, Package, ChevronRight, MessageSquare, ShoppingCart, LayoutDashboard, CheckCircle, Clock, Truck, AlertCircle, Edit2, X } from 'lucide-react';

const STATUS_STYLES = {
  Delivered:  { bg: '#eefcf2', color: '#00a247', icon: CheckCircle },
  Processing: { bg: '#eff6ff', color: '#3b82f6', icon: Clock },
  Shipped:    { bg: '#faf5ff', color: '#a855f7', icon: Truck },
  Pending:    { bg: '#fffbeb', color: '#f59e0b', icon: AlertCircle },
};

function CustomerDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({ first_name: '', last_name: '', phone_number: '' });

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddressForm, setEditAddressForm] = useState({ house_no_lane: '', street_name: '', city: '', postal_code: '' });

  const fetchDashboardData = () => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('http://localhost:8000/orders/my-stats', { headers }).then(r => r.ok ? r.json() : null),
      fetch('http://localhost:8000/users/me', { headers }).then(r => r.ok ? r.json() : null),
    ]).then(([statsData, profileData]) => {
      setStats(statsData);
      setProfile(profileData);
      if (profileData) {
        setEditProfileForm({
          first_name: profileData.first_name || '',
          last_name: profileData.last_name || '',
          phone_number: profileData.phone_number || ''
        });
        setEditAddressForm({
          house_no_lane: profileData.address?.house_no_lane || '',
          street_name: profileData.address?.street_name || '',
          city: profileData.address?.city || '',
          postal_code: profileData.address?.postal_code || ''
        });
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [navigate]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editProfileForm)
      });
      if (res.ok) {
        setIsEditingProfile(false);
        fetchDashboardData();
      } else {
        alert('Failed to update profile');
      }
    } catch {
      alert('Error connecting to server');
    }
  };

  const handleAddressSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/users/me/address', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editAddressForm)
      });
      if (res.ok) {
        setIsEditingAddress(false);
        fetchDashboardData();
      } else {
        alert('Failed to update address');
      }
    } catch {
      alert('Error connecting to server');
    }
  };



  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid var(--border-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }}></div>
          <p>Loading your dashboard...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const initials = profile ? `${profile.name?.charAt(0) || ''}`.toUpperCase() : 'U';
  const statsCards = [
    { label: 'Total Orders', value: stats?.total_orders ?? 0, icon: Package, color: '#3b82f6' },
    { label: 'Total Spent', value: `Rs. ${(stats?.total_spent ?? 0).toFixed(2)}`, icon: DollarSign, color: 'var(--color-primary)' },
  ];

  const quickLinks = [
    { label: 'Browse Store', icon: ShoppingBag, path: '/', color: 'var(--color-primary)' },
    { label: 'My Cart', icon: ShoppingCart, path: '/cart', color: '#3b82f6' },
    { label: 'My Orders', icon: Package, path: '/orders', color: '#f59e0b' },
    { label: 'Leave Feedback', icon: MessageSquare, path: '/feedback', color: '#8b5cf6' },
  ];

  return (
    <div style={{ padding: '30px 0 60px' }}>
      {/* Profile Header */}
      <div className="card" style={{ padding: '28px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700' }}>
            {initials}
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>Welcome back, {profile?.name || 'Customer'}!</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{profile?.email} • {profile?.phone_number || 'No phone set'}</p>
          </div>
        </div>
        <button onClick={() => setIsEditingProfile(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>
          <Edit2 size={16} /> Edit Profile
        </button>
      </div>

      {/* Address Info */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '8px' }}>Delivery Address</h3>
          {profile?.address ? (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              {profile.address.house_no_lane}, {profile.address.street_name}<br/>
              {profile.address.city}, {profile.address.postal_code}
            </p>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--text-light)' }}>No default address set.</p>
          )}
        </div>
        <button onClick={() => setIsEditingAddress(true)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Edit2 size={16} /> Edit Address
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {statsCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)' }}>{value}</p>
            </div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={24} color={color} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        {/* Recent Orders */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>Recent Orders</h3>
            <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '500' }}>
              View all <ChevronRight size={14} />
            </button>
          </div>

          {(!stats?.recent_orders || stats.recent_orders.length === 0) ? (
            <p style={{ color: 'var(--text-light)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>No orders yet. Start shopping!</p>
          ) : (
            stats.recent_orders.map((order, i) => {
              const st = STATUS_STYLES[order.status] || { bg: '#f3f4f6', color: '#6b7280', icon: Package };
              const Icon = st.icon;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: i < stats.recent_orders.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>Order #{order.id}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', backgroundColor: st.bg, color: st.color, width: 'fit-content' }}>
                      <Icon size={10} /> {order.status}
                    </span>
                  </div>
                  <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>Rs. {order.total?.toFixed(2)}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Links */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {quickLinks.map(({ label, icon: Icon, path, color }) => (
              <button key={label} onClick={() => navigate(path)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s', justifyContent: 'space-between' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} color={color} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>{label}</span>
                </div>
                <ChevronRight size={16} color="var(--text-light)" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isEditingProfile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ backgroundColor: 'white', padding: '30px', width: '100%', maxWidth: '400px', borderRadius: '16px', position: 'relative' }}>
            <button onClick={() => setIsEditingProfile(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} color="var(--text-light)" />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Edit Profile</h2>
            <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>First Name</label>
                <input required type="text" value={editProfileForm.first_name} onChange={e => setEditProfileForm({...editProfileForm, first_name: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Last Name</label>
                <input required type="text" value={editProfileForm.last_name} onChange={e => setEditProfileForm({...editProfileForm, last_name: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Phone Number</label>
                <input required type="text" value={editProfileForm.phone_number} onChange={e => setEditProfileForm({...editProfileForm, phone_number: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {isEditingAddress && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ backgroundColor: 'white', padding: '30px', width: '100%', maxWidth: '400px', borderRadius: '16px', position: 'relative' }}>
            <button onClick={() => setIsEditingAddress(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} color="var(--text-light)" />
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Edit Delivery Address</h2>
            <form onSubmit={handleAddressSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>House No. / Lane</label>
                <input required type="text" value={editAddressForm.house_no_lane} onChange={e => setEditAddressForm({...editAddressForm, house_no_lane: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Street Name</label>
                <input required type="text" value={editAddressForm.street_name} onChange={e => setEditAddressForm({...editAddressForm, street_name: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>City</label>
                  <input required type="text" value={editAddressForm.city} onChange={e => setEditAddressForm({...editAddressForm, city: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Postal Code</label>
                  <input required type="text" value={editAddressForm.postal_code} onChange={e => setEditAddressForm({...editAddressForm, postal_code: e.target.value})} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '15px' }} />
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>Save Address</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerDashboard;
