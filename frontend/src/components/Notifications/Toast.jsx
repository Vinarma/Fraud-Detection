// frontend/src/components/Notifications/Toast.jsx
import { useState, useEffect } from 'react';
import '../styles/Toast.css';
 
export default function Toast({ message, type = 'info', duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);
 
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, duration);
 
    return () => clearTimeout(timer);
  }, [duration, onClose]);
 
  if (!isVisible) return null;
 
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
 
  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{icons[type]}</span>
      <span className="toast-message">{message}</span>
      <button
        className="toast-close"
        onClick={() => setIsVisible(false)}
      >
        ✕
      </button>
    </div>
  );
}
 
// Toast Container for multiple toasts
export function ToastContainer({ toasts = [], removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast, index) => (
        <Toast
          key={index}
          message={toast.message}
          type={toast.type}
          duration={toast.duration || 3000}
          onClose={() => removeToast(index)}
        />
      ))}
    </div>
  );
}
 
// Hook for using toast notifications
export const useToast = () => {
  const [toasts, setToasts] = useState([]);
 
  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };
 
  const removeToast = (index) => {
    setToasts(prev => prev.filter((_, i) => i !== index));
  };
 
  return { toasts, showToast, removeToast };
};