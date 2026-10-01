'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const walletService = require('../services/walletService');

const router = express.Router();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts', code: 'VERIFY_RATE_LIMITED' },
});

router.get('/:code', verifyLimiter, async (req, res, next) => {
  try {
    const result = await walletService.verifyPresentation(req.params.code, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
