/**
 * Security utilities: Timing-safe authentication, IP checking, input sanitization
 */
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Compare two strings in constant time using SHA-256 to prevent timing attacks
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Extract API key from path params, query params, headers, or Bearer auth
 */
function extractApiKey(req) {
  if (req.params && req.params.apiKey) {
    return String(req.params.apiKey).trim();
  }
  if (req.headers && req.headers['x-api-key']) {
    return String(req.headers['x-api-key']).trim();
  }
  const authHeader = req.headers ? req.headers.authorization : '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.query && req.query.apiKey) {
    return String(req.query.apiKey).trim();
  }
  return '';
}

/**
 * Check client IP against ALLOWED_IPS whitelist (if configured)
 */
function checkIpAllowed(req, allowedIps) {
  if (!allowedIps || allowedIps.length === 0) {
    return true; // No IP restriction configured
  }
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const clientIp = String(rawIp).split(',')[0].trim().replace(/^::ffff:/, '');
  return allowedIps.includes(clientIp);
}

/**
 * Express middleware to enforce API Key and optional IP Whitelist
 */
function createAuthMiddleware(config) {
  return (req, res, next) => {
    // 1. IP Whitelist check
    if (!checkIpAllowed(req, config.ALLOWED_IPS)) {
      logger.warn(`[Security] Blocked unauthorized IP: ${req.ip}`);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: IP not allowed',
      });
    }

    // 2. API Key verification
    const expectedKey = config.API_KEY;
    if (!expectedKey) {
      logger.error('[Security] API_KEY is not configured in .env');
      return res.status(500).json({
        success: false,
        error: 'Server security misconfiguration: API_KEY is missing in .env',
      });
    }

    const providedKey = extractApiKey(req);
    if (!providedKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing API Key. Use /api/.../:apiKey or Header x-api-key',
      });
    }

    if (!timingSafeCompare(providedKey, expectedKey)) {
      logger.warn(`[Security] Invalid API key attempt from IP ${req.ip}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid API Key',
      });
    }

    next();
  };
}

/**
 * Validate DD/MM/YYYY date format
 */
function isValidDate(str) {
  if (typeof str !== 'string') return false;
  const match = str.match(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(\d{4})$/);
  if (!match) return false;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/**
 * Sanitize payment code/string (alphanumeric, dash, underscore, space only, capped at 100 chars)
 */
function sanitizeCode(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 100);
}

module.exports = {
  timingSafeCompare,
  extractApiKey,
  createAuthMiddleware,
  isValidDate,
  sanitizeCode,
};
