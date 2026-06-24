// frontend/src/components/Charts/VolumeChart.jsx
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
 
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);
 
export default function VolumeChart({ data = [] }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const chartData = {
    labels: days,
    datasets: [
      {
        label: '📊 Transaction Volume',
        data: data.length > 0 ? data : [45, 52, 48, 61, 55, 38, 42],
        backgroundColor: '#667eea',
        borderColor: '#764ba2',
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: '#764ba2',
        hoverBorderColor: '#667eea'
      }
    ]
  };
 
  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 13, weight: 600 }
        }
      },
      title: {
        display: true,
        text: 'Daily Transaction Volume',
        font: { size: 16, weight: 600 },
        padding: { bottom: 20 }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        padding: 12,
        borderRadius: 8,
        callbacks: {
          label: function (context) {
            return 'Transactions: ' + context.parsed.y;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          font: { size: 12 },
          color: '#666'
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 12 },
          color: '#666'
        }
      }
    }
  };
 
  return (
    <div className="chart-container volume-chart">
      <Bar data={chartData} options={options} />
    </div>
  );
}