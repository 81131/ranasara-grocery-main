import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNotifications = async () => {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');

      const res = await fetch('http://localhost:8000/orders/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    };
    fetchNotifications();
  }, [navigate]);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>Your Notifications 🔔</h2>
      
      {notifications.length === 0 ? (
        <p style={{ color: '#7f8c8d' }}>No recent updates to your orders.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {notifications.map(note => (
            <Link to={note.destination_url || '#'} key={note.id} style={{ textDecoration: 'none' }}>
              <div style={{ 
                backgroundColor: 'white', padding: '15px 20px', borderRadius: '8px', 
                borderLeft: '4px solid #3498db', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                cursor: note.destination_url ? 'pointer' : 'default', transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {if(note.destination_url) e.currentTarget.style.backgroundColor = '#f8f9fa'}}
              onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = 'white'}}
              >
                <p style={{ margin: '0 0 5px 0', fontSize: '16px', color: '#333' }}>
                  Order <strong>#{note.order_id}</strong> is now <strong>{note.status}</strong>!
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#95a5a6' }}>
                  {new Date(note.changed_at).toLocaleString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notifications;