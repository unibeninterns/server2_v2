import express from 'express';
import adminController from '../controllers/admin.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../middleware/auth.middleware';
import researcherManagementRoutes from '../researchers/routes/researcher-management.routes';
import assignReviewRoutes from '../Review_System/routes/assignReview.routes';
import reassignReviewRoutes from '../Review_System/routes/reAssignReviewers.routes';
import proposalReviewsRoutes from '../Review_System/routes/proposalReviews.routes';
import finalDecisionsRoutes from '../Review_System/routes/finalDecisions.routes';
import finalDecisionRoutes from '../Review_System/routes/finalDecisions_2.routes';
import analyticsRoutes from '../Review_System/routes/analytics.routes';

const router = express.Router();

// Apply rate limiting and admin authentication to all admin endpoints
const adminRateLimiter = rateLimiter(2000, 60 * 60 * 1000); // 2000 requests per hour

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

// Toggle proposal archive status
router.put(
  '/proposals/:id/archive',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.toggleProposalArchiveStatus
);

router.use('/researcher', researcherManagementRoutes);
router.use('/', assignReviewRoutes);
router.use('/reassign', reassignReviewRoutes);
router.use('/proposal-reviews', proposalReviewsRoutes);
router.use('/decisions', finalDecisionsRoutes);
router.use('/decisions_2', finalDecisionRoutes);
router.use('/analytics', analyticsRoutes);

export default router;
