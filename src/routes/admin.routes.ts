import express from 'express';
import adminController from '../controllers/admin.controller.js';
import {
  authenticateAdminToken,
  rateLimiter
} from '../middleware/auth.middleware.js';
import validateRequest from '../middleware/validateRequest.js';
import { proposalStatusUpdateSchema } from '../validators/admin.validators.js';

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

// Update proposal status
router.put(
  '/proposals/:id/status',
  authenticateAdminToken,
  adminRateLimiter,
  validateRequest(proposalStatusUpdateSchema),
  adminController.updateProposalStatus
);

// Get proposal statistics
router.get(
  '/statistics',
  authenticateAdminToken,
  adminRateLimiter,
  adminController.getProposalStatistics
);

export default router;
