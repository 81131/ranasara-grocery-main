import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit, RefreshCw, TrendingUp, TrendingDown, ShieldAlert,
  CircleDollarSign, Activity, ChevronDown,
  ChevronUp, BarChart2, Clock, Zap, AlertTriangle, Award, Target, Layers
} from 'lucide-react';

// ── Tiny SVG line chart ──────────────────────────────────────────────────────
function LineChart({ data, keyA, keyB, labelA, labelB, colorA = '#6366f1', colorB = '#10b981', height = 120 }) {
  if (!data || data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Not enough data</div>;

  const valA = data.map(d => d[keyA]);
  const valB = data.map(d => d[keyB]);
  const allVals = [...valA, ...valB];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const w = 500;

  const toY = v => height - 10 - ((v - minV) / range) * (height - 20);
  const toX = i => 10 + (i / (data.length - 1)) * (w - 20);

  const pathFor = vals => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 0.5, 1].map((t, i) => (
          <line key={i} x1="10" x2={w - 10}
            y1={10 + t * (height - 20)} y2={10 + t * (height - 20)}
            stroke="#e5e7eb" strokeWidth="0.5" />
        ))}
        <path d={pathFor(valA)} fill="none" stroke={colorA} strokeWidth="2" strokeLinejoin="round" />
        <path d={pathFor(valB)} fill="none" stroke={colorB} strokeWidth="2" strokeLinejoin="round" strokeDasharray="5,3" />
        {/* Dots */}
        {valA.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill={colorA} />)}
        {valB.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill={colorB} />)}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 2, background: colorA, display: 'inline-block' }} />{labelA}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 2, background: colorB, display: 'inline-block', borderTop: `2px dashed ${colorB}` }} />{labelB}</span>
      </div>
    </div>
  );
}

// ── Tiny SVG bar chart ───────────────────────────────────────────────────────
function BarChart({ data, valueKey, color = '#6366f1', height = 100 }) {
  if (!data || data.length === 0) return null;
  const vals = data.map(d => d[valueKey]);
  const maxV = Math.max(...vals, 1);
  const barW = Math.max(4, Math.floor(480 / data.length) - 4);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 500 ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        {data.map((d, i) => {
          const bH = Math.max(2, (d[valueKey] / maxV) * (height - 16));
          const x = 10 + i * (500 / data.length);
          return (
            <rect key={i} x={x} y={height - bH - 4} width={Math.max(2, barW)} height={bH}
              rx="2" fill={color} opacity="0.85" />
          );
        })}
      </svg>
    </div>
  );
}

// ── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ level }) {
  const map = { High: ['#d1fae5', '#065f46'], Medium: ['#fef9c3', '#854d0e'], Low: ['#fee2e2', '#991b1b'] };
  const [bg, color] = map[level] || map.Medium;
  return (
    <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Zap size={10} /> {level} Confidence
    </span>
  );
}

// ── Expiry risk bar ──────────────────────────────────────────────────────────
function ExpiryRisk({ score }) {
  const color = score > 0.6 ? '#ef4444' : score > 0.3 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{Math.round(score * 100)}%</span>
    </div>
  );
}

// ── Native Analytics Dashboard ───────────────────────────────────────────────
function VisualAnalytics({ insights }) {
  const active = insights.filter(i => i.status === 'Active Forecast');

  // Model accuracy data from embedded constants (reflects last training run)
  const MODEL_ACCURACY = [
    { name: 'RandomForest', mae: 2.24, rmse: 4.12, mape: 34.6, r2: 0.897, winner: true },
    { name: 'LightGBM',    mae: 2.25, rmse: 3.94, mape: 36.5, r2: 0.905, winner: false },
    { name: 'XGBoost',     mae: 2.23, rmse: 3.95, mape: 36.9, r2: 0.905, winner: false },
    { name: 'LinRegress',  mae: 4.53, rmse: 7.43, mape: 121.6, r2: 0.665, winner: false },
  ];
  const maxRmse = Math.max(...MODEL_ACCURACY.map(m => m.rmse));
  const maxMape = Math.max(...MODEL_ACCURACY.map(m => m.mape));

  // Aggregate insight stats
  const totalProfit  = active.reduce((s, i) => s + parseFloat(i.expected_profit  || 0), 0);
  const totalRisk    = active.reduce((s, i) => s + parseFloat(i.theoretical_loss_risk || 0), 0);
  const avgExp       = active.length ? active.reduce((s, i) => s + (i.expiry_risk_score || 0), 0) / active.length : 0;
  const highRiskCnt  = active.filter(i => (i.expiry_risk_score || 0) > 0.6).length;

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border-light)', padding: 24, marginBottom: 32 }}>
      <h2 className="text-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <BarChart2 size={20} /> Visual Analytics
      </h2>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Forecasted Profit (30d)', value: `Rs. ${totalProfit.toFixed(0)}`, icon: TrendingUp, color: '#16a34a', bg: '#eefcf2' },
          { label: 'Worst-Case Risk',  value: totalRisk > 0 ? `-Rs. ${totalRisk.toFixed(0)}` : 'Minimal', icon: TrendingDown, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Active Forecasts', value: active.length, icon: Layers, color: '#6366f1', bg: '#eef2ff' },
          { label: 'High Expiry Risk', value: highRiskCnt, icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={14} color={color} />
              <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Model Comparison Bars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* RMSE */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} color="#6366f1" /> RMSE (lower = better)
          </h4>
          {MODEL_ACCURACY.map(m => (
            <div key={m.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: m.winner ? 700 : 500, color: m.winner ? '#16a34a' : 'var(--text-main)' }}>
                  {m.winner ? '🏆 ' : ''}{m.name}
                </span>
                <span style={{ fontWeight: 600 }}>{m.rmse}</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(m.rmse / maxRmse) * 100}%`,
                  background: m.winner ? '#16a34a' : '#6366f1', borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {/* MAPE */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} color="#f59e0b" /> MAPE % (lower = better)
          </h4>
          {MODEL_ACCURACY.map(m => (
            <div key={m.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: m.winner ? 700 : 500, color: m.winner ? '#16a34a' : 'var(--text-main)' }}>
                  {m.winner ? '🏆 ' : ''}{m.name}
                </span>
                <span style={{ fontWeight: 600 }}>{m.mape}%</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(m.mape / maxMape) * 100}%`,
                  background: m.winner ? '#16a34a' : '#f59e0b', borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── R² Score Row ── */}
      <div>
        <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Award size={13} color="#10b981" /> R² Score (higher = better, max 1.0)
        </h4>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {MODEL_ACCURACY.map(m => (
            <div key={m.name} style={{ flex: 1, minWidth: 120, background: m.winner ? '#eefcf2' : '#f8fafc',
              border: `1.5px solid ${m.winner ? '#16a34a' : 'var(--border-light)'}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: m.winner ? '#16a34a' : 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                {m.winner ? '🏆 ' : ''}{m.name}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.winner ? '#16a34a' : 'var(--text-main)' }}>
                {m.r2}
              </div>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${m.r2 * 100}%`,
                  background: m.winner ? '#16a34a' : '#6366f1', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
function AdminForecasting() {
  const [insights, setInsights]     = useState([]);
  const [lastTrained, setLastTrained] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);

  useEffect(() => { fetchInsights(); }, []);

  const fetchInsights = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/ml/insights', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights || []);
        setLastTrained(data.last_trained);
      }
    } catch (err) {
      console.error('Error fetching ML insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const trainModel = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:8000/ml/train', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) { const data = await res.json(); setLastTrained(data.timestamp); fetchInsights(); }
      else alert('Failed to retrain model.');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleCard = (idx) => setExpandedCard(prev => prev === idx ? null : idx);

  const getRecStyle = (rec) => {
    if (!rec) return {};
    if (rec.includes('BUY AND HOLD')) return { bg: '#eefcf2', color: '#166534' };
    if (rec.includes('CAUTIOUSLY')) return { bg: '#fef3c7', color: '#b45309' };
    if (rec.includes('RISK') || rec.includes('NOT RESTOCK')) return { bg: '#fef2f2', color: '#991b1b' };
    if (rec.includes('CLEARANCE')) return { bg: '#fff7ed', color: '#9a3412' };
    return { bg: '#f1f5f9', color: '#475569' };
  };

  return (
    <div style={{ padding: '0', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .forecast-card { cursor: pointer; transition: box-shadow 0.2s, transform 0.15s; }
        .forecast-card:hover { box-shadow: 0 6px 24px rgba(99,102,241,0.12) !important; transform: translateY(-1px); }
        .chart-panel { animation: slideDown 0.22s ease; }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        .horizon-badge { display: inline-flex; flex-direction: column; align-items: center; padding: 10px 16px; border-radius: 10px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-light, #e5e7eb); min-width: 80px; }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="text-title" style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <BrainCircuit size={28} color="var(--color-primary)" />
            AI Profit Forecasting
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Shelf-life–aware machine learning engine with multi-horizon demand predictions and expiry risk scoring.
          </p>
          {lastTrained && (
            <p style={{ color: 'var(--text-light)', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} /> Last trained: {new Date(lastTrained).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={trainModel}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: 'var(--color-primary)', color: 'white', border: 'none',
            padding: '10px 22px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap'
          }}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          {loading ? 'Training Model...' : 'Refresh ML Model'}
        </button>
      </div>

      {/* ── AI Forecast Cards ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <BrainCircuit size={20} />
          AI Forecast Directives
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>Click a card to view charts</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
          {insights.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'white', borderRadius: 12, border: '1px solid var(--border-light)', gridColumn: '1/-1' }}>
              No insights yet. Click <strong>Refresh ML Model</strong> to generate forecasts.
            </div>
          )}

          {loading && insights.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'white', borderRadius: 12, border: '1px solid var(--border-light)', gridColumn: '1/-1' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: 12, color: 'var(--color-primary)' }} />
              <p>Training model on historical data...</p>
            </div>
          )}

          {insights.map((item, idx) => {
            const recStyle = getRecStyle(item.recommendation);
            const isExpanded = expandedCard === idx;
            const isInsufficient = item.status !== 'Active Forecast';

            if (isInsufficient) {
              return (
                <div key={idx} style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border-light)', padding: 24, opacity: 0.7 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>{item.product_name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                    <ShieldAlert size={14} /> {item.status} — not enough historical data.
                  </div>
                </div>
              );
            }

            return (
              <div key={idx}>
                {/* ── Card Header ── */}
                <div
                  className="forecast-card"
                  onClick={() => toggleCard(idx)}
                  style={{ background: 'white', borderRadius: isExpanded ? '12px 12px 0 0' : 12, border: '1px solid var(--border-light)', borderBottom: isExpanded ? 'none' : undefined, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}
                >
                  {/* Product name + recommendation */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1, paddingRight: 10 }}>{item.product_name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                    </div>
                  </div>

                  <span style={{ background: recStyle.bg, color: recStyle.color, fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 20 }}>
                    {item.recommendation}
                  </span>

                  {/* 30d/90d/180d horizons */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    {[
                      { label: '30 Days', val: item.predicted_demand_30d },
                      { label: '90 Days', val: item.predicted_demand_90d },
                      { label: '180 Days', val: item.predicted_demand_180d },
                    ].map(h => (
                      <div key={h.label} className="horizon-badge">
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.label}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>{h.val ?? '—'}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>units</span>
                      </div>
                    ))}
                  </div>

                  {/* Financials row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><CircleDollarSign size={12} /> Est. Profit (30d)</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#16a34a' }}>+Rs. {item.expected_profit}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}><TrendingDown size={12} /> Worst-Case Risk</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#dc2626' }}>
                        {item.theoretical_loss_risk > 0 ? `-Rs. ${item.theoretical_loss_risk}` : 'Minimal'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Expanded Chart Panel ── */}
                {isExpanded && (
                  <div className="chart-panel" style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid var(--border-light)', borderTop: '1px dashed var(--border-light)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Shelf-life stats row */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Avg Shelf Life</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{item.avg_shelf_life_days}d</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Expiry Risk Score</div>
                        <ExpiryRisk score={item.expiry_risk_score ?? 0} />
                      </div>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Demand Volatility</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>±{item.demand_volatility}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <ConfidenceBadge level={item.confidence ?? 'Medium'} />
                      </div>
                    </div>

                    {/* Price history chart */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TrendingUp size={14} color="var(--color-primary)" /> Buying Price vs Retail Price
                      </h4>
                      <LineChart
                        data={item.history}
                        keyA="buy_price"
                        keyB="retail_price"
                        labelA="Buying Price (Rs.)"
                        labelB="Retail Price (Rs.)"
                        colorA="#6366f1"
                        colorB="#10b981"
                      />
                    </div>

                    {/* Demand chart */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BarChart2 size={14} color="#f59e0b" /> Monthly Demand (units sold)
                      </h4>
                      <BarChart data={item.history} valueKey="demand" color="#6366f1" height={90} />
                      {item.history && item.history.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                          <span>{item.history[0]?.label}</span>
                          <span>{item.history[item.history.length - 1]?.label}</span>
                        </div>
                      )}
                    </div>

                    {/* Optimal pricing row */}
                    <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Calculated Optimal Wholesale</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Rs. {item.optimal_buy_price}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expected Retail</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Rs. {item.expected_retail}</div>
                      </div>
                      {item.outliers_removed > 0 && (
                        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShieldAlert size={12} /> {item.outliers_removed} outlier(s) removed
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AdminForecasting;
