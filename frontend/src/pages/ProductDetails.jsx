import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Share2, Star, MessageSquare, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

function StarRating({ value }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={14}
          color={value >= i ? '#f59e0b' : '#d1d5db'}
          fill={value >= i ? '#f59e0b' : 'none'}
        />
      ))}
    </div>
  );
}

function ProductDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams(); // /product/:id
  const { addToast } = useToast();

  const [item, setItem] = useState(location.state || null);
  const [loadingProduct, setLoadingProduct] = useState(!location.state);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // If navigated directly to /product/:id without state, fetch the product
  useEffect(() => {
    if (!location.state && id) {
      setLoadingProduct(true);
      fetch('http://localhost:8000/inventory/storefront')
        .then(r => r.ok ? r.json() : [])
        .then(products => {
          // storefront items use `group_key` as the product id
          const found = products.find(p => String(p.group_key) === String(id) || String(p.id) === String(id));
          if (found) {
            setItem(found);
          } else {
            // Not in storefront — try full products endpoint
            return fetch(`http://localhost:8000/inventory/products`)
              .then(r => r.ok ? r.json() : [])
              .then(all => {
                const allFound = all.find(p => String(p.id) === String(id));
                if (allFound) setItem({
                  id: allFound.id,
                  group_key: allFound.id,
                  product_name: allFound.product_name,
                  category: allFound.category_name,
                  keywords: allFound.keywords || '',
                  price: allFound.retail_price,
                  unit: allFound.unit_of_measure,
                  image: allFound.image_url || 'https://via.placeholder.com/300',
                  available_qty: allFound.current_quantity,
                  primary_batch_id: null,
                });
              });
          }
        })
        .catch(err => console.error('Could not load product', err))
        .finally(() => setLoadingProduct(false));
    }
  }, [id, location.state]);

  // Fetch reviews once we have the product id
  useEffect(() => {
    const productId = item?.group_key || item?.id;
    if (productId) {
      setLoadingReviews(true);
      fetch(`http://localhost:8000/inventory/products/${productId}/feedbacks`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setReviews(Array.isArray(data) ? data : []))
        .catch(err => console.error('Could not fetch reviews', err))
        .finally(() => setLoadingReviews(false));
    }
  }, [item]);

  const handleAddToCart = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      addToast('Please log in to add items to your cart!', 'error');
      navigate('/login');
      return;
    }
    if (!item.primary_batch_id) {
      addToast('This product is out of stock or unavailable for online purchase.', 'error');
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ batch_id: item.primary_batch_id, quantity })
      });
      if (response.ok) {
        addToast(`Added ${quantity} × ${item.product_name} to cart! 🐲`, 'success');
        setQuantity(1); // Reset quantity selector
      } else {
        const err = await response.json().catch(() => ({}));
        addToast('Could not add to cart: ' + (err.detail || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
      addToast('Network error. Please try again.', 'error');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.product_name,
          text: `Check out ${item.product_name} for just Rs. ${item.price} at our store!`,
          url: window.location.href,
        });
      } catch (error) {
        console.log('Error sharing', error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      addToast('Product link copied to clipboard!', 'success');
    }
  };

  if (loadingProduct) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <Loader2 size={40} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading product...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Product not found.</p>
        <button onClick={() => navigate('/')} className="btn btn-primary">Back to Store</button>
      </div>
    );
  }

  const keywordList = item.keywords ? item.keywords.split(',').map(k => k.trim()) : [];
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <button onClick={() => navigate(-1)} className="btn" style={{ background: 'none', color: 'var(--color-info)', padding: '0 0 20px 0' }}>
        <ArrowLeft size={18} /> Back to Store
      </button>

      <div className="card" style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', padding: '40px' }}>

        {/* Left: Image */}
        <div style={{ flex: '1 1 300px' }}>
          <img
            src={item.image || item.image_url || 'https://via.placeholder.com/300'}
            alt={item.product_name}
            style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}
          />
        </div>

        {/* Right: Details */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>
            {item.category}
          </span>

          <h1 className="text-title" style={{ margin: '10px 0', fontSize: '32px' }}>{item.product_name}</h1>

          {avgRating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <StarRating value={Math.round(Number(avgRating))} />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{avgRating} ({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
            </div>
          )}

          <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--color-primary)', margin: '10px 0 20px 0' }}>
            Rs. {Number(item.price).toFixed(2)}
            <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 'normal' }}> / {item.unit}</span>
          </p>

          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '20px' }}>
            {item.description || item.product_description
              ? (item.description || item.product_description)
              : `High-quality ${item.product_name} sourced from our trusted suppliers.`}
            {' '}<span style={{ color: 'var(--text-light)' }}>
              Currently, we have <strong style={{ color: 'var(--text-main)' }}>{item.available_qty} {item.unit}</strong> in stock ready for delivery or pickup.
            </span>
          </p>

          {/* Keywords */}
          {keywordList.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '30px' }}>
              {keywordList.map((kw, i) => (
                <span key={i} style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text-main)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px' }}>
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Cart Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: 'auto', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="btn btn-secondary"
                style={{
                  borderRadius: 0,
                  padding: '12px 20px',
                  fontSize: '18px',
                  opacity: quantity <= 1 ? 0.5 : 1,
                  cursor: quantity <= 1 ? 'not-allowed' : 'pointer'
                }}
              >−</button>
              <span style={{
                padding: '12px 18px',
                fontWeight: '700',
                fontSize: '18px',
                color: 'var(--text-main)',
                minWidth: '48px',
                textAlign: 'center',
                userSelect: 'none'
              }}>{quantity}</span>
              <button
                onClick={() => setQuantity(q => Math.min(item.available_qty || 99, q + 1))}
                disabled={quantity >= item.available_qty || item.available_qty <= 0}
                className="btn btn-secondary"
                style={{
                  borderRadius: 0,
                  padding: '12px 20px',
                  fontSize: '18px',
                  opacity: quantity >= item.available_qty || item.available_qty <= 0 ? 0.5 : 1,
                  cursor: quantity >= item.available_qty || item.available_qty <= 0 ? 'not-allowed' : 'pointer'
                }}
              >+</button>
            </div>

            <button onClick={handleAddToCart} className="btn btn-primary" style={{ flex: 1, padding: '15px 30px', fontSize: '16px' }}>
              <ShoppingCart size={18} /> Add to Cart
            </button>

            <button onClick={handleShare} className="btn" style={{ padding: '15px', backgroundColor: 'var(--color-info)', color: 'white' }} title="Share this product">
              <Share2 size={18} />
            </button>
          </div>
        </div>

      </div>

      {/* Reviews Section */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={20} color="var(--color-primary)" /> Customer Reviews
          {reviews.length > 0 && <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '400' }}>({reviews.length})</span>}
        </h3>

        {loadingReviews ? (
          <p style={{ color: 'var(--text-light)' }}>Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-light)' }}>
            <p>No reviews yet for this product. Be the first to review!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {reviews.map(r => (
              <div key={r.id} className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                      {r.user_name || r.user?.name || `Customer`}
                    </span>
                    <StarRating value={r.rating} />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5', filter: r.offensive ? 'blur(4px)' : 'none', userSelect: r.offensive ? 'none' : 'text' }} > {r.message} </p>
                {r.reply && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '6px' }}>Store Reply</div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{r.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductDetails;