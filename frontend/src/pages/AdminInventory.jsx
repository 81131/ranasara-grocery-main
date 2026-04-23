import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Package, Tag, Plus, Edit, Sparkles, Loader, X, Image as ImageIcon, Copy, History as HistoryIcon, Layers } from 'lucide-react';

function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // UI Toggles
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false); 
  const [showStockForm, setShowStockForm] = useState(null); 
  const [editingProductId, setEditingProductId] = useState(null);

  // Forms
  const [categoryData, setCategoryData] = useState({ name: '', description: '', discount_percentage: '' });
  
  const initialProductState = { product_name: '', sku: '', category_ids: [], supplier_id: '', unit_of_measure: 'Units', keywords: '', description: '' };
  const [productData, setProductData] = useState(initialProductState);
  
  const initialStockState = { batch_number: '', buying_price: '', retail_price: '', current_quantity: '', unit_weight_kg: '', manufacture_date: '', expiry_date: '' };
  const [stockData, setStockData] = useState(initialStockState);

  // AI & Keywords
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  
  // DRAG AND DROP & IMAGE STATES
  const [dragActive, setDragActive] = useState({ product: false, batch: false });
  const productFileInputRef = useRef(null);
  const batchFileInputRef = useRef(null);
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState(null);
  const [batchImageFile, setBatchImageFile] = useState(null);
  const [batchImagePreview, setBatchImagePreview] = useState(null);

  // Cropper States
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState(null); 
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState({ unit: '%', width: 50, aspect: 1 });
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  // BATCH MANAGEMENT STATES
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [productBatches, setProductBatches] = useState([]);
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [batchEditData, setBatchEditData] = useState({ buying_price: '', retail_price: '', current_quantity: '' });
  const [batchHistoryLog, setBatchHistoryLog] = useState([]);
  const [showBatchHistoryModal, setShowBatchHistoryModal] = useState(false);

  // Sorting & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const navigate = useNavigate();

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [prodRes, catRes, supRes] = await Promise.all([
        fetch('http://localhost:8000/inventory/products', { headers }),
        fetch('http://localhost:8000/inventory/categories', { headers }),
        fetch('http://localhost:8000/suppliers/', { headers })
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
    } catch (error) { console.error(error); }
  };

  useEffect(() => { fetchData(); }, []);

  // --- Image and Utility handlers go here (identical to original code) ---
  const handleGenerateKeywords = async () => {
    if (!productData.product_name) {
      alert("Please enter a product name first!"); return;
    }
    setIsGeneratingAI(true);
    const token = localStorage.getItem('token');
    const catNames = categories.filter(c => productData.category_ids.includes(c.id)).map(c => c.name).join(", ");
    
    try {
      const res = await fetch('http://localhost:8000/inventory/generate-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ product_name: productData.product_name, description: productData.description || "", categories: catNames })
      });
      if (res.ok) setSuggestedKeywords((await res.json()).keywords);
    } catch (err) { console.error("AI Error:", err); }
    setIsGeneratingAI(false);
  };

  const formatKeyword = (text) => {
    let cleaned = text.trim();
    if (!cleaned.startsWith('#')) cleaned = '#' + cleaned;
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, 'Rs. 1 $2');
    return '#' + cleaned.charAt(1).toUpperCase() + cleaned.slice(2);
  };

  const handleKeywordKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      if (!keywordInput.trim()) return;
      const newKw = formatKeyword(keywordInput);
      const currentList = productData.keywords ? productData.keywords.split(',').map(k => k.trim()).filter(k=>k) : [];
      if (!currentList.includes(newKw)) setProductData({...productData, keywords: [...currentList, newKw].join(', ')});
      setKeywordInput(''); 
    }
  };

  const toggleKeyword = (kw) => {
    const currentList = productData.keywords ? productData.keywords.split(',').map(k => k.trim()).filter(k=>k) : [];
    if (currentList.includes(kw)) {
      setProductData({...productData, keywords: currentList.filter(k => k !== kw).join(', ')});
    } else {
      setProductData({...productData, keywords: [...currentList, kw].join(', ')});
    }
  };

  const removeKeyword = (kwToRemove) => {
    const currentList = productData.keywords ? productData.keywords.split(',').map(k => k.trim()).filter(k=>k) : [];
    setProductData({...productData, keywords: currentList.filter(k => k !== kwToRemove).join(', ')});
  };

  const toggleCategory = (id) => {
    setProductData(prev => {
      const ids = prev.category_ids.includes(id) ? prev.category_ids.filter(cid => cid !== id) : [...prev.category_ids, id];
      return { ...prev, category_ids: ids };
    });
  };

  const processImageFile = (file, target) => {
    if (!file || !file.type.startsWith('image/')) { alert("Please upload a valid image file."); return; }
    setCropTarget(target); setCrop({ unit: '%', width: 50, aspect: 1 }); 
    const reader = new FileReader();
    reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
    reader.readAsDataURL(file); setCropModalOpen(true);
  };

  const handleFileSelect = (e, target) => { if (e.target.files && e.target.files.length > 0) processImageFile(e.target.files[0], target); e.target.value = null; };
  const handleDragOver = (e, target) => { e.preventDefault(); e.stopPropagation(); setDragActive(prev => ({ ...prev, [target]: true })); };
  const handleDragLeave = (e, target) => { e.preventDefault(); e.stopPropagation(); setDragActive(prev => ({ ...prev, [target]: false })); };
  const handleDrop = (e, target) => { e.preventDefault(); e.stopPropagation(); setDragActive(prev => ({ ...prev, [target]: false })); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processImageFile(e.dataTransfer.files[0], target); };

  const handleSaveCrop = () => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current; const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width; const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width; canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, completedCrop.width, completedCrop.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(blob);
      if (cropTarget === 'product') { setProductImageFile(file); setProductImagePreview(previewUrl); } 
      else if (cropTarget === 'batch') { setBatchImageFile(file); setBatchImagePreview(previewUrl); }
      setCropModalOpen(false); setImgSrc(''); setCompletedCrop(null);
    }, 'image/jpeg', 0.95);
  };

  const uploadImageToServer = async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData(); formData.append("file", file);
    const res = await fetch('http://localhost:8000/inventory/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (res.ok) return (await res.json()).image_url; return null;
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/inventory/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
        body: JSON.stringify({ name: categoryData.name, description: categoryData.description, discount_percentage: categoryData.discount_percentage || 0 })
      });
      if (res.ok) {
        setShowCategoryForm(false); setCategoryData({ name: '', description: '', discount_percentage: '' }); fetchData();
      } else { alert("Failed to create category"); }
    } catch (error) { console.error(error); }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const payload = { ...productData };
    if (!payload.sku.trim()) delete payload.sku; 
    if (payload.category_ids.length === 0) { alert("Please select at least one category."); return; }

    if (productImageFile) {
      const uploadedUrl = await uploadImageToServer(productImageFile);
      if (uploadedUrl) payload.image_url = uploadedUrl;
    }
    
    const url = editingProductId ? `http://localhost:8000/inventory/products/${editingProductId}` : 'http://localhost:8000/inventory/products';
    const method = editingProductId ? 'PUT' : 'POST';

    const res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });

    if (res.ok) {
      setShowProductForm(false); setEditingProductId(null);
      setProductData(initialProductState); setProductImageFile(null); setProductImagePreview(null); setSuggestedKeywords([]);
      fetchData(); 
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const payload = {
      product_id: showStockForm, batch_number: stockData.batch_number, buying_price: parseFloat(stockData.buying_price), retail_price: parseFloat(stockData.retail_price), current_quantity: parseFloat(stockData.current_quantity),
      unit_weight_kg: stockData.unit_weight_kg ? parseFloat(stockData.unit_weight_kg) : null,
      manufacture_date: stockData.manufacture_date ? new Date(stockData.manufacture_date).toISOString() : null,
      expiry_date: stockData.expiry_date ? new Date(stockData.expiry_date).toISOString() : null
    };

    if (batchImageFile) { const uploadedUrl = await uploadImageToServer(batchImageFile); if (uploadedUrl) payload.image_url = uploadedUrl; }

    const res = await fetch('http://localhost:8000/inventory/batches', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });

    if (res.ok) {
      setShowStockForm(null); setStockData(initialStockState); setBatchImageFile(null); setBatchImagePreview(null); fetchData(); 
    }
  };

  const handleCloneBatch = (batchId) => {
    if (!batchId) { setStockData(initialStockState); return; }
    const batch = productBatches.find(b => b.id === parseInt(batchId));
    if (batch) setStockData({ ...stockData, buying_price: batch.buying_price, retail_price: batch.retail_price, unit_weight_kg: batch.unit_weight_kg || '' });
  };

  const openReceiveStock = async (product) => {
    setShowStockForm(product.id);
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:8000/inventory/products/${product.id}/batches`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) setProductBatches(await res.json());
  };

  const handleEditProduct = (product) => {
    setProductData({ product_name: product.product_name, sku: product.sku, category_ids: [], supplier_id: product.supplier_id || '', unit_of_measure: product.unit_of_measure, keywords: product.keywords || '', description: '' });
    setProductImagePreview(product.image_url); setEditingProductId(product.id); setShowProductForm(true); window.scrollTo(0,0);
  };

  const handleOpenBatchManager = async (product) => {
    setSelectedProduct(product);
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:8000/inventory/products/${product.id}/batches`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) setProductBatches(await res.json());
  };

  const handleSaveBatchEdit = async (batchId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:8000/inventory/batches/${batchId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ buying_price: parseFloat(batchEditData.buying_price), retail_price: parseFloat(batchEditData.retail_price), current_quantity: parseFloat(batchEditData.current_quantity) })
    });
    if (res.ok) { setEditingBatchId(null); handleOpenBatchManager(selectedProduct); fetchData(); } else { alert('Failed to update batch'); }
  };

  const handleViewBatchHistory = async (batchId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:8000/inventory/batches/${batchId}/history`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) { setBatchHistoryLog(await res.json()); setShowBatchHistoryModal(true); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package color="var(--color-primary)" /> Inventory Management
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowCategoryForm(!showCategoryForm)} className={`btn ${showCategoryForm ? 'btn-secondary' : ''}`} style={{ backgroundColor: showCategoryForm ? 'var(--color-danger)' : 'var(--color-warning)', color: 'white' }}>
            {showCategoryForm ? "Cancel Category" : <><Tag size={16} /> Add Category</>}
          </button>
          <button onClick={() => {setShowProductForm(!showProductForm); setEditingProductId(null); setProductData(initialProductState); setProductImagePreview(null); setSuggestedKeywords([]);}} className={`btn ${showProductForm ? 'btn-secondary' : 'btn-primary'}`} style={{ backgroundColor: showProductForm ? 'var(--color-danger)' : '', color: 'white' }}>
            {showProductForm ? "Cancel Product" : <><Plus size={16} /> Add Product</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search product name or SKU..." className="input-field" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '250px', margin: 0 }} />
        <select className="input-field" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: '200px', margin: 0 }}>
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className="input-field" value={sortField} onChange={e => setSortField(e.target.value)} style={{ width: '180px', margin: 0 }}>
          <option value="name">Sort by Name</option>
          <option value="price">Sort by Retail Price</option>
          <option value="stock">Sort by Stock Level</option>
          <option value="profit">Sort by Profit</option>
        </select>
        <select className="input-field" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ width: '150px', margin: 0 }}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      {showCategoryForm && (
        <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--color-warning)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}><Tag size={20} /> Create New Category</h3>
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" className="input-field" placeholder="Category Name" required value={categoryData.name || ''} onChange={e => setCategoryData({...categoryData, name: e.target.value})} style={{ flex: 1 }} />
            <input type="text" className="input-field" placeholder="Description (Optional)" value={categoryData.description || ''} onChange={e => setCategoryData({...categoryData, description: e.target.value})} style={{ flex: 2 }} />
            <input type="number" step="0.01" className="input-field" placeholder="Discount %" value={categoryData.discount_percentage || ''} onChange={e => setCategoryData({...categoryData, discount_percentage: parseFloat(e.target.value)})} style={{ width: '120px' }} title="Apply a global discount to this category" />
            <button type="submit" className="btn" style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}>Save Category</button>
          </form>
        </div>
      )}

      {showProductForm && (
        <div className="card" style={{ marginBottom: '20px', borderTop: editingProductId ? '4px solid var(--color-warning)' : '4px solid var(--color-primary)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            {editingProductId ? <><Edit size={20} /> Edit Product Details</> : <><Plus size={20} /> Create New Product</>}
          </h3>
          
          <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div onDragOver={(e) => handleDragOver(e, 'product')} onDragLeave={(e) => handleDragLeave(e, 'product')} onDrop={(e) => handleDrop(e, 'product')} onClick={() => productFileInputRef.current?.click()} style={{ width: '120px', height: '120px', backgroundColor: dragActive.product ? 'var(--bg-secondary)' : 'var(--bg-muted)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: dragActive.product ? '2px dashed var(--color-info)' : '2px dashed var(--border-light)', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease' }} title="Click to browse or drag an image here">
                {productImagePreview ? <img src={productImagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={32} color={dragActive.product ? "var(--color-info)" : "var(--text-light)"} />}
              </div>
              <input ref={productFileInputRef} type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'product')} style={{ display: 'none' }} />
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <input type="text" className="input-field" placeholder="Product Name" required value={productData.product_name} onChange={e => setProductData({...productData, product_name: e.target.value})} style={{ flex: 2 }} />
                  <input type="text" className="input-field" placeholder="SKU (Leave blank to auto-generate)" value={productData.sku} onChange={e => setProductData({...productData, sku: e.target.value})} style={{ flex: 1 }} disabled={editingProductId} />
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <select className="input-field" required value={productData.supplier_id} onChange={e => setProductData({...productData, supplier_id: parseInt(e.target.value)})} style={{ flex: 1 }}>
                    <option value="" disabled>Select Supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select className="input-field" required value={productData.unit_of_measure} onChange={e => setProductData({...productData, unit_of_measure: e.target.value})} style={{ flex: 1 }}>
                    <option value="Units">Units</option><option value="KG">Kilograms (KG)</option><option value="Liters">Liters (L)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-muted)', padding: '15px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <label style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>Select Categories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                {categories.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={productData.category_ids.includes(c.id)} onChange={() => toggleCategory(c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '15px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <label style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                Search Keywords / SEO Tags
                <button type="button" onClick={handleGenerateKeywords} disabled={isGeneratingAI} className="btn" style={{ padding: '6px 12px', backgroundColor: '#8e44ad', color: 'white', fontSize: '12px' }}>
                  {isGeneratingAI ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} {isGeneratingAI ? "Thinking..." : "Generate AI Keywords"}
                </button>
              </label>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(productData.keywords ? productData.keywords.split(',').map(k => k.trim()).filter(k=>k) : []).map((kw, i) => (
                  <span key={i} style={{ padding: '6px 12px', backgroundColor: 'var(--color-info)', color: 'white', borderRadius: '15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {kw}
                    <button type="button" onClick={() => removeKeyword(kw)} style={{ background: 'none', border: 'none', color: '#e0f7fa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                  </span>
                ))}
              </div>

              <input type="text" className="input-field" placeholder="Type a keyword and press Enter (e.g. #FreshProduce)" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} onKeyDown={handleKeywordKeyDown} />
              <p className="text-subtitle" style={{ margin: '5px 0 10px 0', fontSize: '11px' }}>Press <strong>Enter</strong> to add a tag.</p>
              
              {suggestedKeywords.length > 0 && (
                <div style={{ backgroundColor: '#f4ebf9', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed #c39bd3', marginTop: '10px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#8e44ad', fontWeight: 'bold' }}>AI Suggestions (Click to Add):</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {suggestedKeywords.map((kw, i) => {
                      const currentList = productData.keywords ? productData.keywords.split(',').map(k => k.trim()) : [];
                      if (currentList.includes(kw)) return null; 
                      return <span key={i} onClick={() => toggleKeyword(kw)} style={{ padding: '5px 12px', backgroundColor: 'white', color: '#8e44ad', border: '1px solid #8e44ad', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' }}>+ {kw}</span>;
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', backgroundColor: editingProductId ? 'var(--color-warning)' : 'var(--color-primary)' }}>
              {editingProductId ? "Save Changes" : "Save Product"}
            </button>
          </form>
        </div>
      )}

{/* --- RECEIVE STOCK FORM --- */}
      {showStockForm && (
        <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--color-warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} /> Receive New Stock Batch
            </h3>
            {productBatches.length > 0 && (
              <select className="input-field" onChange={(e) => handleCloneBatch(e.target.value)} style={{ width: 'auto', padding: '8px' }}>
                <option value="">-- Copy Pricing from Existing Batch --</option>
                {productBatches.map(b => (
                  <option key={b.id} value={b.id}>Batch {b.batch_number} (Retail: Rs.{b.retail_price})</option>
                ))}
              </select>
            )}
          </div>

          <form onSubmit={handleAddStock} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div onDragOver={(e) => handleDragOver(e, 'batch')} onDragLeave={(e) => handleDragLeave(e, 'batch')} onDrop={(e) => handleDrop(e, 'batch')} onClick={() => batchFileInputRef.current?.click()} style={{ width: '100px', height: '100px', backgroundColor: dragActive.batch ? 'var(--bg-secondary)' : 'var(--bg-muted)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: dragActive.batch ? '2px dashed var(--color-warning)' : '2px dashed var(--border-light)', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease' }}>
                {batchImagePreview ? <img src={batchImagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={28} color={dragActive.batch ? "var(--color-warning)" : "var(--text-light)"} />}
              </div>
              <input ref={batchFileInputRef} type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'batch')} style={{ display: 'none' }} />
              
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                <input type="text" className="input-field" placeholder="Batch No. (e.g. BATCH-01)" required value={stockData.batch_number} onChange={e => setStockData({...stockData, batch_number: e.target.value})} />
                <input type="number" step="0.01" className="input-field" placeholder="Quantity Received" required value={stockData.current_quantity} onChange={e => setStockData({...stockData, current_quantity: e.target.value})} />
                
                {products.find(p => p.id === showStockForm)?.unit_of_measure === 'Units' ? (
                  <input type="number" step="0.001" className="input-field" placeholder="Weight per Unit (KG)" required value={stockData.unit_weight_kg} onChange={e => setStockData({...stockData, unit_weight_kg: e.target.value})} style={{ border: '1px solid var(--color-warning)', backgroundColor: '#fffaf0' }} title="Required for delivery fee calculations" />
                ) : <div />}

                <input type="number" step="0.01" className="input-field" placeholder="Cost Price (Rs.)" required value={stockData.buying_price} onChange={e => setStockData({...stockData, buying_price: e.target.value})} />
                <input type="number" step="0.01" className="input-field" placeholder="Retail Price (Rs.)" required value={stockData.retail_price} onChange={e => setStockData({...stockData, retail_price: e.target.value})} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', backgroundColor: 'var(--bg-muted)', padding: '15px', borderRadius: 'var(--radius-md)' }}>
              <label style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 'bold' }}>Manufacture Date
                <input type="date" className="input-field" value={stockData.manufacture_date} onChange={e => setStockData({...stockData, manufacture_date: e.target.value})} style={{ marginTop: '5px' }} />
              </label>
              <label style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 'bold' }}>Expiry Date
                <input type="date" className="input-field" required value={stockData.expiry_date} onChange={e => setStockData({...stockData, expiry_date: e.target.value})} style={{ marginTop: '5px', border: '1px solid var(--color-danger)' }} />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => { setShowStockForm(null); setStockData(initialStockState); }} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Add Inventory to DB</button>
            </div>
          </form>
        </div>
      )}

      {/* MAIN INVENTORY TABLE */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
          <thead style={{ backgroundColor: 'var(--bg-muted)', borderBottom: '2px solid var(--border-light)' }}>
            <tr>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>SKU</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Product Name</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Total Stock</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Cost</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Retail</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Profit/Unit</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Est. Total Profit</th>
              <th style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '14px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((item) => {
              const profitPerUnit = item.retail_price - item.buying_price;
              const estTotalProfit = profitPerUnit * item.current_quantity;

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '14px' }}>{item.sku}</td>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.image_url ? <img src={item.image_url} alt="Product" style={{ width: '30px', height: '30px', borderRadius: '4px', objectFit: 'cover' }} /> : <div style={{ width: '30px', height: '30px', backgroundColor: 'var(--bg-muted)', borderRadius: '4px' }}></div>}
                    <div>
                      <span style={{ fontSize: '14px' }}>{item.product_name}</span> <br/>
                      <span className="text-subtitle" style={{ fontSize: '11px', fontWeight: 'normal' }}>{item.category_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: item.current_quantity > 0 ? 'var(--color-primary)' : 'var(--color-danger)', fontSize: '14px' }}>{item.current_quantity} {item.unit_of_measure}</td>
                  
                  <td style={{ padding: '15px', fontWeight: '500', color: 'var(--text-muted)', fontSize: '14px' }}>Rs. {item.buying_price.toFixed(2)}</td>
                  <td style={{ padding: '15px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>Rs. {item.retail_price.toFixed(2)}</td>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: 'var(--color-info)', fontSize: '14px' }}>Rs. {profitPerUnit.toFixed(2)}</td>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: '#8e44ad', fontSize: '14px' }}>Rs. {estTotalProfit.toFixed(2)}</td>
                  
                  <td style={{ padding: '15px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => openReceiveStock(item)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }}><Plus size={14}/> Stock</button>
                    <button onClick={() => handleEditProduct(item)} className="btn" style={{ padding: '6px 10px', backgroundColor: 'var(--color-warning)', color: 'white', fontSize: '12px' }}><Edit size={14}/> Edit</button>
                    <button onClick={() => handleOpenBatchManager(item)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--color-info)' }}><Layers size={14}/> Prices</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* BATCH MANAGER MODAL */}
      {selectedProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 900 }}>
          <div className="card" style={{ width: '800px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid var(--border-light)', paddingBottom: '10px' }}>
              <h3 className="text-title">Stock Batches: {selectedProduct.product_name}</h3>
              <button onClick={() => {setSelectedProduct(null); setEditingBatchId(null);}} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20}/></button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--bg-muted)' }}>
                <tr>
                  <th style={{ padding: '10px' }}>Batch No.</th>
                  <th style={{ padding: '10px' }}>Cost (Buying)</th>
                  <th style={{ padding: '10px' }}>Retail (Selling)</th>
                  <th style={{ padding: '10px' }}>Qty Left</th>
                  <th style={{ padding: '10px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {productBatches.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)' }}>No batches found.</td></tr>
                ) : (
                  productBatches.map(batch => (
                    <tr key={batch.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{batch.batch_number}</td>
                      
                      {editingBatchId === batch.id ? (
                        <>
                          <td style={{ padding: '10px' }}><input type="number" step="0.01" className="input-field" value={batchEditData.buying_price} onChange={e => setBatchEditData({...batchEditData, buying_price: e.target.value})} style={{ width: '80px', padding: '5px' }} /></td>
                          <td style={{ padding: '10px' }}><input type="number" step="0.01" className="input-field" value={batchEditData.retail_price} onChange={e => setBatchEditData({...batchEditData, retail_price: e.target.value})} style={{ width: '80px', padding: '5px' }} /></td>
                          <td style={{ padding: '10px' }}><input type="number" step="0.01" className="input-field" value={batchEditData.current_quantity} onChange={e => setBatchEditData({...batchEditData, current_quantity: e.target.value})} style={{ width: '60px', padding: '5px' }} /></td>
                          <td style={{ padding: '10px', display: 'flex', gap: '5px' }}>
                            <button onClick={() => handleSaveBatchEdit(batch.id)} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '12px' }}>Save</button>
                            <button onClick={() => setEditingBatchId(null)} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '12px' }}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '10px' }}>Rs. {batch.buying_price}</td>
                          <td style={{ padding: '10px' }}>Rs. {batch.retail_price}</td>
                          <td style={{ padding: '10px' }}>{batch.current_quantity}</td>
                          <td style={{ padding: '10px', display: 'flex', gap: '5px' }}>
                            <button onClick={() => { setEditingBatchId(batch.id); setBatchEditData({ buying_price: batch.buying_price, retail_price: batch.retail_price, current_quantity: batch.current_quantity }); }} className="btn" style={{ padding: '5px 10px', backgroundColor: 'var(--color-warning)', color: 'white', fontSize: '12px' }}><Edit size={12}/> Edit</button>
                            <button onClick={() => handleViewBatchHistory(batch.id)} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '12px' }}><HistoryIcon size={12}/> History</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BATCH AUDIT LOG MODAL */}
      {showBatchHistoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
              <h3 className="text-title">Price / Quantity Audit Log</h3>
              <button onClick={() => setShowBatchHistoryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20}/></button>
            </div>
            
            {batchHistoryLog.length === 0 ? (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>No modifications have been made to this batch.</p>
            ) : (
              batchHistoryLog.map(log => {
                const changes = JSON.parse(log.changes);
                return (
                  <div key={log.id} style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-warning)' }}>
                    <p className="text-subtitle" style={{ margin: '0 0 8px 0', fontSize: '12px' }}>
                      <strong>Admin ID:</strong> {log.edited_by} • {new Date(log.timestamp).toLocaleString()}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-main)' }}>
                      {Object.keys(changes).map(field => (
                        <li key={field}>
                          <strong>{field.replace('_', ' ')}:</strong> <span style={{ textDecoration: 'line-through', color: 'var(--color-danger)' }}>{changes[field].old}</span> ➔ <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{changes[field].new}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* INTERACTIVE IMAGE CROP MODAL */}
      {cropModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div className="card" style={{ width: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 className="text-title" style={{ marginBottom: '20px' }}>Frame Your Image</h3>
            <div style={{ width: '100%', maxHeight: '50vh', overflowY: 'auto', marginBottom: '20px', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={1} circularCrop={false}>
                <img ref={imgRef} src={imgSrc} alt="Crop preview" style={{ maxWidth: '100%' }} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', gap: '15px', width: '100%', justifyContent: 'flex-end' }}>
              <button onClick={() => { setCropModalOpen(false); setImgSrc(''); }} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSaveCrop} className="btn btn-primary">Crop & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminInventory;