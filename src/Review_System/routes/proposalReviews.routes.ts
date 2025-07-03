import { Router } from 'express';
import proposalReviewsController from '../controllers/proposalReviews.controller';
import {
  authenticateAdminToken,
  rateLimiter,
} from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// Rate limiter for admin endpoints
const adminRateLimiter = rateLimiter(2000, 60 * 60 * 1000); // 2000 requests per hour

// Validation schemas
const proposalReviewsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    status: z.enum(['under_review', 'reviewed', 'reconciliation']).optional(),
    faculty: z.string().optional(),
    discrepancy: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
  }),
});

const proposalIdSchema = z.object({
  params: z.object({
    proposalId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid proposal ID format'),
  }),
});

// Routes
router.get(
  '/',
  authenticateAdminToken,
  adminRateLimiter,
  validateRequest(proposalReviewsQuerySchema),
  proposalReviewsController.getAllProposalReviews
);

router.get(
  '/statistics',
  authenticateAdminToken,
  adminRateLimiter,
  proposalReviewsController.getReviewStatistics
);

router.get(
  '/discrepancy',
  authenticateAdminToken,
  adminRateLimiter,
  validateRequest(proposalReviewsQuerySchema),
  proposalReviewsController.getDiscrepancyProposals
);

router.get(
  '/:proposalId',
  authenticateAdminToken,
  adminRateLimiter,
  validateRequest(proposalIdSchema),
  proposalReviewsController.getProposalReviewDetails
);

export default router;
