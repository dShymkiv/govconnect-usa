'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const vehicleService = require('../services/vehicleService');

const router = express.Router();

router.use(requireAuth);

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
    const fines = await vehicleService.listFines(req.user.id, {
      documentId: req.query.documentId,
      status: req.query.status,
    });
    res.json({ fines });
  } catch (err) {
    next(err);
  }
});

router.get('/fines/:fineId', async (req, res, next) => {
  try {
    const fine = await vehicleService.getFine(req.user.id, req.params.fineId);
    res.json({ fine });
  } catch (err) {
    next(err);
  }
});

router.post('/fines/:fineId/pay', async (req, res, next) => {
  try {
    const fine = await vehicleService.payFine(req.user.id, req.params.fineId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ fine });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
