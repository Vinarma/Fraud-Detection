// frontend/src/components/LiveFeed/ThreatCard.jsx
import './LiveFeed.css';

export default function ThreatCard({ threat, onDismiss }) {
  if (!threat) return null;
  const { analysis, transactionId, timestamp } = threat;
  if (!analysis) return null;

  // Handle both old and new schema
  const reason = analysis.suspiciousReason || analysis.summary;
  const explanation = analysis.explanation || (analysis.indicators ? analysis.indicators.join(' | ') : '');
  const rec = analysis.recommendedAction || analysis.recommendation;
  const confidence = analysis.confidenceScore !== undefined ? analysis.confidenceScore : analysis.confidence;

  return (
    <div className="threat-card">
      <div className="threat-card-header">
        <span className={`threat-card-level ${analysis.threatLevel || 'HIGH'}`}>
          {analysis.threatLevel || 'HIGH'}
        </span>
        <span className="threat-card-badge">
          🤖 {analysis.generatedBy?.includes('gemini') ? 'Gemini AI' : 'ML Ensemble'}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px'
            }}
          >✕</button>
        )}
      </div>

      <div className="threat-card-summary"><strong>Reason:</strong> {reason}</div>

      {explanation && (
        <div className="threat-card-indicators" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span className="threat-indicator" style={{ display: 'block', padding: '6px', lineHeight: '1.4' }}>
            🧠 {explanation}
          </span>
        </div>
      )}

      {rec && (
        <div className="threat-card-rec" style={{ marginTop: '8px', fontWeight: 'bold' }}>
          💡 Action: {rec}
        </div>
      )}

      {confidence !== undefined && (
        <div className="threat-card-confidence" style={{ marginTop: '12px' }}>
          <span>ML Confidence</span>
          <div className="confidence-bar">
            <div className="confidence-fill" style={{ width: `${confidence}%` }} />
          </div>
          <span>{confidence}%</span>
        </div>
      )}
    </div>
  );
}
