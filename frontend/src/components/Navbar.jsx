// frontend/src/components/Navbar.jsx
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Navbar.css';

export default function Navbar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user     = JSON.parse(localStorage.getItem('fraudtracker_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('fraudtracker_token');
    localStorage.removeItem('fraudtracker_user');
    // Notify App.jsx so it can update isAuthenticated state immediately
    if (onLogout) onLogout();
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* ── Brand ── */}
        <div className="navbar-brand" onClick={() => navigate('/dashboard')}>
          <div className="navbar-logo-wrap">🔐</div>
          <div className="navbar-title-wrap">
            <span className="navbar-title">FraudTracker AI</span>
            <span className="navbar-subtitle">AI Platform</span>
          </div>
        </div>

        {/* ── Nav Links ── */}
        <div className="navbar-menu">
          <button
            className={`nav-link${isActive('/dashboard') ? ' active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-link${isActive('/transactions') ? ' active' : ''}`}
            onClick={() => navigate('/transactions')}
          >
            💳 Transactions
          </button>
          <button
            className={`nav-link${isActive('/insider-activity') ? ' active' : ''}`}
            onClick={() => navigate('/insider-activity')}
          >
            ⚠️ Insider Activity
          </button>
        </div>

        {/* ── Live pill + User + Logout ── */}
        <div className="navbar-user">
          <div className="navbar-live">
            <span className="live-dot" />
            LIVE
          </div>

          <div className="navbar-divider" />

          <div className="user-info">
            <div className="user-avatar">
              {user.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <div className="user-name">{user.fullName || 'Analyst'}</div>
              <div className="user-email">{user.email || ''}</div>
            </div>
          </div>

          <button className="logout-btn" onClick={handleLogout}>
            🚪 <span>Logout</span>
          </button>
        </div>

      </div>
    </nav>
  );
}