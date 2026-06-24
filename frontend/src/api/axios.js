// frontend/src/api/axios.js
import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor — attach JWT
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fraudtracker_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fraudtracker_token');
      localStorage.removeItem('fraudtracker_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  register:   (data)  => API.post('/auth/register', data),
  login:      (data)  => API.post('/auth/login', data),
  logout:     ()      => { localStorage.removeItem('fraudtracker_token'); localStorage.removeItem('fraudtracker_user'); },
  getProfile: ()      => API.get('/auth/profile')
};

// ── Transactions ─────────────────────────────────────────
export const transactionAPI = {
  getAll:    (params) => API.get('/transaction', { params }),
  getById:   (id)     => API.get(`/transaction/${id}`),
  create:    (data)   => API.post('/transaction', data),
  update:    (id, d)  => API.put(`/transaction/${id}`, d),
  review:    (id, d)  => API.put(`/transaction/${id}/review`, d),
  delete:    (id)     => API.delete(`/transaction/${id}`),
  getStats:  ()       => API.get('/transaction/stats/overview'),
  getHighRisk:()      => API.get('/transaction/risk/high')
};

// ── Insider Monitoring ───────────────────────────────────
export const insiderAPI = {
  getAll:       (params) => API.get('/insider', { params }),
  getById:      (id)     => API.get(`/insider/${id}`),
  create:       (data)   => API.post('/insider', data),
  markResolved: (id, body = {}) => API.put(`/insider/${id}/resolve`, body),
  getStats:     ()       => API.get('/insider/stats/overview')
};

// ── Stripe Simulator ─────────────────────────────────────
export const simulateAPI = {
  transaction:    (opts)  => API.post('/simulate/transaction', opts),
  batch:          (count) => API.post('/simulate/batch', { count }),
  insiderAlert:   ()      => API.post('/simulate/insider'),
  streamStatus:   ()      => API.get('/simulate/stream-status')
};

// ── Real-time Data ───────────────────────────────────────
export const realtimeAPI = {
  trend:    (hours = 24) => API.get('/realtime/trend', { params: { hours } }),
  stats:    ()           => API.get('/realtime/stats'),
  feed:     (limit = 20) => API.get('/realtime/feed', { params: { limit } }),
  heatmap:  ()           => API.get('/realtime/heatmap')
};

// ── GeoIP Intelligence ───────────────────────────────────
export const geoAPI = {
  lookup: (ip) => API.get(`/geoip/${ip}`)
};

export const healthCheck = () => API.get('/health');

export default API;