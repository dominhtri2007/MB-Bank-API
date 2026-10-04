/**
 * MBBank Payment Gateway — Secured REST API
 */
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const BankConnector = require('./services/bank-connector');
const SessionKeeper = require('./services/session-keeper');
const logger = require('./utils/logger');
const { createAuthMiddleware } = require('./utils/security');
const createHandlers = require('./routes/api');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Global rate limiting
app.use('/api/', rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS || 60000,
  max: config.RATE_LIMIT_MAX || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down' },
}));

const bankConnector = new BankConnector(config);
const sessionKeeper = new SessionKeeper(bankConnector, config);
const auth = createAuthMiddleware(config);
const handlers = createHandlers(bankConnector, config);

// 1. Health check (no auth needed)
app.get('/api/health', (req, res) => {
  const status = bankConnector.getStatus();
  res.json({
    status: 'ok',
    bank_connected: status.isLoggedIn,
    last_login: status.lastLoginAt,
    account: status.accountNumber,
  });
});

// 2. Transaction history: GET /api/history/:apiKey or GET /api/history (with header)
app.get('/api/history/:apiKey', auth, handlers.history);
app.get('/api/history', auth, handlers.history);

// 3. Check transaction: GET or POST /api/check-transaction/:apiKey (or /api/check/:apiKey)
app.get('/api/check-transaction/:apiKey', auth, handlers.check);
app.post('/api/check-transaction/:apiKey', auth, handlers.check);
app.get('/api/check-transaction', auth, handlers.check);
app.post('/api/check-transaction', auth, handlers.check);
app.get('/api/check/:apiKey', auth, handlers.check);
app.post('/api/check/:apiKey', auth, handlers.check);

// 4. Create payment / VietQR: GET or POST /api/create-payment/:apiKey
app.get('/api/create-payment/:apiKey', auth, handlers.createPayment);
app.post('/api/create-payment/:apiKey', auth, handlers.createPayment);
app.get('/api/create-payment', auth, handlers.createPayment);
app.post('/api/create-payment', auth, handlers.createPayment);

// 5. Account balance
app.get('/api/balance/:apiKey', auth, handlers.balance);
app.get('/api/balance', auth, handlers.balance);

// Error shielding
app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function start() {
  if (!config.API_KEY) logger.warn('⚠️ API_KEY is missing in .env! Requests will be rejected.');
  if (config.MB_USERNAME && config.MB_PASSWORD) {
    try {
      await bankConnector.login();
      sessionKeeper.start();
    } catch (err) {
      logger.error(`MB Bank login error: ${err.message}. Server remains online.`);
    }
  } else {
    logger.warn('⚠️ MB_USERNAME / MB_PASSWORD not set in .env.');
  }

  app.listen(config.PORT, () => {
    logger.info(`🏦 MBBank Payment Gateway running on http://localhost:${config.PORT}`);
    logger.info(`🔑 API Key Protected: ${config.API_KEY ? 'Active' : 'Missing in .env'}`);
  });
}

process.on('SIGINT', () => { sessionKeeper.stop(); process.exit(0); });
process.on('SIGTERM', () => { sessionKeeper.stop(); process.exit(0); });
start().catch((err) => { logger.error(`Fatal: ${err.message}`); process.exit(1); });

