// src/Review_System/routes/review.routes.ts
import { Router } from 'express';
import reviewController from '../controllers/review.controller';
import { authenticateReviewerToken } from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// Validation schemas
const reviewIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID format'),
  }),
});

const submitReviewSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID format'),
  }),
  body: z.object({
    scores: z.object({
      relevanceToNationalPriorities: z.number().min(0).max(10),
      originalityAndInnovation: z.number().min(0).max(15),
      clarityOfResearchProblem: z.number().min(0).max(10),
      methodology: z.number().min(0).max(15),
      literatureReview: z.number().min(0).max(10),
      teamComposition: z.number().min(0).max(10),
      feasibilityAndTimeline: z.number().min(0).max(10),
      budgetJustification: z.number().min(0).max(10),
      expectedOutcomes: z.number().min(0).max(5),
      sustainabilityAndScalability: z.number().min(0).max(5),
    }),
    comments: z.string(),
  }),
});

const saveProgressSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID format'),
  }),
  body: z.object({
    scores: z
      .object({
        relevanceToNationalPriorities: z.number().min(0).max(10).optional(),
        originalityAndInnovation: z.number().min(0).max(15).optional(),
        clarityOfResearchProblem: z.number().min(0).max(10).optional(),
        methodology: z.number().min(0).max(15).optional(),
        literatureReview: z.number().min(0).max(10).optional(),
        teamComposition: z.number().min(0).max(10).optional(),
        feasibilityAndTimeline: z.number().min(0).max(10).optional(),
        budgetJustification: z.number().min(0).max(10).optional(),
        expectedOutcomes: z.number().min(0).max(5).optional(),
        sustainabilityAndScalability: z.number().min(0).max(5).optional(),
      })
      .optional(),
    comments: z.string().optional(),
  }),
});

// Reviewer routes
router.get(
  '/assignments',
  authenticateReviewerToken,
  reviewController.getReviewerAssignments
);
router.get(
  '/statistics',
  authenticateReviewerToken,
  reviewController.getReviewerStatistics
);
router.get(
  '/:id',
  authenticateReviewerToken,
  validateRequest(reviewIdSchema),
  reviewController.getReviewById
);
router.post(
  '/:id/submit',
  authenticateReviewerToken,
  validateRequest(submitReviewSchema),
  reviewController.submitReview
);
router.patch(
  '/:id/save-progress',
  authenticateReviewerToken,
  validateRequest(saveProgressSchema),
  reviewController.saveReviewProgress
);

export default router;
