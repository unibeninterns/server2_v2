import { Router } from 'express';
import assignReviewController from '../controllers/assignReview.controller';
import { authenticateAdminToken } from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// Define validation schema for proposalId parameter
const proposalIdSchema = z.object({
  params: z.object({
    proposalId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid proposal ID format'),
  }),
});

// Route to assign reviewers to a proposal
router.post(
  '/assign/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  assignReviewController.assignReviewers
);

// Route to check for overdue reviews (no params needed)
router.get(
  '/check-overdue',
  authenticateAdminToken,
  assignReviewController.checkOverdueReviews
);

export default router;
