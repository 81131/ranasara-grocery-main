import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Star, X, UserMinus, CheckCircle, AlertCircle, Mail, Phone, Shield, Save } from 'lucide-react';

function AdminDelivery() {
  const [config, setConfig] = useState({
    active_method: 'fixed',
    fixed_fee: 400.0,
    base_weight_kg: 1.0,
    base_weight_fee: 400.0,
    extra_weight_fee_per_kg: 200.0,
    base_distance_km: 1.0,
    base_distance_fee: 200.0,
    extra_distance_fee_per_km: 150.0
  });

  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchConfig = async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');
    
    try {
      const res = await fetch('http://localhost:8000/orders/delivery-config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setConfig(await res.json());
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setConfig(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? parseFloat(value) || 0 : value 
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch('http://localhost:8000/orders/delivery-config', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(config)
      });
      
      if (res.ok) {
        alert("Delivery Configuration Updated Successfully! 🚚");
      } else {
        alert("Failed to save configuration.");
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  };

  if (loading) return <p>Loading configuration...</p>;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ color: '#2c3e50', margin: 0 }}>Delivery & Logistics Settings 🚚</h2>
        <p style={{ color: '#7f8c8d', margin: '5px 0 0 0' }}>Configure how delivery fees are calculated for your customers.</p>
      </div>

      <form onSubmit={handleSave} style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        
        {/* Method Selector */}
        <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0, color: '#34495e' }}>Active Delivery Method</h3>
          <select 
            name="active_method" 
            value={config.active_method} 
            onChange={handleChange}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc', width: '100%', maxWidth: '400px', fontSize: '16px' }}
          >
            <option value="fixed">Fixed Island-wide Fee</option>
            <option value="weight">By Package Weight</option>
            <option value="distance">By Delivery Distance</option>
            <option value="combined">Combined (Weight + Distance)</option>
          </select>
        </div>

        {/* Dynamic Config Sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          
          {/* Fixed Fee Settings */}
          <div style={{ opacity: config.active_method === 'fixed' ? 1 : 0.4 }}>
            <h4 style={{ color: '#2c3e50', margin: '0 0 15px 0' }}>1. Fixed Fee Setting</h4>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Flat Rate Delivery Fee (Rs.)</span>
              <input type="number" step="0.01" name="fixed_fee" value={config.fixed_fee} onChange={handleChange} disabled={config.active_method !== 'fixed'} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
            </label>
          </div>

          {/* Weight Settings */}
          <div style={{ opacity: ['weight', 'combined'].includes(config.active_method) ? 1 : 0.4 }}>
            <h4 style={{ color: '#2c3e50', margin: '0 0 15px 0' }}>2. Weight-Based Settings</h4>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Base Weight (KG)</span>
                <input type="number" step="0.01" name="base_weight_kg" value={config.base_weight_kg} onChange={handleChange} disabled={!['weight', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Base Fee (Rs.)</span>
                <input type="number" step="0.01" name="base_weight_fee" value={config.base_weight_fee} onChange={handleChange} disabled={!['weight', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
              </label>
            </div>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Fee per extra KG (Rs.)</span>
              <input type="number" step="0.01" name="extra_weight_fee_per_kg" value={config.extra_weight_fee_per_kg} onChange={handleChange} disabled={!['weight', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
            </label>
          </div>

          {/* Distance Settings */}
          <div style={{ opacity: ['distance', 'combined'].includes(config.active_method) ? 1 : 0.4 }}>
            <h4 style={{ color: '#2c3e50', margin: '0 0 15px 0' }}>3. Distance-Based Settings</h4>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Base Distance (KM)</span>
                <input type="number" step="0.01" name="base_distance_km" value={config.base_distance_km} onChange={handleChange} disabled={!['distance', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Base Fee (Rs.)</span>
                <input type="number" step="0.01" name="base_distance_fee" value={config.base_distance_fee} onChange={handleChange} disabled={!['distance', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
              </label>
            </div>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#7f8c8d', marginBottom: '5px' }}>Fee per extra KM (Rs.)</span>
              <input type="number" step="0.01" name="extra_distance_fee_per_km" value={config.extra_distance_fee_per_km} onChange={handleChange} disabled={!['distance', 'combined'].includes(config.active_method)} style={{ padding: '10px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }} />
            </label>
          </div>

        </div>
              {/* Driver Allocation Toggle */}
      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Truck size={20} color="var(--color-primary)" /> Driver Allocation Logic
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: '600' }}>Automatically assign drivers to orders?</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              If enabled, the system will pair 'Processing' orders with available drivers automatically.
            </p>
          </div>
          <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
            <input 
              type="checkbox" 
              name="auto_assign_drivers"
              checked={config.auto_assign_drivers}
              onChange={(e) => setConfig({...config, auto_assign_drivers: e.target.checked})}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{ 
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
              backgroundColor: config.auto_assign_drivers ? 'var(--color-primary)' : '#ccc', 
              transition: '.4s', borderRadius: '34px' 
            }}>
              <span style={{ 
                position: 'absolute', content: '""', height: '18px', width: '18px', left: '4px', bottom: '4px', 
                backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                transform: config.auto_assign_drivers ? 'translateX(24px)' : 'translateX(0)'
              }}></span>
            </span>
          </label>
        </div>
      </div>

        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #eee', textAlign: 'right' }}>
          <button type="submit" style={{ padding: '12px 25px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Save size={18} /> Save Settings
          </button>
        </div>

      </form>
    </div>
  );
}

export default AdminDelivery;