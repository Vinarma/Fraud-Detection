// frontend/src/pages/InsiderActivity.jsx
import { useState, useEffect, useCallback } from 'react';
import { insiderAPI, simulateAPI } from '../api/axios';
import AlertDetailModal from '../components/Modals/AlertDetailModal';
import '../styles/InsiderActivity.css';

// ── helpers ─────────────────────────────────────────────────
const getSeverityClass = s => ({ CRITICAL:'severity-critical', HIGH:'severity-high', MEDIUM:'severity-medium', LOW:'severity-low' }[s] || 'severity-unknown');
const getSeverityEmoji = s => ({ CRITICAL:'🚨', HIGH:'🔴', MEDIUM:'🟡', LOW:'🟠' }[s] || '⚪');
const getActivityIcon  = t => ({
  multiple_failed_logins:'🔐', unusual_location:'📍', unusual_time:'🕐',
  rapid_transactions:'⚡', high_amount_transaction:'💰', new_device:'📱',
  device_mismatch:'⚠️', pattern_deviation:'📊', suspicious_merchant:'🏪',
  account_takeover_risk:'🚨'
}[t] || '❓');

const timeAgo = ts => {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── component ───────────────────────────────────────────────
export default function InsiderActivity() {
  const [alerts,      setAlerts]      = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState('all');
  const [error,       setError]       = useState('');
  const [selected,    setSelected]    = useState(null);  // alert for modal
  const [simLoading,  setSimLoading]  = useState(false);
  const [simMsg,      setSimMsg]      = useState('');

  // ── fetch ──────────────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (filter === 'unresolved') params.resolved = 'false';
      if (filter === 'critical')   params.severity  = 'CRITICAL';
      const res = await insiderAPI.getAll(params);
      setAlerts(res.data.data || []);
    } catch (err) {
      setError('Failed to load insider alerts.');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = async () => {
    try {
      const res = await insiderAPI.getStats();
      setStats(res.data.stats);
    } catch { setStats(null); }
  };

  useEffect(() => { fetchAlerts(); fetchStats(); }, [fetchAlerts]);

  // ── derived stats ──────────────────────────────────────────
  const derived = {
    totalAlerts:      alerts.length,
    unresolved:       alerts.filter(a => !a.isResolved).length,
    criticalCount:    alerts.filter(a => a.severity === 'CRITICAL').length,
    highCount:        alerts.filter(a => a.severity === 'HIGH').length,
    mediumCount:      alerts.filter(a => a.severity === 'MEDIUM').length,
    lowCount:         alerts.filter(a => a.severity === 'LOW').length,
    averageRiskScore: alerts.length > 0
      ? alerts.reduce((s, a) => s + (a.riskScore || 0), 0) / alerts.length
      : 0
  };
  const displayStats = stats || derived;

  // ── simulate insider alert ─────────────────────────────────
  const handleSimulate = async () => {
    setSimLoading(true); setSimMsg('');
    try {
      await simulateAPI.insiderAlert();
      setSimMsg('🚨 Insider alert simulated!');
      setTimeout(() => setSimMsg(''), 3000);
      fetchAlerts(); fetchStats();
    } catch { setSimMsg('Failed to simulate alert'); }
    finally { setSimLoading(false); }
  };

  // ── modal callbacks ────────────────────────────────────────
  const handleResolved = (alertId, resolution) => {
    setAlerts(prev => prev.map(a => a.id === alertId
      ? { ...a, isResolved: true, status: resolution }
      : a
    ));
    fetchStats();
  };

  // ── render ─────────────────────────────────────────────────
  return (
    <div className="insider-activity-page">

      {/* ── Header ── */}
      <div className="insider-header">
        <div className="insider-header-left">
          <h1>⚠️ Insider Activity Monitoring</h1>
          <p>Track suspicious behaviors and insider threats in real-time</p>
        </div>
        <div className="insider-header-actions">
          {simMsg && <span className="sim-msg">{simMsg}</span>}
          <button className="sim-btn sim-alert" onClick={handleSimulate} disabled={simLoading}>
            {simLoading ? '⏳ Simulating...' : '🧪 Simulate Alert'}
          </button>
          <button className="scan-btn" onClick={fetchAlerts} disabled={loading}>
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* ── Stats ── */}
      <div className="alert-stats-grid">
        {[
          { icon: '📊', label: 'Total Alerts',   val: displayStats.totalAlerts,      cls: '' },
          { icon: '⚠️', label: 'Unresolved',     val: displayStats.unresolved,       cls: 'unresolved' },
          { icon: '🚨', label: 'Critical',        val: displayStats.criticalCount,    cls: 'critical' },
          { icon: '📈', label: 'Avg Risk Score',  val: Math.round(displayStats.averageRiskScore || 0), cls: '' }
        ].map(({ icon, label, val, cls }) => (
          <div key={label} className={`alert-stat-card ${cls}`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-info">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Severity bars ── */}
      <div className="severity-distribution">
        <h2>Alert Breakdown by Severity</h2>
        <div className="severity-bars">
          {[
            { label: '🚨 Critical', key: 'criticalCount', cls: 'critical' },
            { label: '🔴 High',     key: 'highCount',     cls: 'high'     },
            { label: '🟡 Medium',   key: 'mediumCount',   cls: 'medium'   },
            { label: '🟠 Low',      key: 'lowCount',      cls: 'low'      }
          ].map(({ label, key, cls }) => (
            <div className="severity-item" key={key}>
              <span>{label}</span>
              <div className="bar-container">
                <div
                  className={`bar ${cls}`}
                  style={{ width: `${((displayStats[key] || 0) / (displayStats.totalAlerts || 1)) * 100}%` }}
                />
              </div>
              <span className="count">{displayStats[key] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alerts list ── */}
      <div className="alerts-container">
        <div className="alerts-header">
          <h2>
            Activity Alerts
            {alerts.length > 0 && (
              <span className="alert-count-badge">{alerts.length}</span>
            )}
          </h2>
          <div className="filter-buttons">
            {['all', 'unresolved', 'critical'].map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'unresolved' ? `⚠️ Unresolved (${derived.unresolved})` : '🚨 Critical'}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="loading">Scanning for threats...</div>}

        {!loading && alerts.length === 0 && (
          <div className="empty-state">
            <p>✅ No suspicious activities detected</p>
            <small>The system is monitoring all user behavior in real-time.</small>
            <button className="sim-start-btn" style={{ marginTop: 16 }} onClick={handleSimulate}>
              Simulate an Insider Alert
            </button>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="alerts-list">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`alert-item ${getSeverityClass(alert.severity)} ${alert.isResolved ? 'alert-resolved' : ''}`}
                onClick={() => setSelected(alert)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelected(alert)}
                title="Click to view details and resolve"
              >
                {/* Icon */}
                <div className="alert-icon">
                  {getSeverityEmoji(alert.severity)}
                </div>

                {/* Main content */}
                <div className="alert-content">
                  <div className="alert-header">
                    <div className="alert-title">
                      <strong>
                        {getActivityIcon(alert.activityType)}{' '}
                        {(alert.activityType || '').replace(/_/g, ' ').toUpperCase()}
                      </strong>
                      <span className={`severity-badge ${getSeverityClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      {alert.isResolved && <span className="resolved-tag">✅ Resolved</span>}
                    </div>
                    <div className="alert-date">{timeAgo(alert.detectedAt || alert.createdAt)}</div>
                  </div>

                  <p className="alert-description">{alert.description}</p>

                  {/* Risk factors preview */}
                  {alert.riskFactors?.length > 0 && (
                    <div className="risk-factors">
                      <strong>Risk Factors:</strong>
                      <div className="factors-list">
                        {alert.riskFactors.slice(0, 3).map((f, i) => (
                          <span key={i} className="factor">
                            {typeof f === 'string' ? f : f?.factor || String(f)}
                          </span>
                        ))}
                        {alert.riskFactors.length > 3 && (
                          <span className="factor">+{alert.riskFactors.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="alert-footer">
                    <div className="risk-score">
                      Risk Score: <strong>{alert.riskScore}/100</strong>
                    </div>
                    <div className="alert-status">
                      Status: <strong>{alert.isResolved ? '✅ Resolved' : '⏳ ' + (alert.status || 'Open')}</strong>
                    </div>
                    <div className="alert-click-hint">
                      👆 Click for full details & resolution
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="alert-arrow">›</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Monitored Activities Reference ── */}
      <div className="activity-info">
        <h2>Monitored Activities</h2>
        <div className="activities-grid">
          {[
            { icon: '🔐', name: 'Multiple Failed Logins',  desc: 'Unusual number of failed login attempts'       },
            { icon: '📍', name: 'Unusual Location',         desc: 'Transactions from unexpected locations'        },
            { icon: '🕐', name: 'Unusual Time',             desc: 'Activities at unusual hours'                   },
            { icon: '⚡', name: 'Rapid Transactions',       desc: 'Multiple transactions in short time'           },
            { icon: '💰', name: 'High Amount',              desc: 'Transactions much larger than usual'           },
            { icon: '📱', name: 'New Device',               desc: 'Activity from unregistered device'             },
            { icon: '📊', name: 'Pattern Deviation',        desc: 'Behavior differs from historical patterns'     },
            { icon: '🚨', name: 'Account Takeover',         desc: 'Signs of unauthorized access'                  }
          ].map(({ icon, name, desc }) => (
            <div key={name} className="activity-card">
              <div className="activity-icon">{icon}</div>
              <div className="activity-name">{name}</div>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal ── */}
      {selected && (
        <AlertDetailModal
          alert={selected}
          onClose={() => setSelected(null)}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}