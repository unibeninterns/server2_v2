import { Router } from 'express';
import ReassignReviewController from '../controllers/reAssignReviewer.controller';
import { authenticateAdminToken } from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

const proposalIdSchema = z.object({
  params: z.object({
    proposalId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid proposal ID format'),
  }),
});

const reviewIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID format'),
  }),
});

router.put(
  '/regular/:reviewId',
  authenticateAdminToken,
  validateRequest(reviewIdSchema),
  ReassignReviewController.reassignRegularReview
);

router.put(
  '/reconciliation/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  ReassignReviewController.reassignReconciliationReview
);

export default router;
