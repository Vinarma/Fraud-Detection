// frontend/src/components/Modals/TransactionModal.jsx
// Transaction detail modal with IPInfo geo intelligence card
import { useState, useEffect } from 'react';
import { geoAPI } from '../../api/axios';
import '../../styles/Modal.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const riskColor = (level) =>
  ({ HIGH: '#f87171', MEDIUM: '#fbbf24', LOW: '#34d399' }[level] || '#94a3b8');

const riskBg = (level) =>
  ({ HIGH: 'rgba(239,68,68,0.1)', MEDIUM: 'rgba(251,191,36,0.1)', LOW: 'rgba(16,185,129,0.1)' }[level] || 'rgba(255,255,255,0.04)');

const riskEmoji = (level) =>
  ({ HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' }[level] || '⚪');

const fmtAmount = (n, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// ── IP Intelligence Card ──────────────────────────────────────────────────────
function GeoCard({ ip }) {
  const [geo,     setGeo]    = useState(null);
  const [loading, setLoad]   = useState(true);
  const [error,   setError]  = useState('');

  useEffect(() => {
    if (!ip) { setLoad(false); return; }
    setLoad(true); setError('');
    geoAPI.lookup(ip)
      .then(r => setGeo(r.data))
      .catch(e => setError(e.response?.data?.error || 'Lookup failed'))
      .finally(() => setLoad(false));
  }, [ip]);

  if (!ip) return (
    <div className="geo-empty">
      <span>🌐</span>
      <p>No IP address recorded for this transaction</p>
    </div>
  );

  if (loading) return (
    <div className="geo-loading">
      <div className="geo-spinner" />
      <span>Looking up {ip}…</span>
    </div>
  );

  if (error) return (
    <div className="geo-error">
      <span>⚠️</span>
      <div>
        <strong>Lookup failed for {ip}</strong>
        <p>{error}</p>
      </div>
    </div>
  );

  const threatFlags = [
    geo.isTor     && { label: 'TOR Exit Node',  color: '#f87171', bg: 'rgba(239,68,68,0.12)',    icon: '🧅' },
    geo.isVPN     && { label: 'VPN Detected',    color: '#f87171', bg: 'rgba(239,68,68,0.12)',    icon: '🔒' },
    geo.isProxy   && { label: 'Proxy Detected',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   icon: '🔀' },
    geo.isHosting && { label: 'Hosting IP',      color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  icon: '🖥️' },
    geo.isPrivate && { label: 'Private Network', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',  icon: '🏠' },
  ].filter(Boolean);

  const rlColor = riskColor(geo.riskLevel);
  const rlBg    = riskBg(geo.riskLevel);

  return (
    <div className="geo-card">

      {/* ── Header row ── */}
      <div className="geo-header">
        <div className="geo-ip-pill">
          <span className="geo-ip-icon">🌐</span>
          <code>{geo.ip}</code>
        </div>

        {/* Risk badge */}
        <div
          className="geo-risk-badge"
          style={{ color: rlColor, background: rlBg, border: `1px solid ${rlColor}40` }}
        >
          {riskEmoji(geo.riskLevel)} {geo.riskLevel || 'UNKNOWN'} RISK
          {geo.riskScore > 0 && <span className="geo-risk-score">{geo.riskScore}</span>}
        </div>

        {/* External link */}
        {geo.ipinfoUrl && (
          <a className="geo-external-link" href={geo.ipinfoUrl} target="_blank" rel="noopener noreferrer">
            ↗ IPInfo
          </a>
        )}
      </div>

      {/* ── Threat flags ── */}
      {threatFlags.length > 0 && (
        <div className="geo-threat-flags">
          {threatFlags.map(f => (
            <span key={f.label} className="geo-flag" style={{ color: f.color, background: f.bg, border: `1px solid ${f.color}40` }}>
              {f.icon} {f.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Risk factors ── */}
      {geo.riskFlags?.length > 0 && (
        <div className="geo-risk-factors">
          {geo.riskFlags.map((flag, i) => (
            <div key={i} className="geo-risk-factor-row">
              <span className="geo-factor-dot" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Geo data grid ── */}
      <div className="geo-data-grid">

        <div className="geo-data-item">
          <span className="geo-data-icon">📍</span>
          <div>
            <label>Location</label>
            <strong>{[geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'Unknown'}</strong>
          </div>
        </div>

        <div className="geo-data-item">
          <span className="geo-data-icon">🏢</span>
          <div>
            <label>Organization / ISP</label>
            <strong>{geo.org || '—'}</strong>
          </div>
        </div>

        <div className="geo-data-item">
          <span className="geo-data-icon">🕐</span>
          <div>
            <label>Timezone</label>
            <strong>{geo.timezone || '—'}</strong>
          </div>
        </div>

        <div className="geo-data-item">
          <span className="geo-data-icon">🗺️</span>
          <div>
            <label>Coordinates</label>
            {geo.lat && geo.lon ? (
              <a
                className="geo-map-link"
                href={geo.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)} ↗
              </a>
            ) : (
              <strong>—</strong>
            )}
          </div>
        </div>

      </div>

      {/* ── Privacy summary ── */}
      <div className="geo-privacy-row">
        {[
          { key: 'isVPN',     label: 'VPN',     ok: !geo.isVPN },
          { key: 'isTor',     label: 'TOR',     ok: !geo.isTor },
          { key: 'isProxy',   label: 'Proxy',   ok: !geo.isProxy },
          { key: 'isHosting', label: 'Hosting', ok: !geo.isHosting },
        ].map(({ key, label, ok }) => (
          <div key={key} className={`geo-privacy-chip ${ok ? 'clean' : 'flagged'}`}>
            {ok ? '✅' : '⚠️'} {label}
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function TransactionModal({ transaction, onClose, onResolve }) {
  const [resolving,  setResolving]  = useState(false);
  const [resolution, setResolution] = useState('');
  const [activeTab,  setActiveTab]  = useState('details'); // 'details' | 'geo' | 'ai'

  if (!transaction) return null;

  const rc = riskColor(transaction.riskLevel);

  const handleResolve = async () => {
    if (!resolution) return;
    setResolving(true);
    try {
      await onResolve(transaction.id, resolution);
      onClose();
    } catch { /* handled by parent */ }
    finally { setResolving(false); }
  };

  // Circumference for risk ring
  const C   = 2 * Math.PI * 20;
  const off = C - ((transaction.riskScore || 0) / 100) * C;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />

      <div className="modal-content transaction-modal">

        {/* ── Header ── */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon">💳</span>
            <div>
              <h2>{transaction.merchantName}</h2>
              <p className="modal-header-sub">{transaction.merchantCategory} · {fmtDate(transaction.time)}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Risk banner ── */}
        <div className="risk-banner" style={{ borderColor: rc, background: riskBg(transaction.riskLevel) }}>
          {/* Ring */}
          <div className="risk-ring-wrap">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
              <circle cx="26" cy="26" r="20" fill="none" stroke={rc} strokeWidth="5"
                strokeDasharray={C} strokeDashoffset={off}
                strokeLinecap="round" transform="rotate(-90 26 26)"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div className="risk-ring-label">
              <strong style={{ color: rc }}>{transaction.riskScore ?? '—'}</strong>
              <small>/ 100</small>
            </div>
          </div>

          <div className="risk-details">
            <div className="risk-level-row">
              <span className="risk-level-text" style={{ color: rc }}>
                {riskEmoji(transaction.riskLevel)} {transaction.riskLevel} RISK
              </span>
              <span className="fraud-badge" style={{
                background: transaction.isFraudulent ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)',
                color: transaction.isFraudulent ? '#f87171' : '#34d399',
                border: `1px solid ${transaction.isFraudulent ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.25)'}`
              }}>
                {transaction.isFraudulent ? '🚨 Fraudulent' : '✅ Legitimate'}
              </span>
            </div>
            <p className="risk-reason">{transaction.fraudReason || 'No specific risk factors detected'}</p>
          </div>

          <div className="risk-amount">
            <strong>{fmtAmount(transaction.amount, transaction.currency)}</strong>
            <small>{transaction.status?.toUpperCase()}</small>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="modal-tabs">
          {[
            { id: 'details', label: '📋 Details' },
            { id: 'geo',     label: `🌐 IP Intel${transaction.ipAddress ? ` · ${transaction.ipAddress}` : ''}` },
            { id: 'ai',      label: '🤖 AI Analysis' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`modal-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="modal-body">

          {/* ════ DETAILS TAB ════ */}
          {activeTab === 'details' && (<>

            {/* Transaction info */}
            <div className="modal-section">
              <h3>📋 Transaction</h3>
              <div className="info-grid">
                <div className="info-item full">
                  <label>Transaction ID</label>
                  <code>{transaction.id}</code>
                </div>
                <div className="info-item">
                  <label>Amount</label>
                  <p className="amount">{fmtAmount(transaction.amount, transaction.currency)}</p>
                </div>
                <div className="info-item">
                  <label>Currency</label>
                  <p>{transaction.currency}</p>
                </div>
                <div className="info-item">
                  <label>Date & Time</label>
                  <p>{fmtDate(transaction.time)}</p>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <p className={`status-text status-${transaction.status}`}>{transaction.status}</p>
                </div>
              </div>
            </div>

            {/* Merchant */}
            <div className="modal-section">
              <h3>🏪 Merchant</h3>
              <div className="info-grid">
                <div className="info-item full">
                  <label>Merchant Name</label>
                  <p>{transaction.merchantName}</p>
                </div>
                <div className="info-item">
                  <label>Category</label>
                  <p>{transaction.merchantCategory}</p>
                </div>
                <div className="info-item">
                  <label>Merchant ID</label>
                  <p>{transaction.merchantId || '—'}</p>
                </div>
              </div>
            </div>

            {/* Location & Device */}
            <div className="modal-section">
              <h3>📍 Location & Device</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Location</label>
                  <p>{transaction.location}</p>
                </div>
                <div className="info-item">
                  <label>Device</label>
                  <p>{transaction.device}</p>
                </div>
                <div className="info-item">
                  <label>Device ID</label>
                  <p>{transaction.deviceId || '—'}</p>
                </div>
                <div className="info-item">
                  <label>IP Address</label>
                  <p>
                    {transaction.ipAddress ? (
                      <button
                        className="ip-lookup-btn"
                        onClick={() => setActiveTab('geo')}
                      >
                        🌐 {transaction.ipAddress} <span>→ View Intel</span>
                      </button>
                    ) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Risk factors */}
            {transaction.riskFactors?.length > 0 && (
              <div className="modal-section">
                <h3>⚡ Risk Factors</h3>
                <div className="factors-list">
                  {transaction.riskFactors.map((f, i) => (
                    <span key={i} className="factor-tag">{typeof f === 'string' ? f : f?.factor || String(f)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="modal-section">
              <h3>⏱️ Timeline</h3>
              <div className="timeline">
                <div className="timeline-item">
                  <span className="timeline-dot created" />
                  <div className="timeline-content">
                    <strong>Transaction Created</strong>
                    <p>{fmtDate(transaction.createdAt)}</p>
                  </div>
                </div>
                {transaction.aiProcessedAt && (
                  <div className="timeline-item">
                    <span className="timeline-dot ai" />
                    <div className="timeline-content">
                      <strong>AI Analysis Complete</strong>
                      <p>{fmtDate(transaction.aiProcessedAt)}</p>
                    </div>
                  </div>
                )}
                {transaction.reviewedAt && (
                  <div className="timeline-item">
                    <span className="timeline-dot reviewed" />
                    <div className="timeline-content">
                      <strong>Reviewed</strong>
                      <p>{fmtDate(transaction.reviewedAt)}</p>
                    </div>
                  </div>
                )}
                {transaction.isResolved && (
                  <div className="timeline-item">
                    <span className="timeline-dot resolved" />
                    <div className="timeline-content">
                      <strong>Resolved — {transaction.resolution}</strong>
                      <p>{fmtDate(transaction.updatedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Resolution */}
            {transaction.isFraudulent && !transaction.isResolved && (
              <div className="modal-section resolution-section">
                <h3>✅ Mark Resolution</h3>
                <select
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  className="resolution-select"
                >
                  <option value="">Select resolution…</option>
                  <option value="legitimate">✅ Legitimate Transaction</option>
                  <option value="fraud_confirmed">🚨 Fraud Confirmed</option>
                  <option value="pending">⏳ Pending Review</option>
                </select>
              </div>
            )}

          </>)}

          {/* ════ GEO / IP INTEL TAB ════ */}
          {activeTab === 'geo' && (
            <div className="geo-tab">
              <div className="geo-tab-header">
                <div>
                  <h3>🌐 IP Intelligence Report</h3>
                  <p>Real-time geolocation & threat analysis powered by IPInfo</p>
                </div>
              </div>
              <GeoCard ip={transaction.ipAddress} />
            </div>
          )}

          {/* ════ AI ANALYSIS TAB ════ */}
          {activeTab === 'ai' && (
            <div className="ai-tab">
              <div className="ai-tab-header">
                <h3>🤖 AI Fraud Detection</h3>
              </div>
              <div className="info-grid" style={{ marginBottom: 16 }}>
                <div className="info-item">
                  <label>Risk Score</label>
                  <div className="score-bar-wrap">
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${transaction.riskScore}%`, background: rc }} />
                    </div>
                    <span style={{ color: rc, fontWeight: 700 }}>{transaction.riskScore}/100</span>
                  </div>
                </div>
                <div className="info-item">
                  <label>Fraud Probability</label>
                  <p style={{ color: rc, fontWeight: 700 }}>
                    {((transaction.fraudProbability || 0) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="info-item full">
                  <label>Detection Reason</label>
                  <p>{transaction.fraudReason || 'No specific reason identified'}</p>
                </div>
                <div className="info-item">
                  <label>AI Version</label>
                  <p>{transaction.aiServiceVersion || '—'}</p>
                </div>
                <div className="info-item">
                  <label>Analyzed At</label>
                  <p>{fmtDate(transaction.aiProcessedAt)}</p>
                </div>
              </div>

              {transaction.riskFactors?.length > 0 && (
                <div className="modal-section">
                  <h3>⚡ Risk Factors</h3>
                  <div className="factors-list">
                    {transaction.riskFactors.map((f, i) => (
                      <span key={i} className="factor-tag">{typeof f === 'string' ? f : f?.factor || String(f)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end modal-body */}

        {/* ── Footer ── */}
        <div className="modal-footer">
          {transaction.isFraudulent && !transaction.isResolved ? (
            <>
              <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button
                className="modal-btn primary"
                onClick={handleResolve}
                disabled={resolving || !resolution}
              >
                {resolving ? '⏳ Resolving…' : '✅ Resolve'}
              </button>
            </>
          ) : (
            <button className="modal-btn primary" onClick={onClose}>Close</button>
          )}
        </div>

      </div>
    </>
  );
}