/* eslint-disable max-lines */
import { Request, Response } from 'express';
import Review, {
  IReview,
  ReviewStatus,
  ReviewType,
  IScore,
} from '../models/review.model';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import User, { UserRole } from '../../model/user.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import mongoose, { Types } from 'mongoose';
import Faculty from '../../Proposal_Submission/models/faculty.model';

interface IReconciliationResponse {
  success: boolean;
  message?: string;
  data?: any;
}

class ReconciliationController {
  // Check for discrepancies between reviews and assign reconciliation if needed
  checkReviewDiscrepancies = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      // Find all completed reviews for this proposal
      const reviews = await Review.find({
        proposal: proposalId,
        status: ReviewStatus.COMPLETED,
      });

      // Need at least 2 reviews (typically 2 human reviews + 1 AI) to check for discrepancies
      if (reviews.length < 2) {
        res.status(400).json({
          success: false,
          message: 'Not enough completed reviews to check for discrepancies',
        });
        return;
      }

      // Calculate average score and check for significant discrepancies
      const totalScores = reviews.map((r) => r.totalScore);
      const avgScore =
        totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;

      // Check if any score differs from average by more than 20%
      const discrepancyThreshold = avgScore * 0.2;
      const hasDiscrepancy = totalScores.some(
        (score) => Math.abs(score - avgScore) > discrepancyThreshold
      );

      // If there's a significant discrepancy, assign a reconciliation reviewer
      if (hasDiscrepancy) {
        // Find a reviewer who hasn't reviewed this proposal already
        const existingReviewerIds = reviews
          .filter((r) => r.reviewType === ReviewType.HUMAN)
          .map((r) => r.reviewer?.toString());

        // Get submitter's faculty information to find reviewers from the same cluster
        const proposal = await Proposal.findById(proposalId).populate({
          path: 'submitter',
          select: 'faculty',
          populate: { path: 'faculty', select: 'title code' },
        });

        if (!proposal) {
          throw new NotFoundError('Proposal not found');
        }

        const submitterFaculty = (proposal.submitter as any).faculty;
        if (!submitterFaculty) {
          logger.error(
            `Faculty information missing for proposal ${proposalId}`
          );
          res.status(400).json({
            success: false,
            message:
              'Cannot assign reconciliation: Faculty information is missing',
          });
          return;
        }

        const submitterFacultyTitle =
          typeof submitterFaculty === 'string'
            ? submitterFaculty
            : submitterFaculty.title;

        // Use the same cluster logic as in assignReviewers
        const clusterMap = {
          // Cluster 1
          'Faculty of Agriculture': [
            'Faculty of Life Sciences',
            'Faculty of Veterinary Medicine',
          ],
          'Faculty of Life Sciences': [
            'Faculty of Agriculture',
            'Faculty of Veterinary Medicine',
          ],
          'Faculty of Veterinary Medicine': [
            'Faculty of Agriculture',
            'Faculty of Life Sciences',
          ],

          // Cluster 2
          'Faculty of Pharmacy': [
            'Faculty of Dentistry',
            'Faculty of Medicine',
            'Faculty of Basic Medical Sciences',
          ],
          'Faculty of Dentistry': [
            'Faculty of Pharmacy',
            'Faculty of Medicine',
            'Faculty of Basic Medical Sciences',
          ],
          'Faculty of Medicine': [
            'Faculty of Pharmacy',
            'Faculty of Dentistry',
            'Faculty of Basic Medical Sciences',
          ],
          'Faculty of Basic Medical Sciences': [
            'Faculty of Pharmacy',
            'Faculty of Dentistry',
            'Faculty of Medicine',
          ],

          // Cluster 3
          'Faculty of Management Sciences': [
            'Faculty of Education',
            'Faculty of Social Sciences',
            'Faculty of Vocational Education',
          ],
          'Faculty of Education': [
            'Faculty of Management Sciences',
            'Faculty of Social Sciences',
            'Faculty of Vocational Education',
          ],
          'Faculty of Social Sciences': [
            'Faculty of Management Sciences',
            'Faculty of Education',
            'Faculty of Vocational Education',
          ],
          'Faculty of Vocational Education': [
            'Faculty of Management Sciences',
            'Faculty of Education',
            'Faculty of Social Sciences',
          ],

          // Cluster 4
          'Faculty of Law': ['Faculty of Arts', 'Institute of Education'],
          'Faculty of Arts': ['Faculty of Law', 'Institute of Education'],
          'Institute of Education': ['Faculty of Law', 'Faculty of Arts'],

          // Cluster 5
          'Faculty of Engineering': [
            'Faculty of Physical Sciences',
            'Faculty of Environmental Sciences',
          ],
          'Faculty of Physical Sciences': [
            'Faculty of Engineering',
            'Faculty of Environmental Sciences',
          ],
          'Faculty of Environmental Sciences': [
            'Faculty of Engineering',
            'Faculty of Physical Sciences',
          ],
        };

        const eligibleFaculties =
          clusterMap[submitterFacultyTitle as keyof typeof clusterMap] || [];

        if (eligibleFaculties.length === 0) {
          logger.error(
            `No eligible faculties found for ${submitterFacultyTitle}`
          );
          res.status(400).json({
            success: false,
            message:
              "Cannot assign reconciliation: No eligible faculties found for the proposal's cluster",
          });
          return;
        }

        // Find reviewers from eligible faculties with the least current assignments
        const facultyIds = await Faculty.find({
          title: { $in: eligibleFaculties },
        }).select('_id'); // Get ObjectIds instead of codes

        const facultyIdList = facultyIds.map((f) => f._id);

        // Find eligible reconciliation reviewer
        const eligibleReviewer = await User.aggregate([
          {
            $match: {
              faculty: { $in: facultyIdList },
              role: UserRole.REVIEWER, // Add role filter
              isActive: true,
              invitationStatus: { $in: ['accepted', 'added'] },
              _id: {
                $nin: existingReviewerIds.map(
                  (id) => new mongoose.Types.ObjectId(id)
                ),
              },
            },
          },
          {
            $lookup: {
              from: 'Reviews',
              localField: '_id',
              foreignField: 'reviewer',
              as: 'activeReviews',
            },
          },
          {
            $addFields: {
              pendingReviewsCount: {
                $size: {
                  $filter: {
                    input: '$activeReviews',
                    as: 'review',
                    cond: { $ne: ['$$review.status', 'completed'] },
                  },
                },
              },
              discrepancyCount: {
                $size: {
                  $filter: {
                    input: '$activeReviews',
                    as: 'review',
                    cond: { $eq: ['$$review.reviewType', 'reconciliation'] },
                  },
                },
              },
            },
          },
          {
            $sort: {
              discrepancyCount: 1,
              pendingReviewsCount: 1,
            },
          },
          {
            $limit: 1,
          },
        ]);

        if (eligibleReviewer.length === 0) {
          logger.error(
            `No eligible reconciliation reviewer found for proposal ${proposalId}`
          );
          res.status(400).json({
            success: false,
            message:
              'Cannot assign reconciliation: No eligible reviewers available',
          });
          return;
        }

        // Create reconciliation review assignment
        const dueDate = this.calculateDueDate(5);
        const reconciliationReview = new Review({
          proposal: proposalId,
          reviewer: eligibleReviewer[0]._id,
          reviewType: ReviewType.RECONCILIATION,
          status: ReviewStatus.IN_PROGRESS,
          dueDate,
        });

        await reconciliationReview.save();

        // Notify reconciliation reviewer
        try {
          await emailService.sendReconciliationAssignmentEmail(
            eligibleReviewer[0].email,
            eligibleReviewer[0].name,
            proposal.projectTitle || 'Research Proposal',
            dueDate,
            reviews.length,
            Math.round(avgScore * 10) / 10, // Round to 1 decimal place
            totalScores
          );
        } catch (error) {
          logger.error(
            'Failed to send reconciliation assignment email:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }

        logger.info(
          `Assigned reconciliation review for proposal ${proposalId} to reviewer ${eligibleReviewer[0]._id}`
        );

        res.status(200).json({
          success: true,
          message:
            'Reconciliation review assigned successfully due to scoring discrepancies',
          data: {
            scores: totalScores,
            averageScore: avgScore,
            discrepancyThreshold,
            reconciliationReviewer: {
              id: eligibleReviewer[0]._id,
              name: eligibleReviewer[0].name,
            },
            dueDate,
          },
        });
      } else {
        // No significant discrepancies
        logger.info(
          `No significant discrepancies found for proposal ${proposalId}`
        );

        res.status(200).json({
          success: true,
          message: 'No significant discrepancies found between reviews',
          data: {
            scores: totalScores,
            averageScore: avgScore,
            discrepancyThreshold,
          },
        });
      }
    }
  );

  // Process completed reconciliation review
  processReconciliationReview = asyncHandler(
    async (
      req: Request<{ reviewId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { reviewId } = req.params;

      const reconciliationReview =
        await Review.findById(reviewId).populate('proposal');

      if (
        !reconciliationReview ||
        reconciliationReview.reviewType !== ReviewType.RECONCILIATION
      ) {
        throw new NotFoundError('Reconciliation review not found');
      }

      if (reconciliationReview.status !== ReviewStatus.COMPLETED) {
        throw new BadRequestError('Reconciliation review is not yet completed');
      }

      // Get all reviews for this proposal
      const allReviews = await Review.find({
        proposal: reconciliationReview.proposal,
      });

      // Calculate final score with reconciliation review weighted higher
      const regularReviews = allReviews.filter(
        (r) => r.reviewType !== ReviewType.RECONCILIATION
      );
      const regularAvg =
        regularReviews.reduce((sum, r) => sum + r.totalScore, 0) /
        regularReviews.length;

      // Final score: 60% reconciliation review + 40% average of regular reviews
      const finalScore =
        reconciliationReview.totalScore * 0.6 + regularAvg * 0.4;

      // Update proposal status
      const proposal = await Proposal.findById(reconciliationReview.proposal);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      proposal.reviewStatus = 'reviewed';
      await proposal.save();

      // Create or update award record
      let award = await Award.findOne({ proposal: proposal._id });

      if (award) {
        award.finalScore = finalScore;
        award.feedbackComments =
          'Your proposal has been reviewed after reconciliation. Final decision pending.';
      } else {
        award = new Award({
          proposal: proposal._id,
          submitter: proposal.submitter,
          finalScore: finalScore,
          status: AwardStatus.PENDING,
          fundingAmount: proposal.estimatedBudget || 0,
          feedbackComments:
            'Your proposal has been reviewed after reconciliation. Final decision pending.',
        });
      }

      await award.save();

      res.status(200).json({
        success: true,
        message: 'Reconciliation review processed successfully',
        data: {
          proposal: proposal._id,
          finalScore,
          award: award._id,
        },
      });
    }
  );

  // Get review discrepancy details for a specific proposal
  getDiscrepancyDetails = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      const reviews = await Review.find({
        proposal: proposalId,
        reviewType: { $ne: ReviewType.RECONCILIATION },
      }).populate('reviewer', 'name email faculty department');

      if (reviews.length < 2) {
        throw new BadRequestError(
          'Not enough reviews for discrepancy analysis'
        );
      }

      // Calculate discrepancy for each criterion
      const criteriaNames = [
        'relevanceToNationalPriorities',
        'originalityAndInnovation',
        'clarityOfResearchProblem',
        'methodology',
        'literatureReview',
        'teamComposition',
        'feasibilityAndTimeline',
        'budgetJustification',
        'expectedOutcomes',
        'sustainabilityAndScalability',
      ];

      const discrepancyAnalysis = criteriaNames.map((criterion) => {
        const scores = reviews.map(
          (r) => r.scores[criterion as keyof typeof r.scores] as number
        );
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        const avg =
          scores.reduce((sum, score) => sum + score, 0) / scores.length;

        return {
          criterion,
          scores,
          max,
          min,
          avg,
          variance: Math.pow(max - min, 2) / avg, // Simple variance measure
          percentDifference: ((max - min) / avg) * 100,
        };
      });

      // Sort by highest discrepancy
      discrepancyAnalysis.sort(
        (a, b) => b.percentDifference - a.percentDifference
      );

      // Calculate overall score discrepancy
      const totalScores = reviews.map((r) => r.totalScore);
      const maxTotal = Math.max(...totalScores);
      const minTotal = Math.min(...totalScores);
      const avgTotal =
        totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;

      const overallDiscrepancy = {
        scores: totalScores,
        max: maxTotal,
        min: minTotal,
        avg: avgTotal,
        variance: Math.pow(maxTotal - minTotal, 2) / avgTotal,
        percentDifference: ((maxTotal - minTotal) / avgTotal) * 100,
      };

      res.status(200).json({
        success: true,
        data: {
          reviews: reviews.map((r) => ({
            id: r._id,
            reviewer: r.reviewer,
            scores: r.scores,
            totalScore: r.totalScore,
          })),
          criteriaDiscrepancies: discrepancyAnalysis,
          overallDiscrepancy,
        },
      });
    }
  );

  // Helper function to calculate due date (X business days from now)
  private calculateDueDate(businessDays: number): Date {
    const date = new Date();
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      date.setDate(date.getDate() + 1);
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        daysAdded++;
      }
    }

    return date;
  }
}

export default new ReconciliationController();
