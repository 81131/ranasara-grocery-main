import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, ShoppingCart, CreditCard, CheckCircle, AlertTriangle, Upload, Store, Truck, Sparkles } from 'lucide-react';
import CheckoutMap from '../components/CheckoutMap';
import PayHereCheckout from '../components/PayHereCheckout';
import { useToast } from '../context/ToastContext';

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border-light)',
  backgroundColor: '#f9fafb',
  fontSize: '14px',
  color: 'var(--text-main)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function Cart() {
  const { addToast } = useToast();
  const [cartData, setCartData] = useState({ items: [], total: 0 });
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [isPlacing, setIsPlacing] = useState(false);
  const [deliveryType, setDeliveryType] = useState('Home Delivery');

  // ── Recommendations ──────────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState([]);
  const [recoLoading,     setRecoLoading]     = useState(false);

  // Shipping form
  const [firstName, setFirstName]   = useState('');
  const [lastName,  setLastName]    = useState('');
  const [email,     setEmail]       = useState('');
  const [phone,     setPhone]       = useState('');
  const [address,   setAddress]     = useState('');
  const [city,      setCity]        = useState('Colombo');
  const [zip,       setZip]         = useState('00100');

  // Card / PayHere state
  const [pendingOrderId, setPendingOrderId] = useState(null); // set after order created, triggers PayHere
  const [payhereDone, setPayhereDone]       = useState(false);

  // Map fields
  const [deliveryLat, setDeliveryLat] = useState(null);
  const [deliveryLng, setDeliveryLng] = useState(null);
  const [mapAddress, setMapAddress]   = useState('');
  const [distanceKm, setDistanceKm]   = useState(0);

  // Payment slip
  const [paymentSlip, setPaymentSlip] = useState(null);

  // Full delivery config from backend (needed to compute distance-based fees)
  const [deliveryConfig, setDeliveryConfig] = useState(null);
  // shippingFee = computed fee applied to this order
  // configuredFee = base fee shown on the Home Delivery card (before distance)
  const [shippingFee, setShippingFee] = useState(0);
  const [configuredFee, setConfiguredFee] = useState(400);

  // Pure fee calculator — works with any distanceKm value
  const computeFee = (km, cfg) => {
    if (!cfg) return 400;
    switch (cfg.active_method) {
      case 'fixed':
        return cfg.fixed_fee ?? 400;
      case 'weight':
        // weight-based: base fee (weight is unknown at this point, use base only)
        return cfg.base_weight_fee ?? 400;
      case 'distance': {
        // base fee covers base_distance_km, extra per km beyond that
        const base = cfg.base_distance_fee ?? 200;
        const extra = Math.max(0, km - (cfg.base_distance_km ?? 1)) * (cfg.extra_distance_fee_per_km ?? 150);
        return base + extra;
      }
      case 'combined': {
        const baseFee = cfg.base_weight_fee ?? 400;
        const distBase = cfg.base_distance_fee ?? 200;
        const extra = Math.max(0, km - (cfg.base_distance_km ?? 1)) * (cfg.extra_distance_fee_per_km ?? 150);
        return baseFee + distBase + extra;
      }
      default:
        return cfg.fixed_fee ?? 400;
    }
  };

  const navigate = useNavigate();

  const fetchCart = async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');
    try {
      const res = await fetch('http://localhost:8000/cart/', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCartData(await res.json());
    } catch (e) { console.error(e); }
  };

  // ── Fetch recommendations from backend whenever cart changes ──────────────
  const fetchRecommendations = async (items) => {
    if (!items || items.length === 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    // Extract product codes — stored as SKU "HIST-16096" or raw code
    const codes = items.map(i =>
      (i.sku || i.product_code || String(i.batch_id))
        .replace(/^HIST-/, '')
        .concat('.0')   // matrix uses "16096.0" format
    );

    setRecoLoading(true);
    try {
      const res = await fetch('http://localhost:8000/recommend', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ cart_items: codes, top_n: 6 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      }
    } catch (e) {
      console.error('Reco fetch error:', e);
    } finally {
      setRecoLoading(false);
    }
  };

  // Fetch admin delivery config once (on mount) and whenever tab is refocused
  const fetchShippingFee = async () => {
    try {
      const res = await fetch('http://localhost:8000/orders/delivery-config');
      if (res.ok) {
        const cfg = await res.json();
        setDeliveryConfig(cfg);
        // configuredFee = base fee for Home Delivery card label (distance=0)
        setConfiguredFee(computeFee(0, cfg));
      }
    } catch (e) {
      // keep defaults
    }
  };

  // Recompute shippingFee whenever distanceKm or config or deliveryType changes
  useEffect(() => {
    if (deliveryType === 'Store Pickup') {
      setShippingFee(0);
      return;
    }
    const fee = computeFee(distanceKm, deliveryConfig);
    setShippingFee(fee);
  }, [distanceKm, deliveryConfig, deliveryType]);

  useEffect(() => { fetchCart(); }, [navigate]);
  // Fetch recommendations whenever cart items change
  useEffect(() => { fetchRecommendations(cartData.items); }, [cartData.items]);
  // Re-fetch configured fee on mount and every 30s / tab visibility
  useEffect(() => {
    fetchShippingFee();
    const interval = setInterval(fetchShippingFee, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchShippingFee(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);  // only on mount — delivery type effect above handles toggling

  const updateQuantity = async (batchId, newQty, availableQty) => {
  if (newQty > availableQty) {
    addToast('You cannot add more than available stock.', 'error');
    return;
  }

  const token = localStorage.getItem('token');
  await fetch('http://localhost:8000/cart/update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ batch_id: batchId, quantity: newQty }),
  });
  fetchCart();
};

  // No tax — only shipping
  const grandTotal = +(cartData.total + shippingFee).toFixed(2);

  const handlePlaceOrder = async (e) => {
  e.preventDefault();

  if (deliveryType === 'Home Delivery') {
    if (!firstName.trim()) { addToast('First name is required.', 'error'); return; }
    if (!lastName.trim())  { addToast('Last name is required.',  'error'); return; }
    if (!email.trim())     { addToast('Email is required.',      'error'); return; }
    if (!phone.trim())     { addToast('Phone number is required.','error'); return; }
    if (!address.trim() && !mapAddress.trim()) { addToast('Address is required.', 'error'); return; }
    if (!city.trim())      { addToast('City is required.',       'error'); return; }
    if (!zip.trim())       { addToast('Postal code is required.','error'); return; }
    if (!deliveryLat || !deliveryLng) {
      addToast('Please pin your exact delivery location on the map.', 'error');
      return;
    }
  }

  // With PayHere, we no longer validate fake card fields client-side.
  // Payment method 'credit' → creates a Pending order then opens PayHere popup.

  if (paymentMethod === 'slip' && !paymentSlip) {
    addToast('Please upload your payment slip to proceed.', 'error');
    return;
  }

  if (deliveryType === 'Home Delivery' && (deliveryLat === null || deliveryLng === null)) {
    // If map is blocked or failed, we just pass 0 for coordinates. The backend will handle it.
  }

  setIsPlacing(true);
  const token = localStorage.getItem('token');
  const formData = new FormData();

  formData.append('customer_name', `${firstName} ${lastName}`.trim());
  formData.append('delivery_type', deliveryType);
  formData.append(
    'delivery_address',
    deliveryType === 'Store Pickup'
      ? 'Store Pickup'
      : (mapAddress || `${address}, ${city} ${zip}`)
  );
  formData.append('delivery_lat', deliveryLat ?? 0);
  formData.append('delivery_lng', deliveryLng ?? 0);
  formData.append('distance_km', distanceKm);

  const pmLabel =
    paymentMethod === 'credit'
      ? 'Card'
      : paymentMethod === 'slip'
      ? 'Payment Slip'
      : 'Cash on Delivery';

  formData.append('payment_method', pmLabel);

  if (paymentSlip) {
    formData.append('payment_slip', paymentSlip);
  }

  try {
    const res = await fetch('http://localhost:8000/orders/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (paymentMethod === 'credit') {
        // PayHere flow: store the new order_id and the component opens the popup
        setPendingOrderId(data.order_id);
        setIsPlacing(false);
      } else {
        navigate('/orders');
      }
    } else {
      const err = await res.json().catch(() => ({}));
      addToast('Checkout failed: ' + (err.detail || 'Unknown error'), 'error');
    }
  } catch (err) {
    addToast('Network error during checkout.', 'error');
  } finally {
    setIsPlacing(false);
  }
};
  if (cartData.items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <ShoppingCart size={64} style={{ color: 'var(--text-light)', marginBottom: '20px' }} />
        <h2 className="text-title" style={{ fontSize: '26px', marginBottom: '10px' }}>Your cart is empty</h2>
        <p className="text-subtitle" style={{ marginBottom: '24px' }}>Add items from the store to get started.</p>
        <button onClick={() => navigate('/')} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
          Start Shopping
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '30px 20px' }}>
      <h1 className="text-title" style={{ fontSize: '26px', marginBottom: '28px' }}>Checkout</h1>

      <form onSubmit={handlePlaceOrder}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '28px', alignItems: 'start' }}>

          {/* ───────── LEFT COLUMN ───────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Cart Items Summary */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '16px' }}>Your Items</h3>
              {cartData.items.map(item => (
                <div key={item.item_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid var(--border-light)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={item.image || item.image_url || ''}
                      alt={item.name}
                      onError={e => { e.target.onerror = null; e.target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect width="44" height="44" fill="%23f3f4f6"/><text x="22" y="28" text-anchor="middle" font-size="20" fill="%23d1d5db">📦</text></svg>'; }}
                      style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', backgroundColor: '#f3f4f6' }}
                    />
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '14px', color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Rs. {item.price.toFixed(2)} each</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
  type="button"
  onClick={() => updateQuantity(item.batch_id, item.quantity - 1, item.available_qty)}
  style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
>
  <Minus size={13} />
</button>

    <button
      type="button"
      onClick={() => updateQuantity(item.batch_id, item.quantity + 1, item.available_qty)}
      disabled={item.quantity >= item.available_qty || item.available_qty <= 0}
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: '1px solid var(--border-light)',
        background: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: item.quantity >= item.available_qty || item.available_qty <= 0 ? 'not-allowed' : 'pointer',
        opacity: item.quantity >= item.available_qty || item.available_qty <= 0 ? 0.5 : 1
     }}
    >
      <Plus size={13} />
    </button>
                    <span style={{ fontWeight: '600', color: 'var(--color-primary)', minWidth: '70px', textAlign: 'right', fontSize: '14px' }}>
                      Rs. {item.subtotal.toFixed(2)}
                      {item.available_qty <= 0 ? (
                        <div style={{ fontSize: '12px', color: 'red', marginTop: '4px' }}>
                           Out of stock
                        </div>
                      ) : item.quantity >= item.available_qty ? (
                         <div style={{ fontSize: '12px', color: '#b45309', marginTop: '4px' }}>
                            Maximum available quantity reached
                         </div>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Delivery Type Selection */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '16px' }}>Delivery Method</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { id: 'Home Delivery', label: 'Home Delivery', sub: 'Delivered to your door', icon: <Truck size={20} /> },
                  { id: 'Store Pickup', label: 'Store Pickup', sub: 'Free — collect at store', icon: <Store size={20} /> },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeliveryType(opt.id)}
                    style={{
                      padding: '16px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                      border: `2px solid ${deliveryType === opt.id ? 'var(--color-primary)' : 'var(--border-light)'}`,
                      background: deliveryType === opt.id ? '#f0fdf4' : 'white',
                      display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ color: deliveryType === opt.id ? 'var(--color-primary)' : 'var(--text-muted)' }}>{opt.icon}</div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{opt.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.sub}</div>
                    {opt.id === 'Home Delivery' && (
                      <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-primary)' }}>
                        {(!deliveryConfig || deliveryConfig.active_method === 'fixed') 
                          ? `Rs. ${configuredFee.toFixed(2)}` 
                          : 'Calculated at checkout'}
                      </div>
                    )}
                    {opt.id === 'Store Pickup' && (
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#16a34a' }}>Rs. 0.00</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Shipping Address — only for Home Delivery */}
            {deliveryType === 'Home Delivery' && (
              <>
                <div className="card" style={{ padding: '24px' }}>
                  <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '18px' }}>Delivery Address</h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>First Name</label>
                      <input required style={inputStyle} placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>Last Name</label>
                      <input required style={inputStyle} placeholder="Doe" value={lastName} onChange={e => setLastName(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>Email</label>
                      <input required style={inputStyle} type="email" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>Phone</label>
                      <input required style={inputStyle} placeholder="+94 71 234 5678" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>Address</label>
                    <input required style={inputStyle} placeholder="123 Main Street, Apt 4B" value={address} onChange={e => setAddress(e.target.value)} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>City</label>
                      <input required style={inputStyle} placeholder="Colombo" value={city} onChange={e => setCity(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', marginBottom: '6px' }}>Postal Code</label>
                      <input required style={inputStyle} placeholder="00100" value={zip} onChange={e => setZip(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Delivery Map Selection */}
                <div className="card" style={{ padding: '24px' }}>
                  <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '8px' }}>Pin Your Location</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    We need your exact coordinates to deliver your order seamlessly.
                  </p>
                  <div style={{ width: '100%', height: '300px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                    <CheckoutMap
                      onLocationSelect={(addr, lat, lng) => {
                        setMapAddress(addr);
                        setAddress(addr);   // ← sync map selection back to the text field
                        setDeliveryLat(lat);
                        setDeliveryLng(lng);
                      }}
                      onDistanceCalculated={setDistanceKm}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Payment Method */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={17} /> Payment Method
              </h3>

              {[
                { id: 'credit', label: 'Credit / Debit Card',   icon: <CreditCard size={16} color="var(--text-light)" /> },
                { id: 'slip',   label: 'Upload Payment Slip',    icon: <Upload size={16} color="var(--text-light)" /> },
                { id: 'cod',    label: 'Cash on Delivery',       icon: null },
              ].map(opt => (
                <label key={opt.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', marginBottom: '10px', borderRadius: '8px',
                  border: `1.5px solid ${paymentMethod === opt.id ? 'var(--color-primary)' : 'var(--border-light)'}`,
                  backgroundColor: paymentMethod === opt.id ? '#f0fdf4' : 'white',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="radio" name="payment" value={opt.id}
                      checked={paymentMethod === opt.id} onChange={() => setPaymentMethod(opt.id)}
                      style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>{opt.label}</span>
                  </div>
                  {opt.icon}
                </label>
              ))}

              {/* Card Payment — PayHere */}
              {paymentMethod === 'credit' && (
                <div style={{ marginTop: '4px', padding: '18px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  {pendingOrderId ? (
                    // Order created — show PayHere popup trigger
                    <PayHereCheckout
                      orderId={pendingOrderId}
                      token={localStorage.getItem('token')}
                      autoOpen={true}
                      onSuccess={() => { setPayhereDone(true); navigate('/orders?payment=success'); }}
                      onCancel={() => addToast('Payment cancelled. Your order is saved — you can retry from My Orders.', 'info')}
                      onError={(msg) => addToast('Payment error: ' + msg, 'error')}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                      <CreditCard size={20} color="var(--color-primary)" />
                      <span>You'll be redirected to the <strong>PayHere</strong> secure checkout after placing your order.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Slip Upload */}
              {paymentMethod === 'slip' && (
                <div style={{ marginTop: '4px', padding: '18px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
                    Transfer the total amount to our bank account, then upload your payment slip here.
                    Our team will verify and confirm your order within 24 hours.
                  </p>
                  <div
                    onClick={() => document.getElementById('slip-input').click()}
                    style={{
                      border: `2px dashed ${paymentSlip ? 'var(--color-primary)' : 'var(--border-light)'}`,
                      borderRadius: '10px', padding: '28px', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: paymentSlip ? '#f0fdf4' : 'white', transition: 'all 0.2s',
                    }}
                  >
                    <Upload size={28} color={paymentSlip ? 'var(--color-primary)' : 'var(--text-light)'} style={{ margin: '0 auto 10px' }} />
                    {paymentSlip ? (
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--color-primary)', fontSize: '14px' }}>✓ {paymentSlip.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Click to change file</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>Click to upload your payment slip</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>PDF, PNG, JPG, JPEG accepted</div>
                      </div>
                    )}
                    <input
                      id="slip-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      style={{ display: 'none' }}
                      onChange={e => setPaymentSlip(e.target.files[0] || null)}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ───────── RIGHT SIDEBAR: Order Summary ───────── */}
          <div className="card" style={{ padding: '24px', position: 'sticky', top: '20px' }}>
            <h3 className="text-title" style={{ fontSize: '15px', marginBottom: '20px' }}>Order Summary</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Subtotal</span>
                <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>Rs. {cartData.total.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Shipping Fee</span>
                <span style={{ color: shippingFee === 0 ? '#16a34a' : 'var(--text-main)', fontWeight: '500' }}>
                  {deliveryType === 'Store Pickup' ? 'Free' : `Rs. ${shippingFee.toFixed(2)}`}
                </span>
              </div>
              {deliveryType === 'Home Delivery' && distanceKm > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-light)', fontStyle: 'italic', textAlign: 'right' }}>
                  📍 {distanceKm.toFixed(1)} km from store
                </div>
              )}
              {deliveryType === 'Store Pickup' && (
                <div style={{ fontSize: '12px', color: '#16a34a', fontStyle: 'italic' }}>
                  ✓ Store pickup — no delivery fee
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-main)' }}>Total</span>
              <span style={{ fontWeight: '700', fontSize: '20px', color: 'var(--color-primary)' }}>Rs. {grandTotal.toFixed(2)}</span>
            </div>

            <div style={{ padding: '12px', backgroundColor: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="#ea580c" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: '1.4' }}>
                {deliveryType === 'Home Delivery'
                  ? <><strong>Notice:</strong> If you cannot receive the delivery at the pinned location or fail to provide the OTP to the driver, you will not be refunded.</>
                  : <><strong>Store Pickup:</strong> Bring your order ID and a valid ID when collecting from our store.</>
                }
              </div>
            </div>

            <button
              type="submit"
              disabled={isPlacing}
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '8px', justifyContent: 'center', opacity: isPlacing ? 0.7 : 1 }}
            >
              <CheckCircle size={17} />
              {isPlacing ? 'Placing Order...' : 'Place Order'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-light)', marginTop: '12px' }}>
              By placing your order, you agree to our terms and conditions
            </p>
          </div>

        </div>
      </form>

      {/* ─── You Might Also Like ─────────────────────────────────────────── */}
      {(recoLoading || recommendations.length > 0) && (
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Sparkles size={20} color="var(--color-primary)" />
            <h2 className="text-title" style={{ fontSize: '18px', margin: 0 }}>You Might Also Like</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: '#f3f4f6', padding: '2px 8px', borderRadius: '999px' }}>
              Based on your cart
            </span>
          </div>

          {recoLoading ? (
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{
                  minWidth: '160px', height: '200px', borderRadius: '12px',
                  background: 'linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.2s infinite',
                  flexShrink: 0,
                }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'thin' }}>
              {recommendations.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => navigate('/')}
                  style={{
                    minWidth: '160px', maxWidth: '160px', flexShrink: 0,
                    borderRadius: '12px', border: '1px solid var(--border-light)',
                    padding: '16px 14px', background: 'white', cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)';
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                  }}
                >
                  {/* Product icon placeholder */}
                  <div style={{
                    width: '60px', height: '60px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '28px', margin: '0 auto 12px',
                  }}>🛒</div>

                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', textAlign: 'center', lineHeight: '1.3', marginBottom: '8px' }}>
                    {item.product_name.length > 28 ? item.product_name.slice(0, 26) + '…' : item.product_name}
                  </div>

                  {/* Similarity score as subtle progress bar */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textAlign: 'center' }}>
                      {Math.round(item.score * 100)}% match
                    </div>
                    <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round(item.score * 100)}%`,
                        background: 'var(--color-primary)',
                        borderRadius: '999px',
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <style>{`
            @keyframes shimmer {
              0%   { background-position: -200% 0; }
              100% { background-position:  200% 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default Cart;