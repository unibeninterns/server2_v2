import express from 'express';
import fullProposalDecisionsController from '../controllers/finalDecisions_2.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../../middleware/auth.middleware';

const router = express.Router();

// Apply rate limiting and admin authentication to all admin endpoints
const adminRateLimiter = rateLimiter(5000, 60 * 60 * 1000); // 5000 requests per hour

// Get all full proposals for decision making
router.get(
  '/full-proposals-for-decision',
  authenticateAdminToken,
  adminRateLimiter,
  fullProposalDecisionsController.getAllFullProposals
);

// Get specific full proposal by ID
router.get(
  '/full-proposal/:id',
  authenticateAdminToken,
  adminRateLimiter,
  fullProposalDecisionsController.getFullProposalById
);

// Update full proposal status (approve/reject with review comments)
router.patch(
  '/full-proposal/:id/status',
  authenticateAdminToken,
  adminRateLimiter,
  fullProposalDecisionsController.updateFullProposalStatus
);

// Notify applicants about full proposal decision
router.post(
  '/full-proposal/:fullProposalId/notify-applicants',
  authenticateAdminToken,
  adminRateLimiter,
  fullProposalDecisionsController.notifyFullProposalApplicants
);

export default router;
