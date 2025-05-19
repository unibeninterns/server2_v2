// src/Review_System/controllers/aiScoring.controller.ts
import { Request, Response } from 'express';
import Review, { ReviewStatus, ReviewType } from '../models/review.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';

interface IAIScoringResponse {
  success: boolean;
  message?: string;
  data?: any;
}

class AIScoringController {
  // Generate AI scores for a proposal
  generateAIScore = asyncHandler(
    async (req: Request<{ proposalId: string }>, res: Response<IAIScoringResponse>): Promise<void> => {
      const { proposalId } = req.params;
      
      // Check if proposal exists
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }
      
      // Check if AI review already exists
      const existingAIReview = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.AI
      });
      
      if (existingAIReview) {
        return res.status(200).json({
          success: true,
          message: 'AI review already exists for this proposal',
          data: existingAIReview
        });
      }
      
      // Implementation of placeholder AI scoring as specified in the PRD
      const baseScores = {
        relevanceToNationalPriorities: 7,
        originalityAndInnovation: 12,
        clarityOfResearchProblem: 8,
        methodology: 12,
        literatureReview: 8,
        teamComposition: 8,
        feasibilityAndTimeline: 7,
        budgetJustification: 7,
        expectedOutcomes: 4,
        sustainabilityAndScalability: 4,
      };
      
      // Add random variation (±20%)
      const scores = { ...baseScores };
      Object.keys(baseScores).forEach((criterion) => {
        const variation = Math.random() * 0.4 - 0.2; // -20% to +20%
        const baseScore = baseScores[criterion as keyof typeof base