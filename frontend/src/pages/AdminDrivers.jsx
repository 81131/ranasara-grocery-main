import React, { useState, useEffect } from 'react';
import { Truck, Plus, Star, X, UserMinus, CheckCircle, AlertCircle, Mail, Phone, Shield } from 'lucide-react';
import { useToast } from '../context/ToastContext';

function AdminDrivers() {
  const { addToast } = useToast();
  const [drivers, setDrivers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Initial state for new driver registration
  const initialFormState = {
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    license_number: '',
    vehicle_type: 'Motorcycle',
    assigned_city: 'Colombo',
    password: 'DriverPass123!' // Default password for initial setup
  };
  
  const [formData, setFormData] = useState(initialFormState);

  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const fetchDrivers = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/users/drivers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDrivers(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
      addToast("Error connecting to driver database", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const filteredDrivers = drivers.filter(d => {
    const nameStr = `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase();
    const searchMatch = nameStr.includes(searchQuery.toLowerCase()) || 
                        (d.license_number || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    // Derived status
    let derivedStatus = 'Active';
    if (!d.is_active) derivedStatus = 'Inactive';
    else if (d.assigned_order_id) derivedStatus = 'On Delivery';
    
    const statusMatch = statusFilter === 'All' || derivedStatus === statusFilter;
    
    return searchMatch && statusMatch;
  }).sort((a, b) => {
    let valA = a.first_name || '';
    let valB = b.first_name || '';
    if (sortField === 'rating') {
      valA = a.rating || 0;
      valB = b.rating || 0;
    } else if (sortField === 'deliveries') {
      valA = a.total_deliveries || 0;
      valB = b.total_deliveries || 0;
    }
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleAddDriver = async (e) => {
    e.preventDefault();
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{}|;':",./<>?`~])[A-Za-z\d!@#$%^&*()_\-+=\[\]{}|;':",./<>?`~]{8,}$/;
    if (!pwdRegex.test(formData.password)) {
      addToast('Password must be at least 8 chars long and contain an uppercase, lowercase, number, and special character', "error");
      return;
    }
    const phoneRegex = /^(\d{10}|\+\d{10,15})$/;
    if (!phoneRegex.test(formData.phone_number)) {
      addToast('Phone number must be exactly 10 digits or international format (e.g. +94...)', "error");
      return;
    }
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch('http://localhost:8000/users/register-driver', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        addToast(`Driver ${formData.first_name} registered successfully!`, "success");
        setShowAddForm(false);
        setFormData(initialFormState);
        fetchDrivers();
      } else {
        const errorData = await res.json();
        addToast(errorData.detail || "Failed to register driver", "error");
      }
    } catch (err) {
      addToast("Network error during registration", "error");
    }
  };

  const handleDeleteDriver = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this driver from the fleet?")) return;
    
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8000/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast("Driver removed successfully", "success");
        fetchDrivers();
      }
    } catch (err) {
      addToast("Failed to remove driver", "error");
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Truck color="var(--color-primary)" /> Fleet Management
        </h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'}`}
          style={{ backgroundColor: showAddForm ? 'var(--color-danger)' : '', color: 'white' }}
        >
          {showAddForm ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Register Driver</>}
        </button>
      </div>

      {/* REGISTRATION FORM */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: '30px', borderTop: '4px solid var(--color-primary)' }}>
          <h3 className="text-title" style={{ fontSize: '18px', marginBottom: '20px' }}>New Driver Credentials</h3>
          <form onSubmit={handleAddDriver} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <input type="text" placeholder="First Name" required className="input-field" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} />
              <input type="text" placeholder="Last Name" required className="input-field" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} />
              <input type="email" placeholder="Email Address" required className="input-field" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              <input type="text" placeholder="Phone Number" required className="input-field" value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} />
              <input type="text" placeholder="License Plate / ID" required className="input-field" value={formData.license_number} onChange={e => setFormData({...formData, license_number: e.target.value})} />
              <select className="input-field" value={formData.vehicle_type} onChange={e => setFormData({...formData, vehicle_type: e.target.value})}>
                <option value="Motorcycle">Motorcycle</option>
                <option value="Car / Van">Car / Van</option>
                <option value="Three-Wheeler">Three-Wheeler</option>
                <option value="Bicycle">Bicycle</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: 'var(--bg-muted)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <Shield size={18} color="var(--color-info)" />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Initial Password for driver login: <strong>{formData.password}</strong>
              </span>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', padding: '12px 30px' }}>
              Add to Fleet
            </button>
          </form>
        </div>
      )}

      {/* DRIVER ROSTER */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: '15px', padding: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
          <input 
            type="text" 
            placeholder="Search by name or license..." 
            className="input-field" 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '250px', margin: 0 }}
          />
          <select 
            className="input-field" 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '180px', margin: 0 }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="On Delivery">On Delivery</option>
          </select>
          <select 
            className="input-field" 
            value={sortField} 
            onChange={e => setSortField(e.target.value)}
            style={{ width: '180px', margin: 0 }}
          >
            <option value="name">Sort by Name</option>
            <option value="rating">Sort by Rating</option>
            <option value="deliveries">Sort by Total Deliveries</option>
          </select>
          <select 
            className="input-field" 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value)}
            style={{ width: '150px', margin: 0 }}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Syncing with fleet...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--bg-muted)', borderBottom: '2px solid var(--border-light)' }}>
              <tr>
                <th style={{ padding: '15px', color: 'var(--text-muted)' }}>Driver Identity</th>
                <th style={{ padding: '15px', color: 'var(--text-muted)' }}>Logistics Info</th>
                <th style={{ padding: '15px', color: 'var(--text-muted)' }}>Availability</th>
                <th style={{ padding: '15px', color: 'var(--text-muted)' }}>Performance</th>
                <th style={{ padding: '15px', color: 'var(--text-muted)', textAlign: 'center' }}>Management</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>No delivery drivers found.</td></tr>
              ) : (
                filteredDrivers.map(driver => (
                  <tr key={driver.user_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{driver.first_name} {driver.last_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <Mail size={12} /> {driver.email}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <Phone size={12} /> {driver.phone_number}
                      </div>
                    </td>
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{driver.driver_profile?.vehicle_type}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-light)', fontFamily: 'monospace' }}>Plate: {driver.driver_profile?.license_number}</div>
                    </td>
                    <td style={{ padding: '15px' }}>
                      {driver.driver_profile?.is_available ? (
                        <span style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <CheckCircle size={14} /> Available
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-warning)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <AlertCircle size={14} /> On Trip
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                        <Star size={14} fill="#f1c40f" color="#f1c40f" /> {driver.driver_profile?.rating.toFixed(1)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{driver.driver_profile?.total_deliveries} deliveries completed</div>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleDeleteDriver(driver.user_id)} 
                        className="btn" 
                        style={{ padding: '8px', color: 'var(--color-danger)', backgroundColor: 'transparent', border: '1px solid var(--border-light)' }}
                        title="Remove Driver"
                      >
                        <UserMinus size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminDrivers;