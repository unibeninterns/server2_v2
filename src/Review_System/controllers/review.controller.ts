// src/Review_System/controllers/review.controller.ts
import { Request, Response } from 'express';
import Review, { IScore, ReviewStatus } from '../models/review.model';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import mongoose from 'mongoose';

interface IReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

interface ISubmitReviewRequest {
  scores: IScore;
  comments: {
    relevanceToNationalPriorities?: string;
    originalityAndInnovation?: string;
    clarityOfResearchProblem?: string;
    methodology?: string;
    literatureReview?: string;
    teamComposition?: string;
    feasibilityAndTimeline?: string;
    budgetJustification?: string;
    expectedOutcomes?: string;
    sustainabilityAndScalability?: string;
    strengths?: string;
    weaknesses?: string;
    overall?: string;
  };
}

class ReviewController {
  // Get reviews assigned to a specific reviewer
  getReviewerAssignments = asyncHandler(
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const reviewerId = req.user.id; // Assuming auth middleware sets this

      const reviews = await Review.find({
        reviewer: reviewerId,
        reviewType: { $ne: 'ai' }, // Exclude AI reviews
      })
        .populate({
          path: 'proposal',
          select: 'projectTitle submitterType status createdAt estimatedBudget',
          populate: {
            path: 'submitter',
            select: 'name email faculty department',
            populate: [
              { path: 'faculty', select: 'title' },
              { path: 'department', select: 'title' },
            ],
          },
        })
        .sort({ dueDate: 1 });

      res.status(200).json({
        success: true,
        count: reviews.length,
        data: reviews,
      });
    }
  );

  // Get a specific review by ID
  getReviewById = asyncHandler(
    async (
      req: Request<{ id: string }>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { id } = req.params;
      const reviewerId = req.user.id; // From auth middleware

      const review = await Review.findOne({
        _id: id,
        reviewer: reviewerId,
      }).populate({
        path: 'proposal',
        select:
          'projectTitle submitterType status createdAt estimatedBudget problemStatement objectives methodology expectedOutcomes workPlan',
        populate: {
          path: 'submitter',
          select: 'name email faculty department academicTitle',
          populate: [
            { path: 'faculty', select: 'title' },
            { path: 'department', select: 'title' },
          ],
        },
      });

      if (!review) {
        throw new NotFoundError('Review not found or unauthorized');
      }

      res.status(200).json({
        success: true,
        data: review,
      });
    }
  );

  // Get all reviews for a specific proposal (admin only)
  getProposalReviews = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      const reviews = await Review.find({
        proposal: proposalId,
      })
        .populate('reviewer', 'name email faculty department')
        .sort({ createdAt: 1 });

      res.status(200).json({
        success: true,
        count: reviews.length,
        data: reviews,
      });
    }
  );

  // Submit a review
  submitReview = asyncHandler(
    async (
      req: Request<{ id: string }, {}, ISubmitReviewRequest>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { id } = req.params;
      const reviewerId = req.user.id; // From auth middleware
      const { scores, comments } = req.body;

      // Find review and check permission
      const review = await Review.findOne({
        _id: id,
        reviewer: reviewerId,
        status: { $ne: ReviewStatus.COMPLETED }, // Cannot update completed reviews
      });

      if (!review) {
        throw new NotFoundError(
          'Review not found, unauthorized, or already completed'
        );
      }

      // Update review with submission
      review.scores = scores;
      review.comments = comments;
      review.status = ReviewStatus.COMPLETED;
      review.completedAt = new Date();

      await review.save();

      // Update proposal's review status if all reviews are complete
      const allReviews = await Review.find({
        proposal: review.proposal,
        reviewType: { $ne: 'reconciliation' }, // Exclude reconciliation reviews for initial check
      });

      const allCompleted = allReviews.every(
        (r) => r.status === ReviewStatus.COMPLETED
      );

      if (allCompleted) {
        // Check for discrepancies
        const totalScores = allReviews.map((r) => r.totalScore);
        const avgScore =
          totalScores.reduce((sum, score) => sum + score, 0) /
          totalScores.length;
        const discrepancyThreshold = avgScore * 0.2;
        const hasDiscrepancy = totalScores.some(
          (score) => Math.abs(score - avgScore) > discrepancyThreshold
        );

        // If there's no discrepancy, mark proposal as reviewed
        if (!hasDiscrepancy) {
          const proposal = await Proposal.findById(review.proposal);
          if (proposal) {
            proposal.reviewStatus = 'reviewed';
            await proposal.save();

            // Create preliminary award record
            const award = new Award({
              proposal: proposal._id,
              submitter: proposal.submitter,
              finalScore: avgScore,
              status: AwardStatus.PENDING,
              fundingAmount: proposal.estimatedBudget || 0, // Start with requested amount
              feedbackComments:
                'Your proposal has been reviewed. Final decision pending.',
            });

            await award.save();
          }
        } else {
          // If there's a discrepancy, initiate reconciliation process
          logger.info(
            `Discrepancy detected for proposal ${review.proposal}. Initiating reconciliation.`
          );
          // This will be handled by a separate process
        }
      }

      // Notify user of successful submission
      res.status(200).json({
        success: true,
        message: 'Review submitted successfully',
        data: { review },
      });
    }
  );

  getProposalForReview = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;
      const reviewerId = req.user.id;

      // Check if reviewer is assigned to this proposal
      const reviewAssignment = await Review.findOne({
        proposal: proposalId,
        reviewer: reviewerId,
        reviewType: { $ne: 'ai' }, // Exclude AI reviews
      });

      if (!reviewAssignment) {
        throw new NotFoundError('You are not assigned to review this proposal');
      }

      // Get proposal details
      const proposal = await Proposal.findById(proposalId).select(
        '-submitter -coInvestigators.name -cvFile'
      ); // Exclude identifying information

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      res.status(200).json({
        success: true,
        data: {
          proposal,
          reviewAssignment,
        },
      });
    }
  );

  // Dashboard statistics for reviewers
  getReviewerStatistics = asyncHandler(
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const reviewerId = req.user.id;

      const [totalAssigned, completed, pending, overdue] = await Promise.all([
        Review.countDocuments({ reviewer: reviewerId }),
        Review.countDocuments({
          reviewer: reviewerId,
          status: ReviewStatus.COMPLETED,
        }),
        Review.countDocuments({
          reviewer: reviewerId,
          status: ReviewStatus.IN_PROGRESS,
          dueDate: { $gt: new Date() },
        }),
        Review.countDocuments({
          reviewer: reviewerId,
          status: ReviewStatus.IN_PROGRESS,
          dueDate: { $lte: new Date() },
        }),
      ]);

      // Get recent activity
      const recentActivity = await Review.find({ reviewer: reviewerId })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('proposal', 'projectTitle');

      res.status(200).json({
        success: true,
        data: {
          statistics: {
            totalAssigned,
            completed,
            pending,
            overdue,
          },
          recentActivity,
        },
      });
    }
  );

  // Update review before final submission (save progress)
  saveReviewProgress = asyncHandler(
    async (
      req: Request<{ id: string }, {}, Partial<ISubmitReviewRequest>>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { id } = req.params;
      const reviewerId = req.user.id;
      const { scores, comments } = req.body;

      const review = await Review.findOne({
        _id: id,
        reviewer: reviewerId,
        status: ReviewStatus.IN_PROGRESS,
      });

      if (!review) {
        throw new NotFoundError('Review not found or cannot be updated');
      }

      // Update only provided fields
      if (scores) {
        review.scores = { ...review.scores.toObject(), ...scores };
      }

      if (comments) {
        review.comments = { ...(review.comments || {}), ...comments };
      }

      await review.save();

      res.status(200).json({
        success: true,
        message: 'Review progress saved',
        data: review,
      });
    }
  );
}
