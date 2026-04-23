import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, Truck, AlertCircle, ShoppingBag, Star } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const STATUS_STYLES = {
  Delivered:        { bg: '#eefcf2', color: '#00a247', icon: CheckCircle },
  Processing:       { bg: '#eff6ff', color: '#3b82f6', icon: Clock },
  'Out for Delivery': { bg: '#faf5ff', color: '#a855f7', icon: Truck },
  Pending:          { bg: '#fffbeb', color: '#f59e0b', icon: AlertCircle },
  Cancelled:        { bg: '#fef2f2', color: '#ef4444', icon: AlertCircle },
  Shipped:          { bg: '#faf5ff', color: '#a855f7', icon: Truck },
};

function Orders() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverRatings, setDriverRatings] = useState({});
  const [eligibleProducts, setEligibleProducts] = useState([]);

  useEffect(() => {
  const token = localStorage.getItem('token');
  if (!token) {
    navigate('/login');
    return;
  }

  const loadData = async () => {
    try {
      setLoading(true);

      const ordersRes = await fetch('http://localhost:8000/orders/my', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        console.log('orders API:', ordersData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      } else {
        setOrders([]);
      }

      const eligibleRes = await fetch('http://localhost:8000/feedback/eligible-products', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (eligibleRes.ok) {
        const eligibleData = await eligibleRes.json();
        console.log('eligibleProducts API:', eligibleData);
        setEligibleProducts(Array.isArray(eligibleData) ? eligibleData : []);
      } else {
        setEligibleProducts([]);
      }
    } catch (error) {
      console.error('Orders page load error:', error);
      setOrders([]);
      setEligibleProducts([]);
    } finally {
      setLoading(false);
    }
  };

  loadData();
}, [navigate]);

  const rateDriver = async (orderId, driverId, rating) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8000/users/drivers/${driverId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating })
      });
      if (res.ok) {
        setDriverRatings(prev => ({ ...prev, [orderId]: rating }));
        addToast('Thank you for rating the driver!', 'success');
      }
    } catch (e) {
      console.error(e);
    }
  };
  
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '100px', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }}></div>
          <p>Loading orders...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '100px' }}>
        <ShoppingBag size={60} style={{ color: 'var(--text-light)', marginBottom: '20px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>No orders yet</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Start shopping to place your first order!</p>
        <button onClick={() => navigate('/')} className="btn btn-primary" style={{ padding: '12px 28px' }}>Shop Now</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px 0 60px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>My Orders</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{orders.length} order{orders.length !== 1 ? 's' : ''} placed</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {orders.map(order => {
          const st = STATUS_STYLES[order.status] || { bg: '#f3f4f6', color: '#6b7280', icon: Package };
          const Icon = st.icon;
          const date = order.created_at
            ? new Date(order.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
               })
             : '';

          const eligibleOrderIds = new Set(eligibleProducts.map(p => p.order_id));
          const canGiveFeedback = eligibleOrderIds.has(order.id);

          return (
            <div key={order.id} className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-main)' }}>Order #{order.id}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backgroundColor: st.bg, color: st.color }}>
                      <Icon size={12} /> {order.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-light)' }}>{date} · {order.payment_method}</div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '20px', color: 'var(--color-primary)' }}>Rs. {order.total?.toFixed(2)}</div>

                 {canGiveFeedback && (
                   <button
                     onClick={() => navigate('/feedback', { state: { order_id: order.id } })}
                     style={{
                       display: 'inline-flex',
                       alignItems: 'center',
                       gap: '6px',
                       backgroundColor: '#16a34a',
                       border: 'none',
                       padding: '8px 14px',
                       borderRadius: '6px',
                       fontSize: '13px',
                       cursor: 'pointer',
                       color: '#fff'
                     }}
                    >
    <Star size={14} color="#fff" /> Give Feedback</button> )}
                </div>
              </div>

              {order.otp_code && order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                <div style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>Drop-off OTP verification code:</span>
                  <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '2px', color: '#15803d' }}>{order.otp_code}</span>
                </div>
              )}

              {order.items && order.items.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Items</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {order.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', padding: '4px 0' }}>
                        <div>
                          <span style={{ color: 'var(--text-main)' }}>{item.product_name || item.name} <span style={{ color: 'var(--text-muted)' }}>× {item.quantity}</span></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Rs. {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {order.status === 'Delivered' && order.driver_id && (
                <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-light)', paddingTop: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginRight: '10px' }}>Rate your delivery driver:</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={20}
                        color={star <= (driverRatings[order.id] || 0) ? '#f59e0b' : '#d1d5db'}
                        fill={star <= (driverRatings[order.id] || 0) ? '#f59e0b' : '#d1d5db'}
                        style={{ cursor: 'pointer', transition: '0.2s' }}
                        onClick={() => rateDriver(order.id, order.driver_id, star)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Orders;