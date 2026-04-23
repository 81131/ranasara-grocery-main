import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, RefreshCw, X, FileText, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const STATUS_OPTIONS = ['All', 'Pending', 'Processing', 'Out for Delivery', 'Completed', 'Cancelled'];
const STATUS_BADGE = {
  'Pending':          { bg: '#fff3cd', color: '#856404', border: '#ffeeba' },
  'Processing':       { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
  'Out for Delivery': { bg: '#e2d9f3', color: '#4b2e83', border: '#c5b3e6' },
  'Completed':        { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
  'Cancelled':        { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
};

function AdminOrders() {
  const [orders, setOrders]               = useState([]);
  const [total, setTotal]                 = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [searchTerm, setSearchTerm]       = useState('');
  const [statusFilter, setStatusFilter]   = useState('All');
  const [sortField, setSortField]         = useState('date');
  const [sortOrder, setSortOrder]         = useState('desc');
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 50;

  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const navigate = useNavigate();

  const fetchOrders = useCallback(async (pg = page, sf = statusFilter, sBy = sortField, sDir = sortOrder, q = searchTerm) => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, page_size: PAGE_SIZE, sort_by: sBy, sort_dir: sDir });
      if (sf && sf !== 'All') params.set('status', sf);
      if (q && q.trim()) params.set('search', q.trim());
      const res = await fetch(`http://localhost:8000/orders/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? data);        // backward-compat
        setTotal(data.total ?? (data.orders ?? data).length);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [navigate, page, statusFilter, sortField, sortOrder, searchTerm]);

  useEffect(() => { fetchOrders(page, statusFilter, sortField, sortOrder, searchTerm); }, [page, statusFilter, sortField, sortOrder]);

  // Debounced search: wait 400ms after user stops typing before firing the request
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchOrders(1, statusFilter, sortField, sortOrder, searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const interval = setInterval(() => fetchOrders(page, statusFilter, sortField, sortOrder, searchTerm), 30000);
    return () => clearInterval(interval);
  }, [page, statusFilter, searchTerm]);

  useEffect(() => { if (selectedOrder) fetchAvailableDrivers(); }, [selectedOrder]);

  const fetchAvailableDrivers = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/orders/drivers/available', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAvailableDrivers(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleStatusFilter = (s) => {
    setStatusFilter(s);
    setPage(1);
  };

  const assignDriver = async (orderId, driverId) => {
    if (!driverId) return;
    setAssigning(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8000/orders/${orderId}/assign-driver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ driver_id: parseInt(driverId) }),
      });
      if (res.ok) {
        fetchOrders();
        setSelectedOrder(null);
      } else { console.error('Failed to assign driver.'); }
    } catch (err) { console.error(err); }
    finally { setAssigning(false); }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8000/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setOrders(orders.map(o => o.id === orderId ? { ...o, current_status: newStatus } : o));
        if (selectedOrder?.id === orderId) setSelectedOrder({ ...selectedOrder, current_status: newStatus });
      } else {
        console.error('Failed to update status');
      }
    } catch (e) { console.error(e); }
  };

  const getStatusBadge = (status) => {
    const s = STATUS_BADGE[status] || { bg: '#f8f9fa', color: '#6c757d', border: '#dee2e6' };
    return (
      <span style={{
        backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`,
        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
        whiteSpace: 'nowrap', display: 'inline-block'
      }}>
        {status}
      </span>
    );
  };

  const filteredOrders = orders;  // Filtering is now server-side via the 'search' param

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
          <Package color="var(--color-primary)" /> Order Fulfillment
          <span style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text-muted)', marginLeft: '4px' }}>
            {total.toLocaleString()} orders
          </span>
        </h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
            <input type="text" className="input-field" placeholder="Search ID or name…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px', width: '200px', margin: 0 }} />
          </div>
          <button onClick={() => fetchOrders(page, statusFilter)} className="btn btn-secondary">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Filter & Sort Controls ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Filter size={15} color="var(--text-muted)" style={{ alignSelf: 'center' }} />
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => handleStatusFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500',
                border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                borderColor: statusFilter === s ? 'var(--color-primary)' : 'var(--border-light)',
                background: statusFilter === s ? 'var(--color-primary)' : 'white',
                color: statusFilter === s ? 'white' : 'var(--text-main)',
              }}>
              {s}
            </button>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={sortField} onChange={e => { setSortField(e.target.value); setPage(1); }} className="input-field" style={{ padding: '6px 12px', fontSize: '13px', width: 'auto', margin: 0 }}>
            <option value="date">Sort by Date</option>
            <option value="id">Sort by Order ID</option>
            <option value="amount">Sort by Amount</option>
          </select>
          <select value={sortOrder} onChange={e => { setSortOrder(e.target.value); setPage(1); }} className="input-field" style={{ padding: '6px 12px', fontSize: '13px', width: 'auto', margin: 0 }}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* ── Table — horizontally scrollable on mobile ── */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Loading orders…</p>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '560px' }}>
              <thead style={{ backgroundColor: 'var(--bg-muted)', borderBottom: '2px solid var(--border-light)' }}>
                <tr>
                  {['Order ID', 'Date & Time', 'Customer', 'Total Value', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '13px 15px', color: 'var(--text-muted)', fontSize: '12px',
                      fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px',
                      textAlign: h === 'Action' ? 'center' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>
                    No matching orders found.
                  </td></tr>
                ) : filteredOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border-light)',
                    backgroundColor: order.current_status === 'Pending' ? '#fafff9' : 'white',
                    transition: 'background 0.12s' }}>
                    <td style={{ padding: '13px 15px', fontWeight: '700', color: 'var(--text-main)', fontSize: '14px' }}>
                      #{order.id}
                    </td>
                    <td style={{ padding: '13px 15px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '13px 15px', fontWeight: '500', fontSize: '14px' }}>
                      {order.delivery_info?.customer_name || 'In-Store Customer'}
                    </td>
                    <td style={{ padding: '13px 15px', fontWeight: '700', color: 'var(--color-primary)', fontSize: '14px' }}>
                      Rs. {order.total_amount?.toFixed(2)}
                    </td>
                    <td style={{ padding: '13px 15px' }}>{getStatusBadge(order.current_status)}</td>
                    <td style={{ padding: '13px 15px', textAlign: 'center' }}>
                      <button onClick={() => setSelectedOrder(order)} className="btn btn-primary"
                        style={{ padding: '7px 14px', fontSize: '13px' }}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* ── Pagination ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="btn btn-secondary" style={{ padding: '6px 12px' }}>
                <ChevronLeft size={16} /> Prev
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="btn btn-secondary" style={{ padding: '6px 12px' }}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Order Detail Modal ── */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '820px', maxWidth: '96vw', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              borderBottom: '2px solid var(--border-light)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div>
                <h2 className="text-title" style={{ margin: '0 0 4px' }}>Order #{selectedOrder.id}</h2>
                <p className="text-subtitle" style={{ margin: 0 }}>
                  Placed on {new Date(selectedOrder.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '18px', marginBottom: '18px' }}>
              {/* Delivery Details */}
              <div style={{ flex: 1, background: 'var(--bg-muted)', padding: '14px', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 10px', borderBottom: '1px solid var(--border-light)', paddingBottom: '5px' }}>Delivery Details</h4>
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  <strong>Customer:</strong> {selectedOrder.delivery_info?.customer_name || 'In-Store Customer'}
                </p>
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  <strong>Address:</strong> {selectedOrder.delivery_info?.delivery_address || 'Store Pickup'}
                </p>
                <h4 style={{ margin: '14px 0 10px', borderBottom: '1px solid var(--border-light)', paddingBottom: '5px' }}>Payment</h4>
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  <strong>Method:</strong> {selectedOrder.payment_method?.startsWith('HIST-') ? 'In-Store (Historical)' : selectedOrder.payment_method}
                </p>

                {selectedOrder.payment_slip_url && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Slip:</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                        background: selectedOrder.payment_slip_status === 'approved' ? '#d4edda' :
                          selectedOrder.payment_slip_status === 'rejected' ? '#f8d7da' : '#fff3cd',
                        color: selectedOrder.payment_slip_status === 'approved' ? '#155724' :
                          selectedOrder.payment_slip_status === 'rejected' ? '#721c24' : '#856404',
                      }}>
                        {selectedOrder.payment_slip_status === 'approved' ? '✓ Approved' :
                          selectedOrder.payment_slip_status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                      </span>
                    </div>
                    <a href={`http://localhost:8000/payment-slips/${selectedOrder.payment_slip_url.split('/').pop()}`}
                      target="_blank" rel="noopener noreferrer" className="btn btn-primary"
                      style={{ padding: '5px 10px', textDecoration: 'none', fontSize: '12px', display: 'inline-flex', marginBottom: '6px' }}>
                      <FileText size={13} /> View Slip
                    </a>
                    {selectedOrder.payment_slip_status === 'pending_review' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['approve', 'reject'].map(action => (
                          <button key={action} className="btn"
                            style={{ padding: '4px 10px', fontSize: '12px',
                              background: action === 'approve' ? '#d4edda' : '#f8d7da',
                              color: action === 'approve' ? '#155724' : '#721c24' }}
                            onClick={async () => {
                              const token = localStorage.getItem('token');
                              const res = await fetch(`http://localhost:8000/orders/${selectedOrder.id}/review-slip`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ action }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                const updated = { ...selectedOrder, payment_slip_status: action === 'approve' ? 'approved' : 'rejected', current_status: data.new_status || selectedOrder.current_status };
                                setSelectedOrder(updated);
                                setOrders(orders.map(o => o.id === selectedOrder.id ? updated : o));
                              }
                            }}>
                            {action === 'approve' ? 'Approve' : 'Reject'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status Controls */}
              <div style={{ flex: 1, background: 'var(--bg-muted)', padding: '14px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ margin: '0 0 12px', textAlign: 'center' }}>Update Status</h4>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['Pending', 'Processing', 'Out for Delivery', 'Completed', 'Cancelled'].map(status => (
                    <button key={status} onClick={() => updateOrderStatus(selectedOrder.id, status)}
                      disabled={selectedOrder.current_status === status} className="btn"
                      style={{
                        padding: '7px 12px', fontSize: '12px',
                        background: selectedOrder.current_status === status ? 'var(--color-primary)' : 'white',
                        color: selectedOrder.current_status === status ? 'white' : 'var(--text-main)',
                        border: '1px solid var(--border-light)',
                      }}>
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Driver Assignment */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '14px', borderRadius: '8px', marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 10px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Package size={16} /> Driver Assignment
              </h4>
              {selectedOrder.delivery_info?.driver_name ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0 }}>Assigned: <strong style={{ color: 'var(--color-primary)' }}>{selectedOrder.delivery_info.driver_name}</strong></p>
                  <button onClick={() => setSelectedOrder({ ...selectedOrder, delivery_info: { ...selectedOrder.delivery_info, driver_name: null } })}
                    className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }}>Change</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select id="driver-select" className="input-field" style={{ flex: 1, margin: 0 }}>
                    <option value="">-- Select Driver --</option>
                    {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button disabled={assigning} onClick={() => {
                    const dId = document.getElementById('driver-select').value;
                    if (!dId) { console.warn('No driver selected'); return; }
                    assignDriver(selectedOrder.id, dId);
                  }} className="btn btn-primary">
                    {assigning ? 'Assigning…' : 'Assign Driver'}
                  </button>
                </div>
              )}
              {availableDrivers.length === 0 && !selectedOrder.delivery_info?.driver_name && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#e11d48' }}>
                  ⚠ No available drivers found.
                </p>
              )}
            </div>

            {/* Packing List */}
            <h4 style={{ margin: '0 0 10px' }}>Packing List</h4>
            <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
                  <tr>
                    {['Batch ID', 'Qty', 'Unit Price', 'Subtotal'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.length > 0 ? selectedOrder.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-muted)' }}>
                      <td style={{ padding: '11px 14px', fontWeight: '700', color: 'var(--color-warning)' }}>#{item.batch_id}</td>
                      <td style={{ padding: '11px 14px', fontWeight: '600' }}>{item.quantity}</td>
                      <td style={{ padding: '11px 14px' }}>Rs. {item.price_at_purchase?.toFixed(2)}</td>
                      <td style={{ padding: '11px 14px', fontWeight: '500' }}>Rs. {(item.quantity * item.price_at_purchase).toFixed(2)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="4" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-light)' }}>No items.</td></tr>
                  )}
                </tbody>
                <tfoot style={{ background: 'var(--bg-muted)', borderTop: '2px solid var(--border-light)' }}>
                  <tr>
                    <td colSpan="3" style={{ padding: '14px', textAlign: 'right', fontWeight: '700' }}>Total:</td>
                    <td style={{ padding: '14px', fontWeight: '700', color: 'var(--color-primary)', fontSize: '16px' }}>
                      Rs. {selectedOrder.total_amount?.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminOrders;