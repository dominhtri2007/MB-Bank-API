const { isValidDate, sanitizeCode } = require('../utils/security');
const logger = require('../utils/logger');

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseAmount(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(String(val).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeStr(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function sanitizeTx(tx, acc) {
  const credit = Number(String(tx.creditAmount || '0').replace(/[^0-9]/g, ''));
  const debit = Number(String(tx.debitAmount || '0').replace(/[^0-9]/g, ''));
  return {
    refNo: tx.refNo || '',
    transactionDate: tx.transactionDate || tx.postDate || '',
    creditAmount: credit,
    debitAmount: debit,
    type: credit > 0 ? 'IN' : 'OUT',
    currency: tx.transactionCurrency || 'VND',
    description: tx.transactionDesc || '',
    balanceAvailable: Number(String(tx.balanceAvailable || '0').replace(/[^0-9]/g, '')),
    accountNumber: tx.accountNumber || acc || '',
  };
}

module.exports = function createHandlers(bank, config) {
  return {
    async history(req, res) {
      try {
        const { from, to, limit, type } = req.query;
        if (from && !isValidDate(from)) return res.status(400).json({ success: false, error: 'from format must be DD/MM/YYYY' });
        if (to && !isValidDate(to)) return res.status(400).json({ success: false, error: 'to format must be DD/MM/YYYY' });
        const fromDate = from || formatDate(new Date());
        const toDate = to || formatDate(new Date());
        const max = Math.min(Math.max(parseInt(limit || '100', 10) || 100, 1), 500);

        const raw = await bank.getTransactionHistory(fromDate, toDate);
        let list = (Array.isArray(raw) ? raw : []).map((t) => sanitizeTx(t, config.MB_ACCOUNT_NUMBER));
        if (type) {
          const t = String(type).toUpperCase();
          if (t === 'IN' || t === 'CREDIT') list = list.filter((i) => i.creditAmount > 0);
          else if (t === 'OUT' || t === 'DEBIT') list = list.filter((i) => i.debitAmount > 0);
        }
        res.json({ success: true, count: Math.min(list.length, max), data: list.slice(0, max) });
      } catch (e) {
        logger.error(`History error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to fetch transaction history' });
      }
    },

    async check(req, res) {
      try {
        const p = { ...req.query, ...(req.body || {}) };
        const code = sanitizeCode(p.code || p.memo || '');
        if (!code) return res.status(400).json({ success: false, error: 'Missing code parameter (e.g. ?code=DH1234)' });
        const expected = parseAmount(p.amount);
        const days = Math.min(Math.max(parseInt(p.days || '7', 10) || 7, 1), 30);
        const fromDate = p.from && isValidDate(p.from) ? p.from : formatDate(new Date(Date.now() - days * 86400000));
        const toDate = p.to && isValidDate(p.to) ? p.to : formatDate(new Date());

        const raw = await bank.getTransactionHistory(fromDate, toDate);
        const list = (Array.isArray(raw) ? raw : []).map((t) => sanitizeTx(t, config.MB_ACCOUNT_NUMBER));
        const target = normalizeStr(code);

        const match = list.find((i) => {
          if (i.creditAmount <= 0) return false;
          const ok = normalizeStr(i.description).includes(target) || normalizeStr(i.refNo).includes(target);
          return ok && (expected !== null ? i.creditAmount === expected : true);
        });

        if (match) return res.json({ success: true, found: true, transaction: match, query: { code, amount: expected } });
        res.json({ success: true, found: false, message: 'Chưa có giao dịch', checkedCount: list.length });
      } catch (e) {
        logger.error(`Check error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to verify transaction' });
      }
    },

    async createPayment(req, res) {
      try {
        const p = { ...req.query, ...(req.body || {}) };
        const amount = parseAmount(p.amount);
        if (!amount) return res.status(400).json({ success: false, error: 'Invalid or missing amount' });
        if (!config.MB_ACCOUNT_NUMBER) return res.status(500).json({ success: false, error: 'MB_ACCOUNT_NUMBER missing in .env' });

        let code = sanitizeCode(p.code || p.memo || '');
        if (!code) code = 'MB' + Math.floor(100000 + Math.random() * 900000);
        const bin = config.MB_BIN || '970422';
        const qrUrl = `https://img.vietqr.io/image/${bin}-${config.MB_ACCOUNT_NUMBER}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(code)}`;
        const k = req.params.apiKey || (req.headers['x-api-key'] ? 'HEADER' : '');
        const checkUrl = k && k !== 'HEADER' ? `/api/check-transaction/${k}?code=${code}&amount=${amount}` : `/api/check-transaction?code=${code}&amount=${amount}`;

        res.json({ success: true, data: { bank: 'MB', bin, accountNumber: config.MB_ACCOUNT_NUMBER, amount, code, qrUrl, checkUrl } });
      } catch (e) {
        logger.error(`Payment QR error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to generate payment QR' });
      }
    },

    async balance(req, res) {
      try {
        const balance = await bank.getBalance();
        res.json({ success: true, data: balance });
      } catch (e) {
        logger.error(`Balance error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to get balance' });
      }
    }
  };
};
