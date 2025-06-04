import { Request, Response } from 'express';
import Review, { ReviewStatus, ReviewType } from '../models/review.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import reconciliationController from '../controllers/reconciliation.controller';
import mongoose from 'mongoose';

interface IReviewResponse {
  success: boolean;
  count?: number;
  message?: string;
  data?: any;
}

interface ResearcherAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

interface GetProposalReviewRequest extends ResearcherAuthenticatedRequest {
  params: {
    proposalId: string;
  };
}

class ReviewController {
  // Get reviews assigned to a specific reviewer
  getReviewerAssignments = asyncHandler(
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;
      const reviewerId = user.id; // Assuming auth middleware sets this

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
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;
      const { id } = req.params;
      const reviewerId = user.id; // From auth middleware

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

      const responseData: any = { review };

      // Check if this is a reconciliation review and include discrepancy information
      if (review.reviewType === ReviewType.RECONCILIATION) {
        try {
          // Get the conflicting reviews (human and AI) for this proposal
          const conflictingReviews = await Review.find({
            proposal: review.proposal,
            reviewType: { $ne: ReviewType.RECONCILIATION },
            status: ReviewStatus.COMPLETED,
          }).select('reviewType scores totalScore comments createdAt');

          // Anonymize the reviews - don't reveal which is human vs AI
          const anonymizedReviews = conflictingReviews.map(
            (conflictReview, index) => ({
              reviewId: `Review ${index + 1}`, // Anonymous identifier
              scores: conflictReview.scores,
              totalScore: conflictReview.totalScore,
              comments: conflictReview.comments,
              submittedAt: conflictReview.createdAt,
              // Don't include reviewType or reviewer information
            })
          );

          // Calculate discrepancy details
          const discrepancyDetails = await this.generateDiscrepancyAnalysis(
            review.proposal._id || review.proposal.toString()
          );

          responseData.discrepancyInfo = {
            message:
              'This proposal has been flagged for discrepancy resolution due to significant differences in review scores.',
            conflictingReviews: anonymizedReviews,
            discrepancyAnalysis: {
              overallScoreRange: {
                highest: discrepancyDetails.overallDiscrepancy.max,
                lowest: discrepancyDetails.overallDiscrepancy.min,
                average:
                  Math.round(discrepancyDetails.overallDiscrepancy.avg * 10) /
                  10,
                percentageDifference:
                  Math.round(
                    discrepancyDetails.overallDiscrepancy.percentDifference * 10
                  ) / 10,
              },
              criteriaWithHighestDiscrepancy:
                discrepancyDetails.criteriaDiscrepancies
                  .slice(0, 3) // Top 3 criteria with highest discrepancy
                  .map((criteria: any) => ({
                    criterion: this.formatCriteriaName(criteria.criterion),
                    scores: criteria.scores,
                    averageScore: Math.round(criteria.avg * 10) / 10,
                    percentageDifference:
                      Math.round(criteria.percentDifference * 10) / 10,
                  })),
            },
            reconciliationGuidance: {
              purpose:
                'Your role is to provide an independent assessment that will help determine the final score for this proposal.',
              instruction:
                // eslint-disable-next-line max-len
                'Please review the proposal thoroughly and provide your own independent scoring based on the evaluation criteria. Consider the existing reviews as reference points, but make your own judgment.',
              weightage:
                'Your reconciliation review will carry 60% weight, while the average of existing reviews will carry 40% weight in the final score calculation.',
            },
          };
        } catch (error) {
          logger.error(
            `Error retrieving discrepancy information for review ${id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          // Don't fail the entire request if discrepancy info can't be retrieved
          responseData.discrepancyInfo = {
            message:
              'This is a reconciliation review, but detailed discrepancy information is currently unavailable.',
          };
        }
      }

      res.status(200).json({
        success: true,
        data: responseData,
      });
    }
  );

  // Helper method to format criteria names for better readability
  private formatCriteriaName(criteriaKey: string): string {
    const criteriaLabels: { [key: string]: string } = {
      relevanceToNationalPriorities: 'Relevance to National Priorities',
      originalityAndInnovation: 'Originality and Innovation',
      clarityOfResearchProblem: 'Clarity of Research Problem',
      methodology: 'Methodology',
      literatureReview: 'Literature Review',
      teamComposition: 'Team Composition',
      feasibilityAndTimeline: 'Feasibility and Timeline',
      budgetJustification: 'Budget Justification',
      expectedOutcomes: 'Expected Outcomes',
      sustainabilityAndScalability: 'Sustainability and Scalability',
    };

    return criteriaLabels[criteriaKey] || criteriaKey;
  }

  // Get all reviews for a specific proposal (admin only)
  getProposalReviews = asyncHandler(
    async (
      req: GetProposalReviewRequest,
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
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;
      const { id } = req.params;
      const reviewerId = user.id; // From auth middleware
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

      // Get all reviews for this proposal (excluding reconciliation reviews for initial check)
      const allReviews = await Review.find({
        proposal: review.proposal,
        reviewType: { $ne: ReviewType.RECONCILIATION },
      });

      const allCompleted = allReviews.every(
        (r) => r.status === ReviewStatus.COMPLETED
      );

      // Generate discrepancy analysis regardless of completion status
      // This will be used both for logging and determining if reconciliation is needed
      const discrepancyDetails = await this.generateDiscrepancyAnalysis(
        review.proposal.toString()
      );

      if (allCompleted) {
        // Check if there's an ongoing reconciliation review
        const existingReconciliation = await Review.findOne({
          proposal: review.proposal,
          reviewType: ReviewType.RECONCILIATION,
        });

        if (existingReconciliation) {
          // If this is a reconciliation review, process it
          if (review.reviewType === ReviewType.RECONCILIATION) {
            // Import and use reconciliation controller to process reconciliation
            // Import and use reconciliation controller to process reconciliation
            // Assuming reconciliationController is imported at the top of the file
            const reconciliationResult =
              await reconciliationController.processReconciliationReview(id);
            // The reconciliation controller now handles sending the response internally
            // We just need to ensure the process completes.
            // If it returns a result, we can use it for logging or further processing.
            if (reconciliationResult) {
              logger.info(
                `Reconciliation review processed for proposal ${reconciliationResult.proposal}`
              );
              // Since the reconciliation controller sends the response, we return here.
              // If it didn't send a response, we would construct one.
              res.status(200).json({
                success: true,
                message: 'Reconciliation review processed successfully',
                data: reconciliationResult,
              });
            } else {
              res.status(500).json({
                success: false,
                message: 'Failed to process reconciliation review',
              });
            }
            return;
          }
        } else {
          // No reconciliation exists, check if one is needed by using the reconciliation controller
          try {
            const reconciliationCreated =
              await reconciliationController.checkReviewDiscrepancies(
                review.proposal.toString()
              );

            // If no reconciliation was needed or created, finalize the proposal
            if (!reconciliationCreated.hasDiscrepancy) {
              const proposal = await Proposal.findById(review.proposal);
              if (proposal) {
                proposal.reviewStatus = 'reviewed';
                await proposal.save();

                // Create preliminary award record
                const award = new Award({
                  proposal: proposal._id,
                  submitter: proposal.submitter,
                  finalScore: discrepancyDetails.overallDiscrepancy.avg,
                  status: AwardStatus.PENDING,
                  fundingAmount: proposal.estimatedBudget || 0,
                  feedbackComments:
                    'Your proposal has been reviewed. Final decision pending.',
                });

                await award.save();
              }
            } else {
              logger.info(
                `Reconciliation process initiated for proposal ${review.proposal}`
              );
            }
          } catch (error) {
            logger.error(
              `Error checking for discrepancies: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      // Notify user of successful submission
      res.status(200).json({
        success: true,
        message: 'Review submitted successfully',
        data: {
          review,
          discrepancyAnalysis: discrepancyDetails,
        },
      });
    }
  );

  // Helper method to generate discrepancy analysis for a proposal
  generateDiscrepancyAnalysis = async (
    proposalId: string | mongoose.Types.ObjectId
  ) => {
    try {
      // Ensure we're working with just the ObjectId string
      const proposalIdStr =
        typeof proposalId === 'object' && proposalId !== null
          ? (proposalId as any).toString()
          : proposalId.split('{')[0].trim(); // Extract just the ID if it's a string containing object data

      // Execute the discrepancy analysis
      const result =
        await reconciliationController.getDiscrepancyDetails(proposalIdStr);

      return result || { criteriaDiscrepancies: [], overallDiscrepancy: {} }; // The refactored method returns the data directly
    } catch (error) {
      logger.error(
        `Error generating discrepancy analysis: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { criteriaDiscrepancies: [], overallDiscrepancy: {} };
    }
  };

  // Dashboard statistics for reviewers
  getReviewerStatistics = asyncHandler(
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;
      const reviewerId = user.id;

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
    async (req: Request, res: Response<IReviewResponse>): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;
      const { id } = req.params;
      const reviewerId = user.id;
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
        review.scores = { ...review.scores, ...scores };
      }

      if (comments) {
        review.comments = comments;
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

export default new ReviewController();
