import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, CheckCircle, Star, Pencil, Trash2 } from 'lucide-react';

function StarRating({ value, onChange, readOnly = false }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map(num => (
        <button
          key={num}
          type="button"
          onClick={() => !readOnly && onChange(num)}
          style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 0 }}
        >
          <Star
            size={22}
            color={num <= value ? '#f59e0b' : '#d1d5db'}
            fill={num <= value ? '#f59e0b' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

export default function Feedback() {
  const token = localStorage.getItem('token');
  const [eligibleProducts, setEligibleProducts] = useState([]);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [loadingEligible, setLoadingEligible] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [allFeedbacks, setAllFeedbacks] = useState([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const currentUserId = Number(localStorage.getItem('user_id'));

  useEffect(() => {
    fetchEligibleProducts();
    fetchMyFeedbacks();
    fetchAllFeedbacks();
  }, []);

  const fetchEligibleProducts = async () => {
    setLoadingEligible(true);
    try {
      const res = await fetch('http://localhost:8000/feedback/eligible-products', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setEligibleProducts(Array.isArray(data) ? data : []);
    } catch {
      setEligibleProducts([]);
    } finally {
      setLoadingEligible(false);
    }
  };

  const fetchAllFeedbacks = async () => {
  setLoadingAll(true);
  try {
    const res = await fetch('http://localhost:8000/feedback/', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    setAllFeedbacks(Array.isArray(data) ? data : []);
  } catch {
    setAllFeedbacks([]);
  } finally {
    setLoadingAll(false);
  }
};

  const fetchMyFeedbacks = async () => {
    setLoadingMine(true);
    try {
      const res = await fetch('http://localhost:8000/feedback/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMyFeedbacks(Array.isArray(data) ? data : []);
    } catch {
      setMyFeedbacks([]);
    } finally {
      setLoadingMine(false);
    }
  };

  const toggleProduct = (productId) => {
    setSelectedProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const startEdit = (fb) => {
    setEditingId(fb.id);
    setEditMessage(fb.original_message || fb.message || '');
    setEditRating(fb.rating || 0);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMessage('');
    setEditRating(0);
    setError('');
  };

  const handleUpdate = async (feedbackId) => {
    setError('');

    if (!editMessage.trim()) {
      setError('Please enter your feedback.');
      return;
    }

    if (editRating < 1 || editRating > 5) {
      setError('Please select a rating.');
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/feedback/${feedbackId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: editMessage,
          rating: editRating
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Failed to update feedback');
        return;
      }
      fetchAllFeedbacks();

      setEditingId(null);
      setEditMessage('');
      setEditRating(0);
      fetchMyFeedbacks();
    } catch {
      setError('Network error while updating feedback');
    }
  };

  const handleDelete = async (feedbackId) => {
    setError('');
    const confirmed = window.confirm('Are you sure you want to delete this feedback?');
    if (!confirmed) return;

    try {
      const res = await fetch(`http://localhost:8000/feedback/${feedbackId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Failed to delete feedback');
        return;
      }

      if (editingId === feedbackId) {
        setEditingId(null);
        setEditMessage('');
        setEditRating(0);
      }

      fetchMyFeedbacks();
      fetchAllFeedbacks();
    } catch {
      setError('Network error while deleting feedback');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setFlagged(false);

    if (!message.trim()) {
      setError('Please enter your feedback.');
      return;
    }

    if (rating < 1 || rating > 5) {
      setError('Please select a rating.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:8000/feedback/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          rating,
          product_ids: selectedProductIds
        })
      });
      fetchAllFeedbacks();

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Failed to submit feedback');
      } else {
        setSuccess(true);
        setFlagged(!!data.flagged);
        setMessage('');
        setRating(0);
        setSelectedProductIds([]);
        fetchMyFeedbacks();
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };
  console.log('currentUserId:', currentUserId);
  console.log('allFeedbacks:', allFeedbacks);

  return (
    <div style={{ padding: '30px 0 60px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
          Feedback
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Share your experience with products you already purchased
        </p>
      </div>

      <div className="card" style={{ padding: '28px', marginBottom: '28px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={17} color="var(--color-primary)" /> Leave a Review
        </h3>

        {success && (
          <div style={{ backgroundColor: '#eefcf2', border: '1px solid #bbf7d0', color: 'var(--color-primary)', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} /> Feedback submitted successfully!
          </div>
        )}

        {flagged && (
          <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            Your review was submitted, but it was flagged by the moderation system.
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {loadingEligible ? (
          <p>Loading purchased products...</p>
        ) : eligibleProducts.length === 0 ? (
          <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeeba', color: '#856404', padding: '16px', borderRadius: '8px', fontSize: '13px' }}>
            You cannot submit feedback yet. First purchase and receive at least one product.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '8px' }}>
                Select products for this feedback
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                You can select one, multiple, or leave everything unselected. If you do not select anything, feedback will apply to all purchased products.
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {eligibleProducts.map(product => (
                  <label
                    key={product.product_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 14px',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: selectedProductIds.includes(product.product_id) ? '#f0fdf4' : 'white'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.product_id)}
                      onChange={() => toggleProduct(product.product_id)}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                      {product.product_name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '8px' }}>
                Your Rating
              </label>
              <StarRating value={rating} onChange={setRating} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '6px' }}>
                Your Review
              </label>
              <textarea
                className="input-field"
                placeholder="Write your feedback here..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                style={{ resize: 'vertical', minHeight: '100px' }}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '11px 24px', borderRadius: '8px', gap: '8px' }}>
              <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginTop: '30px' }}>
  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px' }}>
    All Customer Reviews ({allFeedbacks.length})
  </h3>

  {loadingAll ? (
    <p>Loading...</p>
  ) : allFeedbacks.length === 0 ? (
    <div className="card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-light)' }}>
      <p>No customer reviews yet.</p>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {allFeedbacks.map(fb => (
        <div key={fb.id} className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>
                {fb.user_name}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
                For: {fb.applies_to_all ? 'All Products' : (fb.selected_products_label || '')}
              </div>

              <div style={{ marginTop: '6px' }}>
                <StarRating value={fb.rating} readOnly />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}
              </span>

               {fb.user_id === currentUserId && (
                <>
                 <button
                   type="button"
                   onClick={() => startEdit(fb)}
                   style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                   title="Edit"
              >
                <Pencil size={16} />
             </button>

             <button
               type="button"
               onClick={() => handleDelete(fb.id)}
               style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
               title="Delete"
            >
             <Trash2 size={16} />
             </button>
            </>
        )}
      </div>
          </div>

          {editingId === fb.id ? (
  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
        Edit Rating
      </label>
      <StarRating value={editRating} onChange={setEditRating} />
    </div>

    <textarea
      className="input-field"
      value={editMessage}
      onChange={(e) => setEditMessage(e.target.value)}
      rows={4}
      style={{ resize: 'vertical', minHeight: '90px' }}
    />

    <div style={{ display: 'flex', gap: '10px' }}>
      <button
        type="button"
        onClick={() => handleUpdate(fb.id)}
        className="btn btn-primary"
        style={{ padding: '10px 18px', borderRadius: '8px' }}
      >
        Save
      </button>

      <button
        type="button"
        onClick={cancelEdit}
        className="btn"
        style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-light)' }}
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  <>
    <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
     {fb.offensive && fb.user_id !== currentUserId
  ? 'This review is hidden due to inappropriate language.'
  : (fb.original_message || fb.message)}
    </p>

    {fb.reply && (
  <div style={{
    backgroundColor: '#f3f6f4',
    border: '1px solid #e8f9ee',
    padding: '12px',
    borderRadius: '8px',
    marginTop: '12px'
  }}>
    <div style={{
      fontSize: '12px',
      fontWeight: '600',
      color: 'var(--color-primary)',
      marginBottom: '4px'
    }}>
      Your Reply
    </div>

    <div style={{
      fontSize: '11px',
      color: 'var(--text-light)',
      marginBottom: '6px'
    }}>
      {fb.replied_at ? new Date(fb.replied_at).toLocaleString() : ''}
    </div>

    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
      {fb.reply}
    </p>
  </div>
)}
    
  </>
)}
        </div>
      ))}
    </div>
  )}
</div>

     
    </div>
  );
}