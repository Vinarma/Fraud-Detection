// frontend/src/components/LoadingSkeleton.jsx
import '../styles/Skeleton.css';
 
export default function LoadingSkeleton({ type = 'card', count = 1 }) {
  if (type === 'chart') {
    return (
      <div className="skeleton-container">
        {Array(count).fill(0).map((_, i) => (
          <div key={i} className="skeleton skeleton-chart">
            <div className="skeleton-line skeleton-title"></div>
            <div className="skeleton-box skeleton-chart-box"></div>
          </div>
        ))}
      </div>
    );
  }
 
  if (type === 'card') {
    return (
      <div className="skeleton-container">
        {Array(count).fill(0).map((_, i) => (
          <div key={i} className="skeleton skeleton-card">
            <div className="skeleton-line skeleton-icon"></div>
            <div className="skeleton-line" style={{ width: '80%' }}></div>
            <div className="skeleton-line" style={{ width: '60%' }}></div>
          </div>
        ))}
      </div>
    );
  }
 
  if (type === 'transaction') {
    return (
      <div className="skeleton-container">
        {Array(count).fill(0).map((_, i) => (
          <div key={i} className="skeleton skeleton-transaction">
            <div className="skeleton-line skeleton-icon"></div>
            <div className="skeleton-content">
              <div className="skeleton-line" style={{ width: '60%' }}></div>
              <div className="skeleton-line" style={{ width: '40%' }}></div>
            </div>
            <div className="skeleton-line" style={{ width: '20%' }}></div>
          </div>
        ))}
      </div>
    );
  }
 
  if (type === 'table') {
    return (
      <div className="skeleton-container">
        {Array(count).fill(0).map((_, i) => (
          <div key={i} className="skeleton skeleton-table-row">
            <div className="skeleton-line skeleton-cell"></div>
            <div className="skeleton-line skeleton-cell"></div>
            <div className="skeleton-line skeleton-cell"></div>
            <div className="skeleton-line skeleton-cell"></div>
          </div>
        ))}
      </div>
    );
  }
 
  return null;
}