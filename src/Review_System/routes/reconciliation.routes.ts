// src/Review_System/routes/reconciliation.routes.ts
import { Router } from 'express';
import reconciliationController from '../controllers/reconciliation.controller';
import { authenticateAdminToken } from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// Validation schemas
const proposalIdSchema = z.object({
  params: z.object({
    proposalId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid proposal ID format'),
  }),
});

const reviewIdSchema = z.object({
  params: z.object({
    reviewId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID format'),
  }),
});

// Admin routes for managing reconciliation
router.post(
  '/assign/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  reconciliationController.assignReconciliationReviewer
);

router.post(
  '/process/:reviewId',
  authenticateAdminToken,
  validateRequest(reviewIdSchema),
  reconciliationController.processReconciliationReview
);

router.get(
  '/discrepancy/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  reconciliationController.getDiscrepancyDetails
);

export default router;
