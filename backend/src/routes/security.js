'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listRecentAudit } = require('../security/audit');
const { z, parseOrThrow, zodToHttpError } = require('../security/validation');

const router = express.Router();

router.use(requireAuth);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/** Citizen-visible security evidence: own recent audit events (redacted). */
router.get('/audit', (req, res, next) => {
  try {
    const { limit } = parseOrThrow(querySchema, req.query);
    const events = listRecentAudit({ userId: req.user.id, limit });
    res.json({
      events,
      note:
        'Append-only audit trail with HMAC integrity digests. Full digests are truncated in this citizen view.',
      assurance: {
        sessionAal: req.user.aal || null,
        sessionIal: req.user.ial || null,
      },
    });
  } catch (err) {
    next(zodToHttpError(err));
  }
});

module.exports = router;
