import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, BarChart2, ShoppingBag, DollarSign, Loader2, Calendar, RefreshCw } from 'lucide-react';

const STATUS_COLORS = {
  Pending:            '#f59e0b',
  Processing:         '#3b82f6',
  'Out for Delivery': '#a855f7',
  Completed:          '#00a247',
  Delivered:          '#10b981',
  Cancelled:          '#ef4444',
};

function BarChart({ data, maxVal }) {
  if (!data || data.length === 0) return <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '40px 0' }}>No data</p>;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '180px', paddingTop: '10px' }}>
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.revenue / maxVal) * 100 : 0;
        return (
          <div key={i} title={`Rs. ${d.revenue.toLocaleString()} — ${d.orders} orders`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
              height: '100%', justifyContent: 'flex-end', cursor: 'default' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)' }}>
              {d.revenue > 0 ? (d.revenue >= 1000000 ? (d.revenue / 1000000).toFixed(1) + 'M'
                : d.revenue >= 1000 ? (d.revenue / 1000).toFixed(0) + 'k'
                : d.revenue.toFixed(0)) : ''}
            </span>
            <div style={{ width: '100%', backgroundColor: 'var(--color-primary)', borderRadius: '5px 5px 0 0',
              height: `${Math.max(pct, d.revenue > 0 ? 3 : 0)}%`,
              transition: 'height 0.5s ease', opacity: 0.8 + (0.2 * (i / data.length)) }} />
            <span style={{ fontSize: data.length > 18 ? '9px' : '11px', color: 'var(--text-light)',
              whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', textAlign: 'center' }}>
              {d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '40px 0' }}>No order data.</p>;

  const colors = Object.values(STATUS_COLORS);
  let cum = 0;
  const arcs = data.filter(d => d.count > 0).map((d, i) => {
    const angle = (d.count / total) * 360;
    const arc = { status: d.status, count: d.count, pct: ((d.count / total) * 100).toFixed(1), start: cum, angle, color: STATUS_COLORS[d.status] || colors[i % colors.length] };
    cum += angle;
    return arc;
  });

  const describeArc = (cx, cy, r, startAngle, endAngle) => {
    const toRad = a => (a - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {arcs.map((arc, i) => (
          <path key={i} d={describeArc(80, 80, 70, arc.start, arc.start + arc.angle)}
            fill={arc.color} stroke="white" strokeWidth="2" />
        ))}
        <circle cx="80" cy="80" r="32" fill="white" />
        <text x="80" y="76" textAnchor="middle" fontSize="11" fill="var(--text-muted)">Orders</text>
        <text x="80" y="90" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-main)">{total}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {arcs.map(arc => (
          <div key={arc.status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: arc.color, flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{arc.status}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginLeft: 'auto', paddingLeft: '10px' }}>
              {arc.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick presets ──────────────────────────────────────────────────────────────
const today = new Date();
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addMonths = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const PRESETS = [
  { label: 'Last 30 days', from: fmtDate(addMonths(today, -1)), to: fmtDate(today) },
  { label: 'Last 3 months', from: fmtDate(addMonths(today, -3)), to: fmtDate(today) },
  { label: 'Last 6 months', from: fmtDate(addMonths(today, -6)), to: fmtDate(today) },
  { label: 'Last 12 months', from: fmtDate(addMonths(today, -12)), to: fmtDate(today) },
  { label: 'Last 3 years', from: fmtDate(addMonths(today, -36)), to: fmtDate(today) },
];

export default function AdminReports() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(PRESETS[2].from);  // default: 6 months
  const [toDate,   setToDate]   = useState(PRESETS[2].to);
  const [activePreset, setActivePreset] = useState(2);

  const fetchReports = useCallback(async (from, to) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(
        `http://localhost:8000/orders/reports?from_date=${from}&to_date=${to}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(fromDate, toDate); }, []);

  const applyPreset = (idx) => {
    const p = PRESETS[idx];
    setFromDate(p.from);
    setToDate(p.to);
    setActivePreset(idx);
    fetchReports(p.from, p.to);
  };

  const applyCustom = () => {
    setActivePreset(-1);
    fetchReports(fromDate, toDate);
  };

  const maxRevenue = data ? Math.max(...(data.revenue_by_month || []).map(d => d.revenue), 1) : 1;

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <h1 className="text-title" style={{ fontSize: '26px', marginBottom: '4px' }}>Reports & Analytics</h1>
        <p className="text-subtitle" style={{ fontSize: '14px' }}>Business performance overview</p>
      </div>

      {/* ── Date Range Picker ── */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600' }}>
            <Calendar size={15} /> Date Range
          </div>

          {/* Preset chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => applyPreset(i)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  border: '1.5px solid', cursor: 'pointer', transition: 'all 0.13s',
                  borderColor: activePreset === i ? 'var(--color-primary)' : 'var(--border-light)',
                  background:  activePreset === i ? 'var(--color-primary)' : 'white',
                  color:       activePreset === i ? 'white' : 'var(--text-main)',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setActivePreset(-1); }}
              style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setActivePreset(-1); }}
              style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
            <button onClick={applyCustom} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}>
              <RefreshCw size={13} /> Apply
            </button>
          </div>
        </div>
        {data?.date_range && (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing: {data.date_range.from} → {data.date_range.to}
            &nbsp;·&nbsp; <strong>{data.summary?.total_orders?.toLocaleString()}</strong> orders
            &nbsp;·&nbsp; <strong>Rs. {data.summary?.total_revenue?.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong> revenue
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <Loader2 size={36} color="var(--color-primary)" style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '22px' }}>
            <div className="card" style={{ padding: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Revenue (Period)</p>
                <p style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  Rs. {data?.summary?.total_revenue?.toFixed(2) ?? '0.00'}
                </p>
              </div>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#eefcf2',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={22} color="var(--color-primary)" />
              </div>
            </div>
            <div className="card" style={{ padding: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Orders (Period)</p>
                <p style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  {data?.summary?.total_orders?.toLocaleString() ?? 0}
                </p>
              </div>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#eff6ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={22} color="#3b82f6" />
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '22px', marginBottom: '22px' }}>
            <div className="card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <TrendingUp size={16} color="var(--color-primary)" />
                <h3 className="text-title" style={{ fontSize: '15px', margin: 0 }}>Revenue by Month</h3>
              </div>
              <p className="text-subtitle" style={{ fontSize: '13px', marginBottom: '16px' }}>
                {data?.date_range ? `${data.date_range.from} – ${data.date_range.to}` : ''}
              </p>
              <BarChart data={data?.revenue_by_month} maxVal={Math.max(maxRevenue, 1)} />
            </div>
            <div className="card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <BarChart2 size={16} color="var(--color-primary)" />
                <h3 className="text-title" style={{ fontSize: '15px', margin: 0 }}>Orders by Status</h3>
              </div>
              <p className="text-subtitle" style={{ fontSize: '13px', marginBottom: '16px' }}>Distribution in period</p>
              {data?.orders_by_status ? <PieChart data={data.orders_by_status} /> : <p>No data</p>}
            </div>
          </div>

          {/* Top Products */}
          <div className="card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <ShoppingBag size={16} color="var(--color-primary)" />
              <h3 className="text-title" style={{ fontSize: '15px', margin: 0 }}>Top Selling Products</h3>
            </div>
            <p className="text-subtitle" style={{ fontSize: '13px', marginBottom: '16px' }}>By quantity sold in selected period</p>
            {!data?.top_products?.length ? (
              <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px 0' }}>No sales data.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                    {['#', 'Product', 'Qty Sold', 'Revenue'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '11px',
                        fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '13px 12px', fontSize: '13px', color: 'var(--text-light)' }}>#{i + 1}</td>
                      <td style={{ padding: '13px 12px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>{p.name}</td>
                      <td style={{ padding: '13px 12px', fontSize: '14px', color: 'var(--text-main)' }}>{p.qty_sold.toLocaleString()}</td>
                      <td style={{ padding: '13px 12px', fontWeight: '600', color: 'var(--color-primary)', fontSize: '14px' }}>
                        Rs. {p.revenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
