// frontend/src/components/LiveFeed/RiskHeatmap.jsx
import { useState, useEffect } from 'react';
import { realtimeAPI } from '../../api/axios';
import './LiveFeed.css';

export default function RiskHeatmap() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await realtimeAPI.heatmap();
      setData(res.data.heatmap || []);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, []);

  const max = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1;

  return (
    <div className="risk-heatmap">
      <div className="heatmap-title">🌍 Location Risk Heatmap</div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
          Loading location data…
        </div>
      ) : data.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
          No location data yet — run a simulation
        </div>
      ) : (
        <div className="heatmap-rows">
          {data.slice(0, 10).map((row, i) => (
            <div key={i} className="heatmap-row">
              <div className="heatmap-location" title={row.location}>{row.location}</div>
              <div className="heatmap-bar-bg">
                <div
                  className={`heatmap-bar-fill ${row.riskLevel}`}
                  style={{ width: `${Math.max((row.count / max) * 100, 8)}%` }}
                >
                  {row.avgRisk > 0 ? `${row.avgRisk}` : ''}
                </div>
              </div>
              <div className="heatmap-count">{row.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
