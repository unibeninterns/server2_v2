import express from 'express';
import decisionsController from '../controllers/finalDecisions.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../../middleware/auth.middleware';
const router = express.Router();

// Apply rate limiting and admin authentication to all admin endpoints
const adminRateLimiter = rateLimiter(5000, 60 * 60 * 1000); // 5000 requests per hour

router.get(
  '/proposals-for-decision',
  authenticateAdminToken,
  adminRateLimiter,
  decisionsController.getProposalsForDecision
);

router.get(
  '/export-decisions',
  authenticateAdminToken,
  adminRateLimiter,
  decisionsController.exportDecisionsReport
);

router.patch(
  '/:id/status',
  authenticateAdminToken,
  adminRateLimiter,
  decisionsController.updateProposalStatus
);

router.post(
  '/:proposalId/notify-applicants',
  authenticateAdminToken,
  adminRateLimiter,
  decisionsController.notifyApplicants
);

export default router;
