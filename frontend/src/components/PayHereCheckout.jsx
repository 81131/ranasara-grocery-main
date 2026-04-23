/**
 * PayHereCheckout.jsx
 * -------------------
 * Handles the PayHere payment popup flow:
 * 1. Parent places a "pending" order on our backend → gets order_id
 * 2. We call /payment/initiate to get the PayHere payload + server-generated hash
 * 3. We load the PayHere JS SDK and call payhere.startPayment(payload)
 * 4. PayHere backend notifies our /payment/notify webhook → order → Processing
 * 5. We poll /payment/status/:id to detect success and call onSuccess()
 *
 * The merchant_secret is NEVER sent to this component — it stays on the server.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader, AlertCircle, CheckCircle } from 'lucide-react';

const PAYHERE_SDK_URL = import.meta.env.VITE_PAYHERE_SANDBOX === 'true'
  ? 'https://www.payhere.lk/lib/payhere.js'
  : 'https://www.payhere.lk/lib/payhere.js';  // same URL, sandbox toggled via merchant config

function loadPayHereSDK() {
  return new Promise((resolve, reject) => {
    if (window.payhere) { resolve(); return; }
    const existing = document.getElementById('payhere-sdk');
    if (existing) { existing.addEventListener('load', resolve); return; }
    const script = document.createElement('script');
    script.id  = 'payhere-sdk';
    script.src = PAYHERE_SDK_URL;
    script.onload  = resolve;
    script.onerror = () => reject(new Error('Failed to load PayHere SDK'));
    document.body.appendChild(script);
  });
}

/**
 * @param {object}   props
 * @param {number}   props.orderId        - Ransara order ID returned after checkout
 * @param {string}   props.token          - JWT token for API calls
 * @param {function} props.onSuccess      - called when payment confirmed
 * @param {function} props.onCancel       - called when user cancels
 * @param {function} props.onError        - called with error message string
 * @param {boolean}  props.autoOpen       - if true, open popup immediately on mount
 */
export default function PayHereCheckout({ orderId, token, onSuccess, onCancel, onError, autoOpen = false }) {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error | cancelled
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Poll /payment/status until order becomes Processing (paid) or Cancelled (failed/abandoned)
  const startPolling = () => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        // Timed out after ~60s — PayHere webhook may be delayed or blocked
        stopPolling();
        setStatus('timeout');
        return;
      }
      try {
        const res = await fetch(`http://localhost:8000/payment/status/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'Processing' || data.status === 'Completed') {
          stopPolling();
          setStatus('success');
          onSuccess?.(data);
        } else if (data.status === 'Cancelled') {
          // PayHere webhook reported failure (-1/-2/-3)
          stopPolling();
          setStatus('cancelled');
          onCancel?.();
        }
        // Any other status (Pending) → keep polling
      } catch (_) { /* network blip — keep polling */ }
    }, 2000);
  };

  const openPayHere = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      // 1. Load SDK
      await loadPayHereSDK();

      // 2. Get server-generated payload + hash
      const res = await fetch('http://localhost:8000/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId, currency: 'LKR' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Could not initiate payment');
      }
      const payload = await res.json();

      // 3. Attach PayHere event handlers
      window.payhere.onCompleted = () => {
        // onCompleted fires when the popup UI closes — NOT a payment confirmation.
        // Do NOT trust this event alone. Start polling for the actual webhook result.
        startPolling();
      };
      window.payhere.onDismissed = () => {
        setStatus('cancelled');
        onCancel?.();
      };
      window.payhere.onError = (error) => {
        setStatus('error');
        setErrorMsg(error || 'PayHere error');
        onError?.(error);
      };

      // 4. Launch popup
      window.payhere.startPayment(payload);
      setStatus('idle'); // popup is open — reset loading state
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Payment failed');
      onError?.(err.message);
    }
  };

  useEffect(() => {
    if (autoOpen) openPayHere();
    return stopPolling;
  }, [autoOpen]);

  if (status === 'success') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 18px', borderRadius: '10px',
        background: '#f0fdf4', border: '1px solid #bbf7d0',
      }}>
        <CheckCircle size={20} color="#16a34a" />
        <div>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#15803d' }}>Payment Successful!</div>
          <div style={{ fontSize: '12px', color: '#16a34a' }}>Your order is now being processed.</div>
        </div>
      </div>
    );
  }

  if (status === 'timeout') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '14px 18px', borderRadius: '10px',
        background: '#fffbeb', border: '1px solid #fde68a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} color="#d97706" />
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#b45309' }}>Confirming Payment…</div>
        </div>
        <div style={{ fontSize: '13px', color: '#92400e' }}>
          We haven't received a confirmation from PayHere yet. Your order is saved — check{' '}
          <strong>My Orders</strong> in a few minutes. If payment was deducted, your order will update automatically.
        </div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 18px', borderRadius: '10px',
        background: '#fffbeb', border: '1px solid #fde68a',
      }}>
        <AlertCircle size={20} color="#d97706" />
        <div>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#b45309' }}>Payment Cancelled</div>
          <div style={{ fontSize: '12px', color: '#d97706' }}>You can try again below.</div>
        </div>
        <button onClick={openPayHere} className="btn btn-primary" style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: '13px' }}>
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '14px 18px', borderRadius: '10px',
        background: '#fef2f2', border: '1px solid #fecaca',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#991b1b' }}>Payment Error</div>
        </div>
        <div style={{ fontSize: '13px', color: '#b91c1c' }}>{errorMsg}</div>
        <button onClick={openPayHere} className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: '13px' }}>
          Retry Payment
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={openPayHere}
      disabled={status === 'loading'}
      className="btn btn-primary"
      style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '8px', justifyContent: 'center', opacity: status === 'loading' ? 0.8 : 1 }}
    >
      {status === 'loading' ? (
        <>
          <Loader size={17} style={{ animation: 'spin 1s linear infinite' }} />
          Opening Payment…
        </>
      ) : (
        <>
          <CreditCard size={17} />
          Pay with Card (PayHere)
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
