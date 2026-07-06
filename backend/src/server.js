// backend/src/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const connectDB = require('./config/db');

const app = express();
const httpServer = http.createServer(app);

// ==========================================
// SOCKET.IO SETUP
// ==========================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io globally available to routes
global.io = io;

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('join:user', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`👤 Socket ${socket.id} joined room user:${userId}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
  });
});

// ==========================================
// DATABASE CONNECTION
// ==========================================
connectDB();

// ==========================================
// STRIPE WEBHOOK — must be BEFORE express.json()
// Stripe requires the raw request body for signature verification
// ==========================================
app.use('/api/webhooks', require('./routes/webhook'));

// ==========================================
// MIDDLEWARE (JSON parsing — after webhook)
// ==========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ FraudTracker-AI Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: 'Connected',
    socketConnections: io.engine.clientsCount,
    version: '2.0.0',
    features: {
      socketIO: true,
      geminiAI: !!process.env.GEMINI_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      geoIP: !!process.env.IPINFO_TOKEN
    }
  });
});

// ==========================================
// API ROUTES
// ==========================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/insider', require('./routes/insider'));
app.use('/api/simulate', require('./routes/simulate'));
app.use('/api/realtime', require('./routes/realtime'));
app.use('/api/geoip', require('./routes/geoip'));

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({ error: { message: err.message } });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🔒 FRAUDTRACKER-AI v2.0 — SOC PLATFORM    ║
╚══════════════════════════════════════════════╝

🚀  HTTP:     http://${HOST}:${PORT}
🔌  Socket.io: ws://${HOST}:${PORT}
📊  API:      http://${HOST}:${PORT}/api
🤖  Gemini:   ${process.env.GEMINI_API_KEY ? '✅ Configured' : '⚠️  Not configured'}
💳  Stripe:   ${process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '⚠️  Simulator mode'}
🪝  Webhook:  ${process.env.STRIPE_WEBHOOK_SECRET ? '✅ Configured' : '⚠️  Not configured'}
🌍  GeoIP:    ${process.env.IPINFO_TOKEN ? '✅ Configured' : '⚠️  Not configured'}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  io.close();
  httpServer.close(() => process.exit(0));
});

module.exports = { app, io };
