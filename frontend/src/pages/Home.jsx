import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Search, Filter, Tag } from 'lucide-react';

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: '12px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  border: '1px solid var(--border-light)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'box-shadow 0.2s, transform 0.2s',
};

function ProductCard({ item, quantity, onChangeQty, onAddToCart, onView }) {
  return (
    <div
      style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ cursor: 'pointer', overflow: 'hidden', height: '180px' }} onClick={onView}>
        <img
          src={item.image}
          alt={item.product_name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          onError={e => { e.target.src = 'https://placehold.co/400x400/eefcf2/00a247?text=' + encodeURIComponent(item.product_name); }}
        />
      </div>

      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ backgroundColor: '#eefcf2', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Tag size={9} /> {item.category}
          </span>
        </div>

        <h3 style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-main)', margin: 0, lineHeight: 1.3, cursor: 'pointer' }} onClick={onView}>
          {item.product_name}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px', color: '#f59e0b' }}>★</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
            {(item.average_rating ?? 0).toFixed(1)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
            ({item.rating_count || 0})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
          <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--color-primary)' }}>Rs. {item.price.toFixed(2)}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>/ {item.unit}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '4px' }}>
          <button
            onClick={() => onChangeQty(-1)}
            style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Minus size={13} />
          </button>
          <span style={{ fontWeight: '700', fontSize: '15px', minWidth: '20px', textAlign: 'center', color: 'var(--text-main)' }}>{quantity}</span>
          <button
            onClick={() => onChangeQty(1)}
            disabled={quantity >= item.available_qty || item.available_qty <= 0}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: quantity >= item.available_qty || item.available_qty <= 0 ? 'not-allowed' : 'pointer',
              opacity: quantity >= item.available_qty || item.available_qty <= 0 ? 0.5 : 1
            }}
           >
            <Plus size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button onClick={onView} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: 'var(--text-main)' }}>
            View
          </button>
          <button
            onClick={onAddToCart}
            disabled={item.available_qty <= 0}
            className="btn btn-primary"
            style={{
              flex: 2,
              padding: '9px',
              borderRadius: '8px',
              fontSize: '13px',
              gap: '5px',
              opacity: item.available_qty <= 0 ? 0.5 : 1,
              cursor: item.available_qty <= 0 ? 'not-allowed' : 'pointer'
            }}
           >
             <ShoppingCart size={14} /> {item.available_qty <= 0 ? 'Out of Stock' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div style={{ ...cardStyle, animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ height: '180px', backgroundColor: '#f3f4f6' }}></div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ height: '12px', backgroundColor: '#e5e7eb', borderRadius: '6px', width: '40%' }}></div>
        <div style={{ height: '16px', backgroundColor: '#e5e7eb', borderRadius: '6px', width: '80%' }}></div>
        <div style={{ height: '20px', backgroundColor: '#e5e7eb', borderRadius: '6px', width: '50%' }}></div>
        <div style={{ height: '36px', backgroundColor: '#e5e7eb', borderRadius: '8px' }}></div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState({});
  const [storeItems, setStoreItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [maxPriceLimit, setMaxPriceLimit] = useState(10000);
  const [currentPriceFilter, setCurrentPriceFilter] = useState(10000);
  const [toast, setToast] = useState(null);
  const [visibleCount, setVisibleCount] = useState(40);
  const observer = useRef();

  const lastElementRef = useCallback(node => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 40);
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoading]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('http://localhost:8000/inventory/storefront')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setStoreItems(data);
        if (data.length > 0) {
          const max = Math.ceil(Math.max(...data.map(i => i.price)));
          setMaxPriceLimit(max);
          setCurrentPriceFilter(max);
        }
      })
      .catch(() => setStoreItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  const changeQty = (groupKey, delta, max) => {
    setQuantities(prev => {
      const curr = prev[groupKey] || 1;
      const next = curr + delta;
      if (next < 1 || next > max) return prev;
      return { ...prev, [groupKey]: next };
    });
  };

  const handleAddToCart = async (item) => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const qty = quantities[item.group_key] || 1;
    try {
      const res = await fetch('http://localhost:8000/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ batch_id: item.primary_batch_id, quantity: qty }),
      });
      if (res.ok) {
        showToast(`Added ${qty}x ${item.product_name} to cart!`);
        setQuantities(prev => ({ ...prev, [item.group_key]: 1 }));
      } else {
        const err = await res.json();
        showToast(err.detail || 'Failed to add to cart', 'error');
      }
    } catch { showToast('Network error', 'error'); }
  };

  const uniqueCategories = [...new Set(storeItems.map(i => i.category).filter(Boolean))];
  const toggleCategory = (cat) => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const filtered = storeItems.filter(item => {
    const term = searchTerm.toLowerCase();
    const matchSearch = item.product_name.toLowerCase().includes(term) || (item.category || '').toLowerCase().includes(term) || (item.keywords || '').toLowerCase().includes(term);
    const matchCat = selectedCategories.length === 0 || selectedCategories.includes(item.category);
    const matchPrice = item.price <= currentPriceFilter;
    return matchSearch && matchCat && matchPrice;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: '30px' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: toast.type === 'error' ? '#ef4444' : 'var(--color-primary)', color: 'white', padding: '14px 20px', borderRadius: '10px', fontWeight: '500', zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: '14px', maxWidth: '320px' }}>
          {toast.msg}
        </div>
      )}

      {/* SIDEBAR */}
      <aside style={{ width: '240px', flexShrink: 0, marginRight: '30px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', position: 'sticky', top: '94px', height: 'fit-content' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '20px' }}>
          <Filter size={16} color="var(--color-primary)" /> Filters
        </h3>

        <div style={{ marginBottom: '22px', position: 'relative' }}>
          <Search size={14} color="var(--text-light)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '34px', fontSize: '13px' }}
          />
        </div>

        <div style={{ marginBottom: '22px' }}>
          <h4 style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', marginBottom: '10px' }}>Price Range</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--color-primary)', fontWeight: '700' }}>Up to Rs. {currentPriceFilter.toLocaleString()}</p>
          <input type="range" min="0" max={maxPriceLimit} value={currentPriceFilter} onChange={e => setCurrentPriceFilter(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
        </div>

        <div>
          <h4 style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', marginBottom: '12px' }}>Categories</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {uniqueCategories.map(cat => (
              <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleCategory(cat)} style={{ accentColor: 'var(--color-primary)', width: '15px', height: '15px' }} />
                {cat}
              </label>
            ))}
            {uniqueCategories.length === 0 && !isLoading && <span style={{ fontSize: '13px', color: 'var(--text-light)' }}>No categories found.</span>}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, paddingBottom: '60px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Fresh Groceries, Delivered.</h2>
          <p style={{ fontSize: '16px', color: 'var(--text-muted)' }}>Quality ingredients for your daily needs.</p>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <Search size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '8px' }}>No matches found.</h3>
            <p>Try adjusting your filters or search term.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {filtered.slice(0, visibleCount).map((item, index) => {
              const isLastItem = index === filtered.slice(0, visibleCount).length - 1;
              return (
                <div key={item.group_key} ref={isLastItem ? lastElementRef : null}>
                  <ProductCard
                    item={item}
                    quantity={quantities[item.group_key] || 1}
                    onChangeQty={(d) => changeQty(item.group_key, d, item.available_qty)}
                    onAddToCart={() => handleAddToCart(item)}
                    onView={() => navigate(`/product/${item.primary_batch_id}`, { state: item })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;