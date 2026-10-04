/**
 * Configuration — Loads strictly from environment variables (.env)
 */
require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT || '3456', 10),
  NODE_ENV: process.env.NODE_ENV || 'production',

  // Master API Key for accessing endpoints
  API_KEY: (process.env.API_KEY || process.env.ADMIN_SECRET || '').trim(),

  // MB Bank credentials
  MB_USERNAME: (process.env.MB_USERNAME || '').trim(),
  MB_PASSWORD: (process.env.MB_PASSWORD || '').trim(),
  MB_ACCOUNT_NUMBER: (process.env.MB_ACCOUNT_NUMBER || '').trim(),

  // Security & Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '60', 10), // max requests/minute
  ALLOWED_IPS: (process.env.ALLOWED_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),

  // Session keep-alive (default: 4 min)
  KEEP_ALIVE_INTERVAL: parseInt(process.env.KEEP_ALIVE_INTERVAL || '240000', 10),
  MAX_PING_FAILURES: parseInt(process.env.MAX_PING_FAILURES || '3', 10),

  // VietQR Config
  MB_BIN: process.env.MB_BIN || '970422', // BIN for MB Bank

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

