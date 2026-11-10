'use strict';

const express = require('express');
const { authRateLimiter } = require('../middleware/security');
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/authService');
const otpAuthService = require('../services/otpAuthService');
const { z, phoneE164Like, otpCode, parseOrThrow } = require('../security/validation');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  state: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
  phone: phoneE164Like.optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(2000),
});

const otpRequestSchema = z.object({
  phone: phoneE164Like,
  password: z.string().min(1).max(128),
});

const otpVerifySchema = z.object({
  phone: phoneE164Like,
  password: z.string().min(1).max(128),
  code: otpCode,
});

router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(registerSchema, req.body);
    const user = await authService.register(data, { ip: req.ip, requestId: req.requestId });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(loginSchema, req.body);
    const result = await authService.login(data, { ip: req.ip, requestId: req.requestId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/otp/request', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(otpRequestSchema, req.body);
    const result = await otpAuthService.requestOtp(data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/otp/verify', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(otpVerifySchema, req.body);
    const result = await otpAuthService.verifyOtp(data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(refreshSchema, req.body);
    const result = await authService.refresh(data.refreshToken, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const data = parseOrThrow(refreshSchema, req.body);
    const result = await authService.logout(data.refreshToken, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json({
      user,
      assurance: {
        ial: req.user.ial,
        aal: req.user.aal,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
