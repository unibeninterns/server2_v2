import express from 'express';
import analyticsController from '../controllers/analytics.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../../middleware/auth.middleware';

const router = express.Router();

// Apply rate limiting and admin authentication to all admin endpoints
const adminRateLimiter = rateLimiter(5000, 60 * 60 * 1000); // 5000 requests per hour

// Faculties with proposal submissions
router.get(
  '/faculties-with-submissions',
  authenticateAdminToken,
  adminRateLimiter,
  analyticsController.getFacultiesWithSubmissions
);

// Faculties with approved awards
router.get(
  '/faculties-with-approved-awards',
  authenticateAdminToken,
  adminRateLimiter,
  analyticsController.getFacultiesWithApprovedAwards
);

// Faculties with approved full proposals
router.get(
  '/faculties-with-approved-full-proposals',
  authenticateAdminToken,
  adminRateLimiter,
  analyticsController.getFacultiesWithApprovedFullProposals
);

export default router;
