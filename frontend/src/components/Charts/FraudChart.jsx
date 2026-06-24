// frontend/src/components/Charts/FraudChart.jsx
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function FraudChart({ stats = null }) {
  const totalTransactions = stats?.totalTransactions || 100;
  const fraudCount        = stats?.fraudCount || 8;
  const legitimateCount   = totalTransactions - fraudCount;
  const fraudRate         = ((fraudCount / totalTransactions) * 100).toFixed(1);

  const chartData = {
    labels: ['Legitimate', 'Fraudulent'],
    datasets: [
      {
        data: [legitimateCount, fraudCount],
        backgroundColor: ['rgba(16,185,129,0.85)', 'rgba(239,68,68,0.85)'],
        borderColor: ['#059669', '#dc2626'],
        borderWidth: 2,
        hoverOffset: 6
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.4,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyleWidth: 8,
          padding: 12,
          font: { size: 11, weight: '600' },
          color: 'rgba(226,232,240,0.7)'
        }
      },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.92)',
        titleFont: { size: 12, weight: '600' },
        bodyFont:  { size: 11 },
        padding: 10,
        borderRadius: 8,
        borderColor: 'rgba(99,102,241,0.3)',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct   = ((ctx.parsed / total) * 100).toFixed(1);
            return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`;
          }
        }
      }
    }
  };

  return (
    <div className="chart-container fraud-chart">
      <div className="chart-title">🔴 Fraud Rate — {fraudRate}%</div>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}