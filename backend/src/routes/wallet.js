'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const walletService = require('../services/walletService');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const documents = await walletService.listForUser(req.user.id, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

router.get('/:documentId', async (req, res, next) => {
  try {
    const document = await walletService.getDocument(req.user.id, req.params.documentId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ document });
  } catch (err) {
    next(err);
  }
});

const presentSchema = z.object({
  documentId: z.string().uuid(),
});

router.post('/present', async (req, res, next) => {
  try {
    const { documentId } = presentSchema.parse(req.body);
    const presentation = await walletService.createPresentation(req.user.id, documentId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json(presentation);
  } catch (err) {
    if (err.name === 'ZodError') {
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.message = err.issues.map((e) => e.message).join('; ');
    }
    next(err);
  }
});

module.exports = router;
