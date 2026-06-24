// frontend/src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionAPI, realtimeAPI, simulateAPI } from '../api/axios';
import useSocket from '../hooks/useSocket';
import TrendChart from '../components/Charts/TrendChart';
import RiskChart from '../components/Charts/RiskChart';
import FraudChart from '../components/Charts/FraudChart';
import LiveFeedPanel from '../components/LiveFeed/LiveFeedPanel';
import ThreatCard from '../components/LiveFeed/ThreatCard';
import RiskHeatmap from '../components/LiveFeed/RiskHeatmap';
import LoadingSkeleton from '../components/LoadingSkeleton';
import '../styles/Dashboard.css';

// ── Animated counter ─────────────────────────────────────
function AnimCounter({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (target === display) return;
    const step = Math.ceil(Math.abs(target - display) / 20);
    const id = setInterval(() => {
      setDisplay(prev => {
        const next = prev < target ? Math.min(prev + step, target) : Math.max(prev - step, target);
        if (next === target) clearInterval(id);
        return next;
      });
    }, 30);
    return () => clearInterval(id);
  }, [value]);
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

// ── Threat level badge ───────────────────────────────────
function ThreatBadge({ level }) {
  const cfg = {
    CRITICAL: { color: '#fca5a5', bg: 'rgba(220,38,38,0.15)', label: '🚨 CRITICAL' },
    HIGH:     { color: '#f87171', bg: 'rgba(239,68,68,0.12)',  label: '🔴 HIGH'     },
    MEDIUM:   { color: '#fcd34d', bg: 'rgba(251,191,36,0.12)', label: '🟡 MEDIUM'   },
    LOW:      { color: '#34d399', bg: 'rgba(16,185,129,0.1)',  label: '🟢 LOW'      }
  };
  const c = cfg[level] || cfg.LOW;
  return (
    <span style={{
      fontSize: '10px', fontWeight: 800, letterSpacing: '0.8px',
      background: c.bg, color: c.color, padding: '3px 10px',
      borderRadius: '999px', border: `1px solid ${c.color}33`
    }}>{c.label}</span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { connected, liveEvents, aiThreatQueue, liveStats, clearEvents, clearAiQueue } = useSocket();

  const [stats,   setStats]   = useState(null);
  const [rtStats, setRtStats] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simMsg, setSimMsg]   = useState('');
  const [dismissedThreats, setDismissedThreats] = useState(new Set());
  const user = JSON.parse(localStorage.getItem('fraudtracker_user') || '{}');

  // ── Initial data load ──
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, rtRes, txRes] = await Promise.allSettled([
        transactionAPI.getStats(),
        realtimeAPI.stats(),
        transactionAPI.getAll({ limit: 10 })
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.stats);
      if (rtRes.status   === 'fulfilled') setRtStats(rtRes.value.data.stats);
      if (txRes.status   === 'fulfilled') setRecentTx(txRes.value.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Refresh stats every 60s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const [s, r] = await Promise.all([transactionAPI.getStats(), realtimeAPI.stats()]);
        setStats(s.data.stats);
        setRtStats(r.data.stats);
      } catch { /* no-op */ }
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Simulate a transaction ──
  const handleSimulate = async (forceSuspicious = false) => {
    setSimulating(true);
    setSimMsg('');
    try {
      const res = await simulateAPI.transaction({ forceSuspicious });
      const tx  = res.data.transaction;
      setSimMsg(`✅ ${tx.merchantName} — ₹${tx.amount.toLocaleString()} [${tx.riskLevel}]`);
      setTimeout(() => setSimMsg(''), 3000);
      // Refresh stats
      const [s, r] = await Promise.all([transactionAPI.getStats(), realtimeAPI.stats()]);
      setStats(s.data.stats);
      setRtStats(r.data.stats);
    } catch (e) {
      setSimMsg('❌ Simulation failed');
      setTimeout(() => setSimMsg(''), 2000);
    } finally {
      setSimulating(false);
    }
  };

  // ── Simulate insider alert ──
  const handleSimulateAlert = async () => {
    setSimulating(true);
    try {
      await simulateAPI.insiderAlert();
      setSimMsg('⚠️ Insider alert simulated');
      setTimeout(() => setSimMsg(''), 3000);
    } catch { setSimMsg('❌ Failed'); setTimeout(() => setSimMsg(''), 2000); }
    finally { setSimulating(false); }
  };

  // Merge live events into recent transactions
  useEffect(() => {
    const newTxEvents = liveEvents.filter(e => e.type === 'transaction' && e.raw);
    if (newTxEvents.length === 0) return;
    setRecentTx(prev => [...newTxEvents.map(e => e.raw), ...prev].slice(0, 10));
  }, [liveEvents.length]);

  // Visible AI threats
  const visibleThreats = aiThreatQueue.filter(t => !dismissedThreats.has(t.id)).slice(0, 3);

  const getRiskColor = (r) => r === 'HIGH' ? '#f87171' : r === 'MEDIUM' ? '#fbbf24' : '#34d399';
  const getRiskClass = (r) => r === 'HIGH' ? 'risk-badge-high' : r === 'MEDIUM' ? 'risk-badge-medium' : 'risk-badge-low';

  // SOC threat level derived from rtStats
  const threatLevel = rtStats?.threatLevel || 'LOW';
  const fraudCount1h = liveStats.fraudThisHour;

  return (
    <div className="dashboard-page">

      {/* ── SOC Header ── */}
      <div className="dashboard-header soc-header">
        <div className="soc-header-left">
          <div className="soc-title-row">
            <h1>Security Operations Center</h1>
            <ThreatBadge level={threatLevel} />
          </div>
          <p>Welcome, <strong>{user.fullName || 'Analyst'}</strong> — Real-time fraud intelligence platform</p>
        </div>

        {/* Simulate controls */}
        <div className="soc-controls">
          {simMsg && <div className="sim-msg">{simMsg}</div>}
          <button
            className="sim-btn sim-normal"
            onClick={() => handleSimulate(false)}
            disabled={simulating}
          >
            {simulating ? '⏳' : '💳'} Simulate Stripe Txn
          </button>
          <button
            className="sim-btn sim-suspicious"
            onClick={() => handleSimulate(true)}
            disabled={simulating}
          >
            🔴 Force Suspicious
          </button>
          <button
            className="sim-btn sim-alert"
            onClick={handleSimulateAlert}
            disabled={simulating}
          >
            ⚠️ Insider Alert
          </button>
          <button className="sim-btn sim-batch" onClick={() => navigate('/transactions')}>
            📊 Transactions
          </button>
        </div>
      </div>

      {/* ── Socket status bar ── */}
      <div className="socket-status-bar">
        <div className={`socket-pill ${connected ? 'on' : 'off'}`}>
          <span className="socket-dot" />
          {connected ? 'Socket.io Connected' : 'Reconnecting…'}
        </div>
        <div className="socket-stats">
          <span>🔄 Events this session: <strong>{liveEvents.length}</strong></span>
          <span>🚨 Fraud this hour: <strong style={{ color: fraudCount1h > 0 ? '#f87171' : 'inherit' }}>{fraudCount1h}</strong></span>
          <span>📈 High-risk: <strong style={{ color: liveStats.highRiskCount > 0 ? '#fbbf24' : 'inherit' }}>{liveStats.highRiskCount}</strong></span>
        </div>
      </div>

      {loading ? (
        <>
          <LoadingSkeleton type="card" count={4} />
          <LoadingSkeleton type="chart" count={2} />
        </>
      ) : (
        <>
          {/* ── AI Threat Queue ── */}
          {visibleThreats.length > 0 && (
            <div className="threat-queue">
              <div className="threat-queue-label">🤖 Gemini AI Threat Intelligence</div>
              <div className="threat-queue-cards">
                {visibleThreats.map(t => (
                  <ThreatCard
                    key={t.id}
                    threat={t}
                    onDismiss={() => setDismissedThreats(prev => new Set([...prev, t.id]))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Metric Cards ── */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">💳</div>
              <div className="metric-content">
                <div className="metric-label">Total Transactions</div>
                <div className="metric-value">
                  <AnimCounter value={stats?.totalTransactions || 0} />
                </div>
                <div className="metric-sub">+{rtStats?.last1h || 0} this hour</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">💰</div>
              <div className="metric-content">
                <div className="metric-label">Volume Processed</div>
                <div className="metric-value">
                  <AnimCounter value={Math.floor((stats?.totalAmount || 0) / 1000)} prefix="₹" suffix="K" />
                </div>
                <div className="metric-sub">All time</div>
              </div>
            </div>

            <div className="metric-card fraud">
              <div className="metric-icon">⚠️</div>
              <div className="metric-content">
                <div className="metric-label">Fraud Detected</div>
                <div className="metric-value">
                  <AnimCounter value={stats?.fraudCount || 0} />
                </div>
                {stats?.fraudCount > 0 && (
                  <div className="fraud-rate">
                    {((stats.fraudCount / (stats.totalTransactions || 1)) * 100).toFixed(1)}% rate
                  </div>
                )}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">🚨</div>
              <div className="metric-content">
                <div className="metric-label">Active Alerts</div>
                <div className="metric-value">
                  <AnimCounter value={rtStats?.activeAlerts || 0} />
                </div>
                <div className="metric-sub">Unresolved insider</div>
              </div>
            </div>
          </div>

          {/* ── Main 3-col layout ── */}
          <div className="soc-main-grid">

            {/* Left: Trend chart + heatmap */}
            <div className="soc-left-col">
              <TrendChart liveEvents={liveEvents} />
              <div className="charts-mini-row">
                <RiskChart stats={stats} />
                <FraudChart stats={stats} />
              </div>
              <RiskHeatmap />
            </div>

            {/* Right: Live feed */}
            <div className="soc-right-col">
              <LiveFeedPanel
                events={liveEvents}
                connected={connected}
                onClear={clearEvents}
              />
            </div>
          </div>

          {/* ── Recent Transactions table ── */}
          <div className="activity-section">
            <div className="activity-section-header">
              <div className="activity-title-row">
                <h2>Recent Activity</h2>
                <span className="activity-count">{recentTx.length}</span>
              </div>
              <button className="view-all-btn" onClick={() => navigate('/transactions')}>
                View All Transactions →
              </button>
            </div>

            {recentTx.length === 0 ? (
              <div className="empty">
                <p>No transactions yet</p>
                <button onClick={() => handleSimulate(false)}>Simulate one now →</button>
              </div>
            ) : (
              <div className="activity-table-wrap">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Merchant</th>
                      <th>Amount</th>
                      <th>Location</th>
                      <th>Device</th>
                      <th>Time</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTx.map((tx, i) => (
                      <tr
                        key={tx.id || tx._id || i}
                        className={`activity-row ${tx.isFraudulent ? 'fraud-row-highlight' : ''}`}
                      >
                        <td>
                          <div className="trust-score" style={{ background: getRiskColor(tx.riskLevel) }}>
                            {tx.riskScore}
                          </div>
                        </td>
                        <td className="td-merchant">
                          <div className="merchant-info">
                            <strong>{tx.merchantName}</strong>
                            <small>{tx.merchantCategory}</small>
                          </div>
                        </td>
                        <td className="td-amount">₹{tx.amount?.toLocaleString()}</td>
                        <td className="td-location">
                          <span className="location-flag">📍</span>
                          {tx.location}
                        </td>
                        <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tx.device}</td>
                        <td className="td-timestamp">
                          {new Date(tx.time || tx.createdAt).toLocaleTimeString()}
                        </td>
                        <td>
                          <span className={`risk-pill ${getRiskClass(tx.riskLevel)}`}>
                            {tx.riskLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Quick Actions ── */}
          <div className="quick-actions">
            <button onClick={() => navigate('/transactions')}>📊 All Transactions</button>
            <button onClick={() => navigate('/transactions')}>⚠️ High-Risk Alerts</button>
            <button onClick={() => navigate('/insider-activity')}>🚨 Insider Activity</button>
          </div>
        </>
      )}
    </div>
  );
}