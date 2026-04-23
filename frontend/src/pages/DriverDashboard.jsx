import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import { MapPin, Navigation, CheckCircle, Package, ShieldCheck, X, AlertCircle, Info } from 'lucide-react';

const mapContainerStyle = { width: '100%', height: '400px', borderRadius: '8px' };
const center = { lat: 6.9271, lng: 79.8612 }; // Default: Colombo

// Shared Google Maps loader ID — must match CheckoutMap to avoid "Loader called again" crash
const MAPS_LIBRARIES = ['places'];

function Toast({ message, type = 'info', onClose }) {
  const colors = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '12px 16px', borderRadius: '10px', marginBottom: '10px',
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      fontSize: '14px', fontWeight: '500', animation: 'fadeSlideIn 0.25s ease',
    }}>
      {type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color }}><X size={14} /></button>}
    </div>
  );
}

function DriverDashboard() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [directions, setDirections] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); // { message, type }

  const showToast = (message, type = 'info') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',           // MUST match CheckoutMap.jsx — do NOT change
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  useEffect(() => {
    fetchOrders();
    // Get driver's current location continuously or once
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error(err)
      );
    }
  }, []);

  const fetchOrders = () => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:8000/orders/driver/deliveries', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setOrders(data);
      })
      .catch(err => console.error(err));
  };

  const handleRoute = useCallback((order) => {
    setSelectedOrder(order);
    if (currentLocation && order.delivery_lat && order.delivery_lng) {
      setDirections(null); // trigger re-render of DirectionsService
    } else if (!currentLocation) {
      showToast("Please allow location access to calculate routes.", 'info');
    }
  }, [currentLocation]);

  const directionsCallback = useCallback((res) => {
    if (res !== null && res.status === 'OK') {
      setDirections(res);
    }
  }, []);

  const handleStartDelivery = async (orderId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:8000/orders/driver/${orderId}/start-delivery`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast("Delivery started! Drive safely. 🚗", 'success');
        fetchOrders();
      } else {
        showToast("Failed to start delivery.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Network error starting delivery.", 'error');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput) {
      showToast("Please enter the customer's 6-digit OTP.", 'info');
      return;
    }
    setVerifying(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new URLSearchParams();
      formData.append('otp_code', otpInput);
      
      const res = await fetch(`http://localhost:8000/orders/driver/${selectedOrder.id}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${token}`
        },
        body: formData.toString()
      });
      const data = await res.json();
      
      if (res.ok) {
        showToast("Delivery verified! Order marked as Delivered. ✓", 'success');
        setShowOtpModal(false);
        setOtpInput('');
        setSelectedOrder(null);
        setDirections(null);
        fetchOrders(); // Refresh list
      } else {
        showToast(data.detail || "Invalid OTP. Please ask the customer to check their dashboard.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Network error verifying OTP.", 'error');
    } finally {
      setVerifying(false);
    }
  };

  if (!isLoaded) return <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Maps…</div>;

  return (
    <div style={{ padding: '20px 0', maxWidth: '1000px', margin: '0 auto' }}>
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {toastMsg && (
        <Toast message={toastMsg.message} type={toastMsg.type} onClose={() => setToastMsg(null)} />
      )}
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Navigation size={26} color="var(--color-primary)" /> Driver Portal
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Orders List Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)', paddingBottom: '10px', borderBottom: '2px solid var(--border-light)' }}>
            Active Assignments ({orders.filter(o => o.status !== 'Delivered').length})
          </h2>
          
          {orders.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              No deliveries assigned.
            </div>
          ) : (
            orders.map(order => (
              <div 
                key={order.id} 
                onClick={() => handleRoute(order)}
                style={{ 
                  backgroundColor: 'white', padding: '16px', borderRadius: '12px', 
                  border: `2px solid ${selectedOrder?.id === order.id ? 'var(--color-primary)' : 'transparent'}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>Order #{order.id}</span>
                  <span style={{ 
                    fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px',
                    backgroundColor: order.status === 'Delivered' ? '#eefcf2' : '#eff6ff',
                    color: order.status === 'Delivered' ? '#00a247' : '#3b82f6'
                  }}>
                    {order.status}
                  </span>
                </div>
                
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '8px' }}>
                  <MapPin size={16} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ lineHeight: '1.4' }}>{order.delivery_address || 'No Address'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>{order.customer_name}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{order.distance_km} km</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Map & Tools Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid var(--border-light)' }}>
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={currentLocation || center}
              zoom={12}
              options={{ disableDefaultUI: true, zoomControl: true }}
            >
              {selectedOrder && currentLocation && selectedOrder.delivery_lat && selectedOrder.status !== 'Delivered' && (
                <DirectionsService
                  options={{
                    destination: { lat: selectedOrder.delivery_lat, lng: selectedOrder.delivery_lng },
                    origin: currentLocation,
                    travelMode: 'DRIVING'
                  }}
                  callback={directionsCallback}
                />
              )}
              {directions && (
                <DirectionsRenderer 
                  options={{ directions: directions, suppressMarkers: false }} 
                />
              )}
            </GoogleMap>
            
            {selectedOrder && selectedOrder.status === "Processing" && (
              <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1d4ed8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Navigation size={18} /> Ready to go?
                  </h3>
                  <p style={{ fontSize: '13px', color: '#1e40af' }}>Mark this order as Out for Delivery when you are leaving the store.</p>
                </div>
                <button 
                  onClick={() => handleStartDelivery(selectedOrder.id)}
                  className="btn btn-primary" 
                  style={{ backgroundColor: '#1d4ed8', borderColor: '#1d4ed8', display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 20px' }}
                >
                  <Navigation size={18} /> Start Delivery
                </button>
              </div>
            )}

            {selectedOrder && selectedOrder.status === "Out for Delivery" && (
              <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={18} /> Arrived at Destination?
                  </h3>
                  <p style={{ fontSize: '13px', color: '#15803d' }}>Request the 6-digit OTP code from the customer to complete this drop-off securely.</p>
                </div>
                <button 
                  onClick={() => setShowOtpModal(true)}
                  className="btn btn-primary" 
                  style={{ backgroundColor: '#166534', borderColor: '#166534', display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 20px' }}
                >
                  <ShieldCheck size={18} /> Verify Delivery
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eefcf2', color: '#00a247', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={22} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>Secure Hand-off</h3>
              </div>
              <button onClick={() => setShowOtpModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20} /></button>
            </div>
            
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: '1.5' }}>
              To ensure order integrity, please ask the customer for their unique 6-digit OTP code found on their order dashboard.
            </p>

            <input
              type="text"
              placeholder="000000"
              maxLength={6}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
              style={{
                width: '100%', padding: '16px', fontSize: '24px', letterSpacing: '8px', textAlign: 'center',
                fontWeight: '800', border: '2px solid var(--border-light)', borderRadius: '12px', outline: 'none', marginBottom: '24px', color: 'var(--text-main)'
              }}
            />

            <button 
              onClick={handleVerifyOtp}
              disabled={verifying || otpInput.length < 6}
              style={{
                width: '100%', padding: '14px', fontSize: '16px', fontWeight: '600', color: 'white', border: 'none',
                borderRadius: '8px', backgroundColor: (verifying || otpInput.length < 6) ? 'var(--text-light)' : '#00a247',
                cursor: (verifying || otpInput.length < 6) ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {verifying ? 'Verifying...' : 'Complete Delivery'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default DriverDashboard;
