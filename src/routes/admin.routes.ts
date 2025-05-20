import express from 'express';
import adminController from '../controllers/admin.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../middleware/auth.middleware';
import researcherManagementRoutes from '../researchers/routes/researcher-management.routes';
import assignReviewRoutes from '../Review_System/routes/assignReview.routes';

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

// Get proposal statistics
router.get(
  '/statistics',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getProposalStatistics
);

router.use('/researcher', researcherManagementRoutes);
router.use('/', assignReviewRoutes);

export default router;
