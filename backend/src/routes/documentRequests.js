'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/security');
const documentRequestService = require('../services/documentRequestService');
const authService = require('../services/authService');
const { findById } = require('../repositories/store');
const {
  z,
  uuid,
  requestTypeId,
  phoneE164Like,
  otpCode,
  safePayload,
  parseOrThrow,
  zodToHttpError,
} = require('../security/validation');

const router = express.Router();

const marriageConfirmSchema = z.object({
  phone: phoneE164Like,
  code: otpCode,
});

/** Public: partner confirms marriage invite with phone + SMS code (no user directory). */
router.post('/marriage/confirm', authRateLimiter, async (req, res, next) => {
  try {
    const data = parseOrThrow(marriageConfirmSchema, req.body);
    const result = await documentRequestService.confirmMarriageLicense(data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(zodToHttpError(err));
  }
});

router.use(requireAuth);

router.get('/catalog', async (req, res, next) => {
  try {
    const stored = await findById('users', req.user.id);
    const profile = stored
      ? {
          isStudent: stored.isStudent === true,
          firstName: stored.firstName,
          lastName: stored.lastName,
          state: stored.state,
        }
      : null;
    res.json({ catalog: documentRequestService.listCatalog(profile) });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ requests: await documentRequestService.listRequests(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/:requestId', async (req, res, next) => {
  try {
    const requestId = parseOrThrow(uuid, req.params.requestId);
    res.json({ request: await documentRequestService.getRequest(req.user.id, requestId) });
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  requestTypeId,
  payload: safePayload,
});

router.post('/', async (req, res, next) => {
  try {
    const data = parseOrThrow(submitSchema, req.body);
    const user = await authService.getProfile(req.user.id);
    const stored = await findById('users', req.user.id);
    const profile = {
      ...user,
      isStudent: stored?.isStudent === true,
    };
    const request = await documentRequestService.submitRequest(req.user.id, profile, data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ request });
  } catch (err) {
    next(zodToHttpError(err));
  }
});

module.exports = router;
