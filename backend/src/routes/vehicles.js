'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const vehicleService = require('../services/vehicleService');
const { z, uuid, fineStatus, parseOrThrow } = require('../security/validation');

const router = express.Router();

router.use(requireAuth);

const finesQuerySchema = z.object({
  documentId: uuid.optional(),
  status: fineStatus,
});

router.get('/', async (req, res, next) => {
  try {
    const vehicles = await vehicleService.listVehicles(req.user.id);
    res.json({ vehicles });
  } catch (err) {
    next(err);
  }
});

router.get('/fines', async (req, res, next) => {
  try {
    const filters = parseOrThrow(finesQuerySchema, {
      documentId: req.query.documentId || undefined,
      status: req.query.status || undefined,
    });
    const fines = await vehicleService.listFines(req.user.id, filters);
    res.json({ fines });
  } catch (err) {
    next(err);
  }
});

router.get('/fines/:fineId', async (req, res, next) => {
  try {
    const fineId = parseOrThrow(uuid, req.params.fineId);
    const fine = await vehicleService.getFine(req.user.id, fineId);
    res.json({ fine });
  } catch (err) {
    next(err);
  }
});

router.post('/fines/:fineId/pay', async (req, res, next) => {
  try {
    const fineId = parseOrThrow(uuid, req.params.fineId);
    const fine = await vehicleService.payFine(req.user.id, fineId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ fine });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
