// src/Review_System/controllers/aiScoring.controller.ts
import { Request, Response } from 'express';
import Review, {
  ReviewStatus,
  ReviewType,
  IScore,
} from '../models/review.model';
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
  generateAIScores = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IAIScoringResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      // Check if proposal exists
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Check if AI review already exists
      const existingAIReview = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.AI,
      });

      if (existingAIReview) {
        res.status(200).json({
          success: true,
          message: 'AI review already exists for this proposal',
          data: existingAIReview,
        });
        return;
      }

      // Create a new AI review
      const aiReview = new Review({
        proposal: proposalId,
        reviewer: null, // null for AI review
        reviewType: ReviewType.AI,
        status: ReviewStatus.IN_PROGRESS,
        dueDate: new Date(), // AI review due immediately
      });

      await aiReview.save();

      // Generate AI scores and update the review
      await this.generateAIReviewScores(aiReview._id as string);

      // Fetch the updated review
      const completedAIReview = await Review.findById(aiReview._id);

      res.status(200).json({
        success: true,
        message: 'AI review generated successfully',
        data: completedAIReview,
      });
    }
  );

  // Generate AI review scores for a specific review
  generateAIReviewScores = async (reviewId: string): Promise<void> => {
    const review = await Review.findById(reviewId).populate('proposal');
    if (!review || review.reviewType !== ReviewType.AI) {
      throw new NotFoundError('AI Review not found');
    }

    // Generate AI scores
    const aiScores = this.generateAIScore();

    // Update review with AI scores
    review.scores = aiScores.scores;
    review.comments = aiScores.explanations;
    review.status = ReviewStatus.COMPLETED;
    review.completedAt = new Date();

    await review.save();

    logger.info(`Generated AI review for proposal ${review.proposal}`);
  };

  // Generate placeholder AI scores with smart variation
  private generateAIScore(): {
    scores: IScore;
    explanations: Record<string, string>;
    totalScore: number;
  } {
    type ScoreCriterion = keyof typeof baseScores;

    const baseScores: IScore = {
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
    const defaultScores: IScore = {
      relevanceToNationalPriorities: 0,
      originalityAndInnovation: 0,
      clarityOfResearchProblem: 0,
      methodology: 0,
      literatureReview: 0,
      teamComposition: 0,
      feasibilityAndTimeline: 0,
      budgetJustification: 0,
      expectedOutcomes: 0,
      sustainabilityAndScalability: 0,
    };

    const scores: IScore = Object.assign({}, defaultScores);
    (Object.keys(baseScores) as ScoreCriterion[]).forEach((criterion) => {
      const variation = Math.random() * 0.4 - 0.2; // -20% to +20%
      const baseScore = baseScores[criterion];
      const adjustedScore = Math.min(
        Math.max(Math.round(baseScore * (1 + variation)), 1),
        baseScore // Never exceed max for criterion
      );
      scores[criterion] = adjustedScore;
    });

    // Generate templated explanations
    const explanations: any = {
      relevanceToNationalPriorities: `The proposal demonstrates ${scores.relevanceToNationalPriorities > 7 ? 'strong' : 'moderate'} alignment with national priorities.`,
      originalityAndInnovation: `The research concept shows ${scores.originalityAndInnovation > 12 ? 'excellent' : 'good'} innovation potential.`,
      clarityOfResearchProblem: `Research problem is ${scores.clarityOfResearchProblem > 8 ? 'very clearly' : 'adequately'} defined.`,
      methodology: `Proposed methods are ${scores.methodology > 12 ? 'highly appropriate' : 'suitable'} for addressing the research questions.`,
      literatureReview: `The literature review is ${scores.literatureReview > 8 ? 'comprehensive' : 'adequate'}.`,
      teamComposition: `Research team has ${scores.teamComposition > 8 ? 'excellent' : 'appropriate'} qualifications for the project.`,
      feasibilityAndTimeline: `Project timeline is ${scores.feasibilityAndTimeline > 7 ? 'realistic' : 'somewhat ambitious'}.`,
      budgetJustification: `Budget allocation is ${scores.budgetJustification > 7 ? 'well justified' : 'reasonably aligned'} with project goals.`,
      expectedOutcomes: `Anticipated outcomes ${scores.expectedOutcomes > 4 ? 'strongly contribute' : 'contribute'} to the field.`,
      sustainabilityAndScalability: `Project has ${scores.sustainabilityAndScalability > 4 ? 'significant' : 'some'} potential for long-term impact.`,
      strengths:
        'The proposal demonstrates good alignment with research priorities and presents a clear methodology.',
      weaknesses:
        'Some aspects of the budget justification and timeline could be strengthened for better feasibility.',
      overall:
        'This is a solid research proposal with good potential for impact in its field.',
    };

    const totalScore = Object.values(scores)
      .map(Number)
      .reduce((sum: number, score: number) => sum + score, 0);

    return {
      scores,
      explanations,
      totalScore,
    };
  }
}

export default new AIScoringController();
