// frontend/src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/axios';
import '../styles/Login.css';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: ''
  });

  // ==========================================
  // HANDLE LOGIN SUBMIT
  // ==========================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login({
        email:      loginForm.email,
        password:   loginForm.password,
        deviceId:   'browser-' + new Date().getTime(),
        deviceName: 'Web Browser'
      });

      localStorage.setItem('fraudtracker_token', response.data.token);
      localStorage.setItem('fraudtracker_user', JSON.stringify(response.data.user));

      setSuccessMessage('✅ Login successful! Redirecting...');
      if (onLogin) onLogin();
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // HANDLE REGISTER SUBMIT
  // ==========================================
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.register({
        fullName:        registerForm.fullName,
        email:           registerForm.email,
        password:        registerForm.password,
        confirmPassword: registerForm.confirmPassword
      });

      localStorage.setItem('fraudtracker_token', response.data.token);
      localStorage.setItem('fraudtracker_user', JSON.stringify(response.data.user));

      setSuccessMessage('✅ Account created! Redirecting...');
      if (onLogin) onLogin();
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegisterForm(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setSuccessMessage('');
  };

  return (
    <div className="login-container">
      {/* Animated background particles */}
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-grid" />
      </div>

      <div className="login-split">
        {/* ── Left: Branding Panel ── */}
        <div className="login-brand-panel">
          <div className="login-brand-content">
            <div className="login-brand-logo">🔐</div>
            <h1 className="login-brand-title">FraudTracker<span>AI</span></h1>
            <p className="login-brand-desc">
              Enterprise-grade fraud detection powered by AI. Monitor, detect, and respond to threats in real-time.
            </p>

            <div className="login-brand-features">
              <div className="login-brand-feature">
                <span className="lbf-icon">⚡</span>
                <div>
                  <strong>Real-time Detection</strong>
                  <p>AI scans every transaction in milliseconds</p>
                </div>
              </div>
              <div className="login-brand-feature">
                <span className="lbf-icon">🛡️</span>
                <div>
                  <strong>Insider Threat Monitoring</strong>
                  <p>Behavioral analytics to detect anomalies</p>
                </div>
              </div>
              <div className="login-brand-feature">
                <span className="lbf-icon">📊</span>
                <div>
                  <strong>Advanced Analytics</strong>
                  <p>Rich dashboards with actionable insights</p>
                </div>
              </div>
            </div>

            <div className="login-brand-stats">
              <div className="lbs-item">
                <strong>99.9%</strong>
                <span>Uptime</span>
              </div>
              <div className="lbs-divider" />
              <div className="lbs-item">
                <strong>&lt;50ms</strong>
                <span>Detection</span>
              </div>
              <div className="lbs-divider" />
              <div className="lbs-item">
                <strong>256-bit</strong>
                <span>Encryption</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Form Panel ── */}
        <div className="login-form-panel">
          <div className="login-card">
            {/* Header */}
            <div className="login-header">
              <div className="login-tabs">
                <button
                  className={`login-tab ${isLogin ? 'active' : ''}`}
                  onClick={() => { setIsLogin(true); setError(''); setSuccessMessage(''); }}
                >
                  Sign In
                </button>
                <button
                  className={`login-tab ${!isLogin ? 'active' : ''}`}
                  onClick={() => { setIsLogin(false); setError(''); setSuccessMessage(''); }}
                >
                  Register
                </button>
              </div>
            </div>

            {/* Messages */}
            {error          && <div className="error-message">⚠️ {error}</div>}
            {successMessage && <div className="success-message">{successMessage}</div>}

            {/* LOGIN FORM */}
            {isLogin ? (
              <form onSubmit={handleLoginSubmit} className="auth-form" id="login-form">
                <div className="form-welcome">
                  <h2>Welcome back</h2>
                  <p>Sign in to your analyst account</p>
                </div>

                <div className="form-group">
                  <label htmlFor="login-email">
                    <span className="input-icon">✉️</span> Email Address
                  </label>
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    placeholder="analyst@company.com"
                    value={loginForm.email}
                    onChange={handleLoginChange}
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="login-password">
                    <span className="input-icon">🔑</span> Password
                  </label>
                  <input
                    type="password"
                    id="login-password"
                    name="password"
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onChange={handleLoginChange}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                <button type="submit" className={`login-btn ${loading ? 'loading-btn' : ''}`} disabled={loading}>
                  {loading ? '' : '🔓 Sign In to Dashboard'}
                </button>

                <div className="demo-info">
                  <div className="demo-badge">🧪 Demo</div>
                  <p>Use any registered email & password to test</p>
                </div>
              </form>
            ) : (
              /* REGISTER FORM */
              <form onSubmit={handleRegisterSubmit} className="auth-form" id="register-form">
                <div className="form-welcome">
                  <h2>Create account</h2>
                  <p>Join the FraudTracker AI platform</p>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-fullName">
                    <span className="input-icon">👤</span> Full Name
                  </label>
                  <input
                    type="text"
                    id="reg-fullName"
                    name="fullName"
                    placeholder="John Doe"
                    value={registerForm.fullName}
                    onChange={handleRegisterChange}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reg-email">
                    <span className="input-icon">✉️</span> Email Address
                  </label>
                  <input
                    type="email"
                    id="reg-email"
                    name="email"
                    placeholder="analyst@company.com"
                    value={registerForm.email}
                    onChange={handleRegisterChange}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-password">
                      <span className="input-icon">🔑</span> Password
                    </label>
                    <input
                      type="password"
                      id="reg-password"
                      name="password"
                      placeholder="Min. 6 characters"
                      value={registerForm.password}
                      onChange={handleRegisterChange}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="reg-confirmPassword">
                      <span className="input-icon">✅</span> Confirm
                    </label>
                    <input
                      type="password"
                      id="reg-confirmPassword"
                      name="confirmPassword"
                      placeholder="Repeat password"
                      value={registerForm.confirmPassword}
                      onChange={handleRegisterChange}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <button type="submit" className={`login-btn ${loading ? 'loading-btn' : ''}`} disabled={loading}>
                  {loading ? '' : '🚀 Create Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}