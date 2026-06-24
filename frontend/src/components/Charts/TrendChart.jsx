// frontend/src/components/Charts/TrendChart.jsx
// Real-time chart — polls /api/realtime/trend every 30s
import { useEffect, useRef, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { realtimeAPI } from '../../api/axios';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function TrendChart({ liveEvents = [] }) {
  const [trendData, setTrendData] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const chartRef = useRef(null);

  const fetchTrend = useCallback(async () => {
    try {
      const res = await realtimeAPI.trend(12); // last 12 hours
      setTrendData(res.data.data || []);
      setLastUpdate(new Date());
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + poll every 30 seconds
  useEffect(() => {
    fetchTrend();
    const id = setInterval(fetchTrend, 30000);
    return () => clearInterval(id);
  }, [fetchTrend]);

  // When a new live event arrives, bump the latest data point
  useEffect(() => {
    if (liveEvents.length === 0 || trendData.length === 0) return;
    const latest = liveEvents[0];
    if (!latest || latest.type !== 'transaction') return;

    setTrendData(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last    = { ...updated[updated.length - 1] };
      last.total      = (last.total      || 0) + 1;
      last.fraudulent = (last.fraudulent || 0) + (latest.isFraud ? 1 : 0);
      last.highRisk   = (last.highRisk   || 0) + (latest.riskLevel === 'HIGH' ? 1 : 0);
      updated[updated.length - 1] = last;
      return updated;
    });
  }, [liveEvents.length]);  // only trigger on new events

  const labels      = trendData.map(d => d.label);
  const totalData   = trendData.map(d => d.total);
  const fraudData   = trendData.map(d => d.fraudulent);
  const highRiskData = trendData.map(d => d.highRisk);

  const chartData = {
    labels,
    datasets: [
      {
        label:                'All Transactions',
        data:                 totalData,
        borderColor:          '#10b981',
        backgroundColor:      'rgba(16,185,129,0.08)',
        fill:                 true,
        tension:              0.4,
        borderWidth:          2,
        pointRadius:          3,
        pointHoverRadius:     6,
        pointBackgroundColor: '#10b981',
        pointBorderColor:     'transparent'
      },
      {
        label:                'Fraudulent',
        data:                 fraudData,
        borderColor:          '#f87171',
        backgroundColor:      'rgba(248,113,113,0.06)',
        fill:                 true,
        tension:              0.4,
        borderWidth:          2,
        pointRadius:          3,
        pointHoverRadius:     5,
        pointBackgroundColor: '#f87171',
        pointBorderColor:     'transparent'
      },
      {
        label:                'High Risk',
        data:                 highRiskData,
        borderColor:          '#fbbf24',
        backgroundColor:      'transparent',
        fill:                 false,
        tension:              0.4,
        borderWidth:          1.5,
        borderDash:           [4, 3],
        pointRadius:          2,
        pointHoverRadius:     4,
        pointBackgroundColor: '#fbbf24',
        pointBorderColor:     'transparent'
      }
    ]
  };

  const options = {
    responsive:          true,
    maintainAspectRatio: true,
    aspectRatio:         3,
    animation:           { duration: 400 },
    interaction:         { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align:    'end',
        labels: {
          usePointStyle:   true,
          pointStyleWidth: 8,
          padding:         16,
          font:            { size: 11, weight: '600' },
          color:           'rgba(226,232,240,0.7)'
        }
      },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        titleFont:       { size: 12, weight: '700' },
        bodyFont:        { size: 11 },
        padding:         12,
        borderRadius:    8,
        borderColor:     'rgba(99,102,241,0.3)',
        borderWidth:     1,
        callbacks: {
          label: (ctx) => `  ${ctx.dataset.label}: ${ctx.parsed.y}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid:   { color: 'rgba(255,255,255,0.04)' },
        border: { display: false },
        ticks:  { font: { size: 10 }, color: 'rgba(148,163,184,0.6)', maxTicksLimit: 5 }
      },
      x: {
        grid:   { display: false },
        border: { display: false },
        ticks:  { font: { size: 10 }, color: 'rgba(148,163,184,0.6)', maxRotation: 0 }
      }
    }
  };

  return (
    <div className="chart-container trend-chart">
      <div className="chart-title-row">
        <div className="chart-title">📈 Transaction Trends (Last 12h — Live)</div>
        <div className="chart-meta">
          {lastUpdate && (
            <span className="chart-update-time">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          {loading && <span className="chart-loading-pill">Loading…</span>}
        </div>
      </div>
      {trendData.length === 0 && !loading ? (
        <div className="chart-empty">
          No data yet — simulate some transactions to see live trends
        </div>
      ) : (
        <Line ref={chartRef} data={chartData} options={options} />
      )}
    </div>
  );
}