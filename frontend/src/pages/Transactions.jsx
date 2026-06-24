// frontend/src/pages/Transactions.jsx
// Transactions page — real-time feed from Socket.io + Stripe simulator
// Manual create form REMOVED
import { useState, useEffect, useCallback } from 'react';
import { transactionAPI, simulateAPI, realtimeAPI } from '../api/axios';
import useSocket from '../hooks/useSocket';
import AdvancedFilter from '../components/Filters/AdvancedFilter';
import TransactionModal from '../components/Modals/TransactionModal';
import LoadingSkeleton from '../components/LoadingSkeleton';
import '../styles/Transactions.css';

// ── Risk helpers ──────────────────────────────────────────
const RISK = {
  HIGH:   { cls: 'risk-badge risk-high',   icon: '🔴' },
  MEDIUM: { cls: 'risk-badge risk-medium', icon: '🟡' },
  LOW:    { cls: 'risk-badge risk-low',    icon: '🟢' },
  _:      { cls: 'risk-badge',            icon: '⚪' }
};
const riskCfg = (l) => RISK[l] || RISK._;

export default function Transactions() {
  const { connected, liveEvents } = useSocket();

  const [transactions, setTransactions]         = useState([]);
  const [filteredTransactions, setFiltered]     = useState([]);
  const [loading,   setLoading]                 = useState(true);
  const [stats,     setStats]                   = useState(null);
  const [selectedTx, setSelectedTx]             = useState(null);
  const [currentFilters, setCurrentFilters]     = useState({});
  const [sortBy,    setSortBy]                  = useState('-createdAt');
  const [pageSize,  setPageSize]                = useState(50);
  const [simulating, setSimulating]             = useState(false);
  const [simMsg,    setSimMsg]                  = useState('');
  const [newRowIds, setNewRowIds]               = useState(new Set());
  const [successMsg, setSuccessMsg]             = useState('');
  const [error,     setError]                   = useState('');
  const [search,    setSearch]                  = useState('');

  // ── Fetch data ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [txRes, statsRes] = await Promise.allSettled([
        transactionAPI.getAll({ limit: pageSize, sortBy, ...currentFilters }),
        transactionAPI.getStats()
      ]);
      const data = txRes.status === 'fulfilled' ? (txRes.value.data.data || []) : [];
      setTransactions(data);
      setFiltered(data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.stats);
    } catch (e) { setError('Failed to load transactions'); }
    finally { setLoading(false); }
  }, [pageSize, sortBy, currentFilters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Merge live Socket.io transactions ──────────────────
  useEffect(() => {
    const newTxEvents = liveEvents.filter(e => e.type === 'transaction' && e.raw);
    if (newTxEvents.length === 0) return;

    const newTxs = newTxEvents.map(e => e.raw);
    const ids    = new Set(newTxs.map(t => t.id || t._id));
    setNewRowIds(ids);
    setTimeout(() => setNewRowIds(new Set()), 3000);

    setTransactions(prev => {
      const existing = new Set(prev.map(t => t.id || t._id));
      const toAdd = newTxs.filter(t => !existing.has(t.id || t._id));
      return [...toAdd, ...prev];
    });
  }, [liveEvents.length]);

  // Apply search + filters to transactions list
  useEffect(() => {
    let data = [...transactions];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(tx =>
        tx.merchantName?.toLowerCase().includes(q) ||
        tx.location?.toLowerCase().includes(q) ||
        tx.merchantCategory?.toLowerCase().includes(q) ||
        String(tx.riskScore).includes(q)
      );
    }
    if (currentFilters.riskLevel)        data = data.filter(t => t.riskLevel === currentFilters.riskLevel);
    if (currentFilters.merchantCategory) data = data.filter(t => t.merchantCategory === currentFilters.merchantCategory);
    if (currentFilters.amountMin)        data = data.filter(t => t.amount >= Number(currentFilters.amountMin));
    if (currentFilters.amountMax)        data = data.filter(t => t.amount <= Number(currentFilters.amountMax));
    setFiltered(data);
  }, [transactions, search, currentFilters]);

  // ── Simulate ────────────────────────────────────────────
  const handleSimulate = async (forceSuspicious = false) => {
    setSimulating(true);
    setSimMsg('');
    try {
      const res = await simulateAPI.transaction({ forceSuspicious });
      const tx  = res.data.transaction;
      setSimMsg(`✅ ${tx.merchantName} ₹${tx.amount.toLocaleString()} [${tx.riskLevel}]`);
      setTimeout(() => setSimMsg(''), 4000);
      // Refresh stats
      const s = await transactionAPI.getStats();
      setStats(s.data.stats);
    } catch { setSimMsg('❌ Simulation failed'); setTimeout(() => setSimMsg(''), 2000); }
    finally { setSimulating(false); }
  };

  const handleBatch = async (count = 5) => {
    setSimulating(true);
    setSimMsg(`⏳ Simulating ${count} transactions...`);
    try {
      await simulateAPI.batch(count);
      setSimMsg(`✅ ${count} transactions simulated via Stripe`);
      setTimeout(() => setSimMsg(''), 4000);
      const s = await transactionAPI.getStats();
      setStats(s.data.stats);
    } catch { setSimMsg('❌ Batch simulation failed'); setTimeout(() => setSimMsg(''), 2000); }
    finally { setSimulating(false); }
  };

  // ── Resolve ─────────────────────────────────────────────
  const handleResolve = async (txId, resolution) => {
    try {
      await transactionAPI.review(txId, { resolution, notes: `Reviewed as ${resolution}` });
      setSuccessMsg('✅ Transaction resolved');
      setSelectedTx(null);
      setTimeout(() => setSuccessMsg(''), 2000);
      fetchAll();
    } catch (e) { throw e; }
  };

  return (
    <div className="transactions-page">

      {/* ── Header ── */}
      <div className="transactions-header">
        <div>
          <h1>💳 Transaction Monitor</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Live feed via Stripe Test API + Socket.io real-time engine
          </p>
        </div>
        <div className={`socket-pill-small ${connected ? 'on' : 'off'}`}>
          <span className="socket-dot" />
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* ── Messages ── */}
      {error      && <div className="error-message">{error}</div>}
      {successMsg && <div className="success-message">{successMsg}</div>}

      {/* ── Stripe Simulator Panel ── */}
      <div className="stripe-simulator-panel">
        <div className="stripe-panel-left">
          <div className="stripe-panel-title">
            <span className="stripe-logo">💳</span>
            <div>
              <strong>Stripe Test API Simulator</strong>
              <small>Generates realistic test transactions through the fraud engine</small>
            </div>
          </div>
          {simMsg && <div className="sim-result-msg">{simMsg}</div>}
        </div>
        <div className="stripe-panel-actions">
          <button
            className="stripe-btn stripe-normal"
            onClick={() => handleSimulate(false)}
            disabled={simulating}
          >
            {simulating ? '⏳' : '💳'} Normal Txn
          </button>
          <button
            className="stripe-btn stripe-suspicious"
            onClick={() => handleSimulate(true)}
            disabled={simulating}
          >
            🔴 Force Fraud
          </button>
          <div className="batch-group">
            <span className="batch-label">Batch:</span>
            {[5, 10, 20].map(n => (
              <button
                key={n}
                className="stripe-btn stripe-batch"
                onClick={() => handleBatch(n)}
                disabled={simulating}
              >×{n}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Transactions</div>
            <div className="stat-value">{stats.totalTransactions?.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Volume</div>
            <div className="stat-value">₹{stats.totalAmount?.toLocaleString()}</div>
          </div>
          <div className="stat-card fraud-card">
            <div className="stat-label">Fraud Detected</div>
            <div className="stat-value">{stats.fraudCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Risk Score</div>
            <div className="stat-value">{stats.averageRiskScore?.toFixed(1)}/100</div>
          </div>
        </div>
      )}

      {/* ── Filter & Sort ── */}
      <div className="filter-sort-section">
        <div className="search-wrap">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search merchant, location, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="tx-search-input"
          />
        </div>
        <AdvancedFilter
          onFilter={f => setCurrentFilters(f)}
          onReset={() => setCurrentFilters({})}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select">
          <option value="-createdAt">Newest First</option>
          <option value="createdAt">Oldest First</option>
          <option value="-amount">Highest Amount</option>
          <option value="amount">Lowest Amount</option>
          <option value="-riskScore">Highest Risk</option>
          <option value="riskScore">Lowest Risk</option>
        </select>
      </div>

      {/* ── Transaction Table ── */}
      <div className="transactions-container">
        <div className="tx-table-header">
          <h2>Transaction History
            <span className="tx-count-badge">{filteredTransactions.length}</span>
          </h2>
          {liveEvents.filter(e => e.type === 'transaction').length > 0 && (
            <div className="live-update-pill">
              🔴 {liveEvents.filter(e => e.type === 'transaction').length} live events this session
            </div>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton type="table" count={8} />
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💳</div>
            <p>No transactions found.</p>
            <button className="sim-start-btn" onClick={() => handleSimulate(false)}>
              Simulate your first Stripe transaction →
            </button>
          </div>
        ) : (
          <div className="tx-table-wrap">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Location</th>
                  <th>Device</th>
                  <th>Score</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx, i) => {
                  const id      = tx.id || tx._id || i;
                  const isNew   = newRowIds.has(id);
                  const cfg     = riskCfg(tx.riskLevel);
                  return (
                    <tr
                      key={id}
                      className={`${tx.isFraudulent ? 'fraud-row' : ''} ${isNew ? 'new-row-flash' : ''} ${tx.isWebhook ? 'webhook-row' : ''}`}
                      onClick={() => setSelectedTx(tx)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className={cfg.cls}>
                          {cfg.icon} {tx.riskLevel}
                        </span>
                      </td>
                      <td>
                        <strong>{tx.merchantName}</strong>
                        <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {tx.merchantCategory}
                        </small>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {tx.currency === 'INR' ? '₹' : tx.currency + ' '}
                        {tx.amount?.toLocaleString()}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        📍 {tx.location}
                        {tx.ipAddress && (
                          <small style={{ display: 'block', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                            🌐 {tx.ipAddress}
                          </small>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tx.device}</td>
                      <td>
                        <strong style={{ color: tx.riskScore >= 70 ? '#f87171' : tx.riskScore >= 40 ? '#fbbf24' : '#34d399' }}>
                          {tx.riskScore}/100
                        </strong>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(tx.time || tx.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {tx.isWebhook ? (
                          <span className="source-badge webhook">🪝 Webhook</span>
                        ) : tx.source === 'stripe-simulator' || tx.aiServiceVersion?.includes('simulator') ? (
                          <span className="source-badge stripe">💳 Simulator</span>
                        ) : (
                          <span className="source-badge manual">✍️ Manual</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="view-btn"
                          onClick={e => { e.stopPropagation(); setSelectedTx(tx); }}
                        >View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {selectedTx && (
        <TransactionModal
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}