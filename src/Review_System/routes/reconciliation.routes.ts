// src/Review_System/routes/reconciliation.routes.ts
import { Router } from 'express';
import reconciliationController from '../controllers/reconciliation.controller';
import { authenticateAdminToken } from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import asyncHandler from '../../utils/asyncHandler'; // Import asyncHandler
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
// Route to check for review discrepancies
router.get(
  '/check-discrepancies/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  asyncHandler(async (req, res) => {
    const { proposalId } = req.params;
    const result = await reconciliationController.checkReviewDiscrepancies(proposalId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/process/:reviewId',
  authenticateAdminToken,
  validateRequest(reviewIdSchema),
  asyncHandler(async (req, res) => {
    const { reviewId } = req.params;
    const result = await reconciliationController.processReconciliationReview(reviewId);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/discrepancy/:proposalId',
  authenticateAdminToken,
  validateRequest(proposalIdSchema),
  asyncHandler(async (req, res) => {
    const { proposalId } = req.params;
    const result = await reconciliationController.getDiscrepancyDetails(proposalId);
    res.status(200).json({ success: true, data: result });
  })
);

export default router;
