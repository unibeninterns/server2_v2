import { Request, Response } from 'express';
import Review, {
  IScore,
  ReviewStatus,
  ReviewType,
} from '../models/review.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';

interface IReviewResponse {
  success: boolean;
  count?: number;
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

interface ResearcherAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

// Add this interface near your other interfaces
interface GetReviewRequest extends ResearcherAuthenticatedRequest {
  params: {
    id: string;
  };
}

interface GetProposalReviewRequest extends ResearcherAuthenticatedRequest {
  params: {
    proposalId: string;
  };
}

// Add this interface near your other interfaces
interface SubmitReviewRequest extends ResearcherAuthenticatedRequest {
  body: ISubmitReviewRequest;
  params: {
    id: string;
  };
}

// Add this interface near your other interfaces
interface SaveReviewProgressRequest extends ResearcherAuthenticatedRequest {
  body: Partial<ISubmitReviewRequest>;
  params: {
    id: string;
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
    async (
      req: GetReviewRequest,
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
    async (
      req: SubmitReviewRequest,
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
            const reconciliationController =
              require('../controllers/reconciliation.controller').default;
            await reconciliationController.processReconciliationReview(
              { params: { reviewId: id } },
              res
            );
            return; // End execution since reconciliation controller has already sent response
          }
        } else {
          // No reconciliation exists, check if one is needed by using the reconciliation controller
          try {
            const reconciliationController =
              require('../controllers/reconciliation.controller').default;
            await reconciliationController.checkReviewDiscrepancies(
              { params: { proposalId: review.proposal.toString() } },
              {
                status: () => ({ json: () => {} }),
                json: () => {},
              } as unknown as Response
            );

            // Check again if reconciliation was created
            const reconciliationCreated = await Review.findOne({
              proposal: review.proposal,
              reviewType: ReviewType.RECONCILIATION,
            });

            // If no reconciliation was needed or created, finalize the proposal
            if (!reconciliationCreated) {
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
  generateDiscrepancyAnalysis = async (proposalId: string) => {
    try {
      const reconciliationController =
        require('../controllers/reconciliation.controller').default;

      // Create a mock response object to capture the result
      const mockRes = {
        status: () => mockRes,
        json: (data: any) => {
          return data;
        },
      };

      // Execute the discrepancy analysis
      const result = await reconciliationController.getDiscrepancyDetails(
        { params: { proposalId } },
        mockRes as any
      );

      return (
        result?.data || { criteriaDiscrepancies: [], overallDiscrepancy: {} }
      );
    } catch (error) {
      logger.error(
        `Error generating discrepancy analysis: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { criteriaDiscrepancies: [], overallDiscrepancy: {} };
    }
  };

  getProposalForReview = asyncHandler(
    async (
      req: GetProposalReviewRequest,
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
    async (
      req: SaveReviewProgressRequest,
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
        review.scores = { ...review.scores, ...scores };
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

export default new ReviewController();
