// frontend/src/components/LiveFeed/LiveFeedPanel.jsx
import { useState } from 'react';
import './LiveFeed.css';

const RISK_CONFIG = {
  HIGH:     { color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',    dot: '#ef4444', icon: '🔴' },
  MEDIUM:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',   dot: '#f59e0b', icon: '🟡' },
  LOW:      { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',   dot: '#10b981', icon: '🟢' },
  CRITICAL: { color: '#f87171', bg: 'rgba(220,38,38,0.15)',  border: 'rgba(220,38,38,0.4)',     dot: '#dc2626', icon: '🚨' },
  alert:    { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)',   dot: '#f97316', icon: '⚠️' },
  reviewed: { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)',   dot: '#10b981', icon: '✅' }
};

const timeAgo = (ts) => {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
};

const getRiskConfig = (event) => {
  if (event.type === 'alert')    return RISK_CONFIG[event.severity] || RISK_CONFIG.alert;
  if (event.type === 'reviewed') return RISK_CONFIG.reviewed;
  return RISK_CONFIG[event.riskLevel] || RISK_CONFIG.LOW;
};

// ==========================================
// SINGLE FEED EVENT CARD
// ==========================================
function FeedEvent({ event, index }) {
  const cfg = getRiskConfig(event);

  return (
    <div
      className="feed-event"
      style={{
        '--event-color':  cfg.color,
        '--event-bg':     cfg.bg,
        '--event-border': cfg.border,
        '--event-dot':    cfg.dot,
        animationDelay: `${index * 0.04}s`
      }}
    >
      <div className="feed-event-dot" />
      <div className="feed-event-icon">{cfg.icon}</div>
      <div className="feed-event-body">
        <div className="feed-event-title">{event.title}</div>
        <div className="feed-event-sub">{event.subtitle}</div>
        {event.location && (
          <div className="feed-event-meta">📍 {event.location}</div>
        )}
        {event.stripeData && (
          <div className="feed-event-stripe">
            💳 {event.stripeData.cardBrand?.toUpperCase()} ···{event.stripeData.cardLast4}
            <span className="stripe-badge">Stripe</span>
          </div>
        )}
        {event.analysis?.summary && (
          <div className="feed-event-ai">
            🤖 {event.analysis.summary}
          </div>
        )}
      </div>
      <div className="feed-event-right">
        {event.riskScore !== undefined && (
          <div className="feed-risk-score" style={{ color: cfg.color }}>
            {event.riskScore}
          </div>
        )}
        <div className="feed-event-time">{timeAgo(event.timestamp)}</div>
      </div>
    </div>
  );
}

// ==========================================
// LIVE FEED PANEL
// ==========================================
export default function LiveFeedPanel({ events = [], connected = false, onClear }) {
  const [filter, setFilter] = useState('all');

  const filtered = events.filter(e => {
    if (filter === 'all')    return true;
    if (filter === 'fraud')  return e.isFraud || e.severity === 'CRITICAL';
    if (filter === 'alerts') return e.type === 'alert';
    if (filter === 'high')   return e.riskLevel === 'HIGH' || e.severity === 'HIGH' || e.severity === 'CRITICAL';
    return true;
  });

  return (
    <div className="live-feed-panel">
      {/* Header */}
      <div className="live-feed-header">
        <div className="live-feed-title">
          <span className={`live-indicator ${connected ? 'connected' : 'disconnected'}`}>
            <span className="live-dot" />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span>Event Feed</span>
          {events.length > 0 && (
            <span className="event-count">{events.length}</span>
          )}
        </div>
        <div className="live-feed-actions">
          <div className="feed-filters">
            {['all', 'fraud', 'high', 'alerts'].map(f => (
              <button
                key={f}
                className={`feed-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'fraud' ? '🚨 Fraud' : f === 'high' ? '🔴 High' : '⚠️ Alerts'}
              </button>
            ))}
          </div>
          {events.length > 0 && (
            <button className="feed-clear-btn" onClick={onClear} title="Clear feed">✕</button>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="live-feed-body">
        {filtered.length === 0 ? (
          <div className="feed-empty">
            <div className="feed-empty-icon">{connected ? '📡' : '🔌'}</div>
            <p>{connected ? 'Monitoring for events…' : 'Connecting to live feed…'}</p>
            <small>{connected ? 'New events will appear here instantly' : 'Check backend connection'}</small>
          </div>
        ) : (
          filtered.map((event, idx) => (
            <FeedEvent key={event.id} event={event} index={idx} />
          ))
        )}
      </div>
    </div>
  );
}
