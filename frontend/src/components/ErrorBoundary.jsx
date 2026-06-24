// frontend/src/components/ErrorBoundary.jsx
import { Component } from 'react';
import '../styles/ErrorBoundary.css';
 
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
 
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
 
  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }
 
  resetError = () => {
    this.setState({ hasError: false, error: null });
  };
 
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h2>Oops! Something went wrong</h2>
            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="error-actions">
              <button className="error-btn primary" onClick={this.resetError}>
                Try Again
              </button>
              <button 
                className="error-btn secondary"
                onClick={() => window.location.href = '/dashboard'}
              >
                Go to Dashboard
              </button>
            </div>
            <details className="error-details">
              <summary>Error Details</summary>
              <pre>{this.state.error?.stack}</pre>
            </details>
          </div>
        </div>
      );
    }
 
    return this.props.children;
  }
}