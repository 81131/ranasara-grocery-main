import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ShoppingBag } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../api';

function Login({ setIsLoggedIn, setUserRole, setIsActive }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    try {
      const response = await api.post('/users/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('isActive', String(data.is_active));
      localStorage.setItem('user_id', String(data.user.id));

      setIsLoggedIn(true);
      setUserRole(data.role);
      setIsActive(data.is_active);

      if (data.role === 'admin') navigate('/admin');
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const response = await api.post('/users/google-login', {
        credential: credentialResponse.credential,
      });

      const data = response.data;
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('isActive', String(data.is_active));
      localStorage.setItem('user_id', String(data.user.id));
      setIsLoggedIn(true);
      setUserRole(data.role);
      setIsActive(data.is_active);
      if (data.role === 'admin') navigate('/admin');
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Google Login failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', backgroundColor: 'var(--bg-main)' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>

        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            backgroundColor: 'var(--color-primary)',
            width: '48px', height: '48px',
            borderRadius: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            margin: '0 auto 15px auto'
          }}>
            <ShoppingBag size={24} color="white" />
          </div>
          <h2 className="text-title" style={{ fontSize: '24px', margin: '0 0 5px 0' }}>Welcome to Ransara</h2>
          <p className="text-subtitle" style={{ fontSize: '14px', margin: '0' }}>Login to your grocery store account</p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-light)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-light)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '15px', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light)' }}></div>
          <span style={{ margin: '0 10px', fontSize: '12px', color: 'var(--text-light)', fontWeight: '600' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light)' }}></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              setError('Google Login Failed');
            }}
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
          <p style={{ color: 'var(--text-main)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: '500', textDecoration: 'none' }}>
              Register here
            </Link>
          </p>
          <p style={{ marginTop: '10px' }}>
            <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: '500' }}>
              Continue as Guest
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;