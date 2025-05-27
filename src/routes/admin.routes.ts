import express from 'express';
import adminController from '../controllers/admin.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../middleware/auth.middleware';
import researcherManagementRoutes from '../researchers/routes/researcher-management.routes';
import assignReviewRoutes from '../Review_System/routes/assignReview.routes';
import proposalReviewsRoutes from '../Review_System/routes/proposalReviews.routes';

const router = express.Router();

// Apply rate limiting and admin authentication to all admin endpoints
const adminRateLimiter = rateLimiter(100, 60 * 60 * 1000); // 100 requests per hour

// Get all proposals (with pagination and filtering)
router.get(
  '/proposals',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getAllProposals
);

// Get proposal by ID
router.get(
  '/proposals/:id',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getProposalById
);

router.get(
  '/faculties-with-proposals',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getFacultiesWithProposals
);

// Get proposal statistics
router.get(
  '/statistics',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getProposalStatistics
);

// New routes for proposal decision and reporting
router.get(
  '/proposals-for-decision',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getProposalsForDecision
);

router.patch(
  '/proposals/:id/status',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.updateProposalStatus
);

router.post(
  '/proposals/:proposalId/notify-applicants',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.notifyApplicants
);

router.get(
  '/proposals/export-decisions',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.exportDecisionsReport
);

// Toggle proposal archive status
router.put(
  '/proposals/:id/archive',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.toggleProposalArchiveStatus
);

router.use('/researcher', researcherManagementRoutes);
router.use('/', assignReviewRoutes);
router.use('/proposal-reviews', proposalReviewsRoutes);

export default router;
