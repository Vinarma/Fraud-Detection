// frontend/src/components/Modals/AlertDetailModal.jsx
// Full attack detail modal with resolution workflow
import { useState } from 'react';
import { insiderAPI } from '../../api/axios';
import './AlertDetailModal.css';

// ── Severity config ──────────────────────────────────────
const SEV = {
  CRITICAL: { color: '#fca5a5', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.35)', glow: 'rgba(220,38,38,0.2)', icon: '🚨' },
  HIGH:     { color: '#f87171', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.3)',  glow: 'rgba(239,68,68,0.15)', icon: '🔴' },
  MEDIUM:   { color: '#fcd34d', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.3)', glow: 'rgba(251,191,36,0.1)', icon: '🟡' },
  LOW:      { color: '#fde68a', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.25)', glow: 'rgba(234,179,8,0.08)', icon: '🟠' }
};

const ACTIVITY_CONFIG = {
  multiple_failed_logins:  { icon: '🔐', label: 'Multiple Failed Logins',  threat: 'Brute Force / Credential Stuffing', playbook: ['Lock account after 5 more attempts', 'Notify account owner via email', 'Check source IP geolocation', 'Enable 2FA if not active'] },
  unusual_location:        { icon: '📍', label: 'Unusual Location Access',  threat: 'Account Compromise / Geo-Anomaly',    playbook: ['Verify user identity via secondary channel', 'Check if VPN or proxy is involved', 'Compare with historical login locations', 'Consider temporary account lock'] },
  unusual_time:            { icon: '🕐', label: 'Off-Hours Activity',        threat: 'Insider Threat / Automated Attack',   playbook: ['Review transaction history in this timeframe', 'Cross-check with employee schedule', 'Alert security team', 'Monitor for further activity'] },
  rapid_transactions:      { icon: '⚡', label: 'Rapid Transaction Burst',   threat: 'Velocity Attack / Card Testing',      playbook: ['Immediately rate-limit this account', 'Flag all transactions from this session', 'Notify fraud team', 'Temporarily suspend card if applicable'] },
  high_amount_transaction: { icon: '💰', label: 'High Amount Transaction',   threat: 'Large Fraud / Wire Fraud',            playbook: ['Hold transaction pending manual review', 'Contact account holder via phone', 'Verify beneficiary details', 'Check transaction against spending baseline'] },
  new_device:              { icon: '📱', label: 'New Device Detected',       threat: 'Device Hijack / Account Takeover',    playbook: ['Send device verification to registered email/phone', 'Check device fingerprint and OS', 'Review recent login activity', 'Require additional authentication'] },
  device_mismatch:         { icon: '⚠️', label: 'Device Mismatch',           threat: 'Session Hijacking / MITM',            playbook: ['Invalidate all active sessions', 'Force re-authentication', 'Review SSL certificate status', 'Check for proxy interception'] },
  pattern_deviation:       { icon: '📊', label: 'Behavioral Pattern Deviation', threat: 'Anomalous Activity / Bot',         playbook: ['Compare to 30-day behavioral baseline', 'Check if user is on holiday / travel', 'Review linked accounts', 'Run enhanced fraud scoring'] },
  suspicious_merchant:     { icon: '🏪', label: 'Suspicious Merchant',       threat: 'Merchant Fraud / MCC Fraud',          playbook: ['Verify merchant registration', 'Check merchant blacklist databases', 'Review past transactions with this merchant', 'Flag merchant for review'] },
  account_takeover_risk:   { icon: '🚨', label: 'Account Takeover Risk',     threat: 'ATO / Identity Theft',               playbook: ['IMMEDIATELY lock account', 'Reset all credentials', 'Notify account holder and escalate', 'File incident report'] }
};

const RESOLUTIONS = [
  { value: 'false_positive',   label: '✅ False Positive',    desc: 'Mark as legitimate — no threat',      color: '#34d399' },
  { value: 'confirmed',        label: '🚨 Confirmed Threat',  desc: 'Verified as a real security incident', color: '#f87171' },
  { value: 'investigating',    label: '🔍 Under Investigation', desc: 'Continue monitoring this alert',     color: '#fbbf24' },
  { value: 'escalated_to_security', label: '📤 Escalate',    desc: 'Escalate to security team',           color: '#a78bfa' }
];

const ACTIONS = [
  { value: 'none',                    label: '— No Action' },
  { value: 'warning_sent',            label: '📧 Warning Sent to User' },
  { value: 'account_locked',          label: '🔒 Account Locked' },
  { value: 'additional_verification', label: '📱 Additional Verification Requested' },
  { value: 'escalated_to_security',   label: '📤 Escalated to Security Team' },
  { value: 'reported_to_authorities', label: '🚔 Reported to Authorities' }
];

export default function AlertDetailModal({ alert, onClose, onResolved }) {
  const [step, setStep]         = useState('detail'); // 'detail' | 'resolve'
  const [resolution, setRes]    = useState('');
  const [action, setAction]     = useState('none');
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState('');

  if (!alert) return null;

  const sev  = SEV[alert.severity]  || SEV.MEDIUM;
  const cfg  = ACTIVITY_CONFIG[alert.activityType] || {
    icon: '❓', label: alert.activityType?.replace(/_/g, ' ').toUpperCase() || 'Unknown',
    threat: 'Unknown threat pattern', playbook: ['Investigate manually']
  };

  const riskColor = alert.riskScore >= 70 ? '#f87171' : alert.riskScore >= 40 ? '#fbbf24' : '#34d399';

  // ── Risk score ring ──────────────────────────────────────
  const circumference = 2 * Math.PI * 22;
  const dashOffset    = circumference - (alert.riskScore / 100) * circumference;

  // ── Submit resolution ────────────────────────────────────
  const handleSubmit = async () => {
    if (!resolution) { setError('Please select a resolution'); return; }
    setSubmit(true);
    setError('');
    try {
      await insiderAPI.markResolved(alert.id, { status: resolution, actionTaken: action, investigationNotes: notes });
      onResolved?.(alert.id, resolution);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to resolve alert');
      setSubmit(false);
    }
  };

  return (
    <div className="adm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal" style={{ '--sev-color': sev.color, '--sev-bg': sev.bg, '--sev-border': sev.border, '--sev-glow': sev.glow }}>

        {/* ── Top bar ── */}
        <div className="adm-topbar">
          <div className="adm-sev-pill">{sev.icon} {alert.severity}</div>
          <div className="adm-tabs">
            <button className={step === 'detail' ? 'active' : ''} onClick={() => setStep('detail')}>📋 Details</button>
            <button className={step === 'resolve' ? 'active' : ''} onClick={() => setStep('resolve')} disabled={alert.isResolved}>
              {alert.isResolved ? '✅ Resolved' : '🔧 Resolve'}
            </button>
          </div>
          <button className="adm-close" onClick={onClose}>✕</button>
        </div>

        {/* ═══════════ DETAILS TAB ═══════════ */}
        {step === 'detail' && (
          <div className="adm-body">

            {/* Alert header */}
            <div className="adm-header">
              <div className="adm-icon-wrap">{cfg.icon}</div>
              <div className="adm-title-col">
                <h2>{cfg.label}</h2>
                <p>{cfg.threat}</p>
                <div className="adm-meta">
                  <span>🕐 {new Date(alert.detectedAt || alert.createdAt).toLocaleString()}</span>
                  {alert.detectionMethod && <span>🤖 {alert.detectionMethod.replace(/_/g, ' ')}</span>}
                  <span className={`adm-status-badge ${alert.isResolved ? 'resolved' : 'open'}`}>
                    {alert.isResolved ? '✅ Resolved' : '⏳ Open'}
                  </span>
                </div>
              </div>

              {/* Risk score ring */}
              <div className="adm-risk-ring">
                <svg viewBox="0 0 56 56" width="72" height="72">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle
                    cx="28" cy="28" r="22" fill="none"
                    stroke={riskColor} strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 28 28)"
                    style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)' }}
                  />
                </svg>
                <div className="adm-risk-label">
                  <strong style={{ color: riskColor }}>{alert.riskScore}</strong>
                  <small>Risk</small>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="adm-section">
              <div className="adm-section-title">🔍 Attack Description</div>
              <div className="adm-description">{alert.description}</div>
            </div>

            {/* Risk factors */}
            {alert.riskFactors?.length > 0 && (
              <div className="adm-section">
                <div className="adm-section-title">⚡ Risk Factors</div>
                <div className="adm-factors">
                  {alert.riskFactors.map((f, i) => {
                    const text   = typeof f === 'string' ? f : f?.factor || String(f);
                    const weight = typeof f === 'object' ? f?.weight : null;
                    return (
                      <div key={i} className="adm-factor-row">
                        <span className="adm-factor-dot" />
                        <span className="adm-factor-text">{text}</span>
                        {weight != null && <span className="adm-factor-weight">{weight}%</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SOC Playbook */}
            <div className="adm-section">
              <div className="adm-section-title">📖 SOC Response Playbook</div>
              <div className="adm-playbook">
                {cfg.playbook.map((step, i) => (
                  <div key={i} className="adm-playbook-step">
                    <div className="adm-step-num">{i + 1}</div>
                    <div className="adm-step-text">{step}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert metadata */}
            <div className="adm-section">
              <div className="adm-section-title">🗂 Alert Metadata</div>
              <div className="adm-meta-grid">
                <div className="adm-meta-item"><span>Alert ID</span><code>{alert.id || alert._id}</code></div>
                <div className="adm-meta-item"><span>Severity</span><code>{alert.severity}</code></div>
                <div className="adm-meta-item"><span>Risk Score</span><code>{alert.riskScore}/100</code></div>
                <div className="adm-meta-item"><span>Status</span><code>{alert.status || 'new'}</code></div>
                <div className="adm-meta-item"><span>Action Taken</span><code>{alert.actionTaken || 'none'}</code></div>
                {alert.transactionId && <div className="adm-meta-item"><span>Linked Txn</span><code>{alert.transactionId}</code></div>}
                {alert.ipAddress && <div className="adm-meta-item"><span>IP Address</span><code>{alert.ipAddress}</code></div>}
                {alert.location  && <div className="adm-meta-item"><span>Location</span><code>{alert.location}</code></div>}
              </div>
            </div>

            {/* Investigation notes */}
            {alert.investigationNotes && (
              <div className="adm-section">
                <div className="adm-section-title">📝 Investigation Notes</div>
                <div className="adm-notes-view">{alert.investigationNotes}</div>
              </div>
            )}

            {/* CTA */}
            {!alert.isResolved && (
              <div className="adm-cta">
                <button className="adm-btn-resolve" onClick={() => setStep('resolve')}>
                  🔧 Begin Investigation & Resolve →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ RESOLVE TAB ═══════════ */}
        {step === 'resolve' && (
          <div className="adm-body">
            <div className="adm-resolve-header">
              <div className="adm-resolve-icon">{cfg.icon}</div>
              <div>
                <h2>Resolve: {cfg.label}</h2>
                <p>Choose a resolution, action taken, and add investigation notes.</p>
              </div>
            </div>

            {/* Resolution options */}
            <div className="adm-section">
              <div className="adm-section-title">🏁 Resolution</div>
              <div className="adm-resolution-grid">
                {RESOLUTIONS.map(r => (
                  <button
                    key={r.value}
                    className={`adm-res-btn ${resolution === r.value ? 'selected' : ''}`}
                    style={{ '--res-color': r.color }}
                    onClick={() => setRes(r.value)}
                  >
                    <strong>{r.label}</strong>
                    <small>{r.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Action taken */}
            <div className="adm-section">
              <div className="adm-section-title">⚙️ Action Taken</div>
              <div className="adm-action-select-wrap">
                <select
                  value={action}
                  onChange={e => setAction(e.target.value)}
                  className="adm-action-select"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="adm-section">
              <div className="adm-section-title">📝 Investigation Notes <span>(optional)</span></div>
              <textarea
                className="adm-notes-input"
                placeholder="Describe what was found, what actions were taken, and any relevant context..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
              />
            </div>

            {error && <div className="adm-error">{error}</div>}

            <div className="adm-resolve-actions">
              <button className="adm-btn-cancel" onClick={() => setStep('detail')}>← Back to Details</button>
              <button
                className="adm-btn-submit"
                onClick={handleSubmit}
                disabled={submitting || !resolution}
              >
                {submitting ? '⏳ Submitting...' : '✅ Mark as Resolved'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
