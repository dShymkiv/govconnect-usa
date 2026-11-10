'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const walletService = require('../services/walletService');
const { z, uuid, parseOrThrow, zodToHttpError } = require('../security/validation');

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
    const documentId = parseOrThrow(uuid, req.params.documentId);
    const document = await walletService.getDocument(req.user.id, documentId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ document });
  } catch (err) {
    next(err);
  }
});

const presentSchema = z.object({
  documentId: uuid,
});

router.post('/present', async (req, res, next) => {
  try {
    const { documentId } = parseOrThrow(presentSchema, req.body);
    const presentation = await walletService.createPresentation(req.user.id, documentId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json(presentation);
  } catch (err) {
    next(zodToHttpError(err));
  }
});

module.exports = router;
