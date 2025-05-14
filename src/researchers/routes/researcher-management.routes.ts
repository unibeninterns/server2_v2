import express from 'express';
import researcherManagementController from '../controllers/researcher-management.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../../middleware/auth.middleware';

const router = express.Router();

// Apply rate limiting to all admin endpoints
const adminRateLimiter = rateLimiter(100, 60 * 60 * 1000); // 100 requests per hour

// Protect all routes with admin authentication
router.use(authenticateAdminToken);
router.use(adminRateLimiter);

// Get all researchers with proposals
router.get(
  '/researchers',
  researcherManagementController.getResearchersWithProposals
);

// Get researcher details with proposals
router.get(
  '/researchers/:researcherId',
  researcherManagementController.getResearcherDetails
);

// Send login credentials to researcher
router.post(
  '/researchers/:researcherId/send-credentials',
  researcherManagementController.sendResearcherCredentials
);

// Resend login credentials to researcher
router.post(
  '/researchers/:researcherId/resend-credentials',
  researcherManagementController.resendResearcherCredentials
);

export default router;
