/* eslint-disable max-lines */
import { Request, Response } from 'express';
import User, { UserRole, IUser } from '../../model/user.model';
import Proposal, {
  IProposal,
} from '../../Proposal_Submission/models/proposal.model';
import Review, {
  ReviewStatus,
  ReviewType,
  IReview,
} from '../models/review.model';
import Faculty from '../../Proposal_Submission/models/faculty.model';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import { NotFoundError } from '../../utils/customErrors';
import mongoose, { Types, Document } from 'mongoose';

interface IAssignReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

// Define interface for populated review
interface PopulatedReview extends IReview {
  reviewer?: {
    email: string;
    name: string;
    _id?: Types.ObjectId;
  };
  proposal?: {
    projectTitle: string;
    _id?: Types.ObjectId;
  };
  dueDate: Date;
  _id: Types.ObjectId;
  status: ReviewStatus;
  save(): Promise<PopulatedReview>;
}

class AssignReviewController {
  // Assign proposal to reviewers based on review clusters
  assignReviewers = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IAssignReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      // Find the proposal
      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'faculty department',
        populate: [
          { path: 'faculty', select: 'title code' },
          { path: 'department', select: 'title code' },
        ],
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Get submitter's faculty information
      const submitterFaculty = proposal.submitter.faculty;
      if (!submitterFaculty) {
        logger.error(`Faculty information missing for proposal ${proposalId}`);
        res.status(400).json({
          success: false,
          message:
            'Cannot assign reviewers: Faculty information is missing for the proposal submitter',
        });
        return;
      }

      // Determine appropriate reviewer faculty based on review clusters
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

      const submitterFacultyTitle =
        typeof submitterFaculty === 'string'
          ? submitterFaculty
          : submitterFaculty.title;

      const eligibleFaculties = clusterMap[submitterFacultyTitle] || [];

      if (eligibleFaculties.length === 0) {
        logger.error(
          `No eligible faculties found for ${submitterFacultyTitle}`
        );
        res.status(400).json({
          success: false,
          message:
            "Cannot assign reviewers: No eligible faculties found for the proposal's cluster",
        });
        return;
      }

      // Find reviewers from eligible faculties with the least current assignments
      const facultyCodes = await Faculty.find({
        title: { $in: eligibleFaculties },
      }).select('code');

      const facultyCodeList = facultyCodes.map((f) => f.code);

      const facultyIds = await Faculty.find({
        title: { $in: eligibleFaculties },
      }).select('_id'); // Get ObjectIds instead of codes

      const facultyIdList = facultyIds.map((f) => f._id);

      // Find eligible reviewers and sort by current workload
      const eligibleReviewers = await User.aggregate([
        {
          $match: {
            faculty: { $in: facultyIdList },
            role: UserRole.REVIEWER,
            isActive: true,
            invitationStatus: { $in: ['accepted', 'added'] },
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
          $limit: 2, // Select top 2 reviewers with least workload
        },
      ]);

      if (eligibleReviewers.length < 2) {
        logger.error(
          `Not enough eligible reviewers found for proposal ${proposalId}`
        );
        res.status(400).json({
          success: false,
          message:
            'Cannot assign reviewers: Not enough eligible reviewers available',
        });
        return;
      }

      // Calculate due date (5 business days from now)
      const dueDate = calculateDueDate(5);

      // Create review assignments for the selected reviewers
      const reviewPromises = eligibleReviewers.map((reviewer) => {
        const review = new Review({
          proposal: proposalId,
          reviewer: reviewer._id,
          reviewType: ReviewType.HUMAN,
          status: ReviewStatus.IN_PROGRESS,
          dueDate,
        });
        return review.save();
      });

      // Create AI review assignment as well
      const aiReview = new Review({
        proposal: proposalId,
        reviewer: null, // null for AI review
        reviewType: ReviewType.AI,
        status: ReviewStatus.IN_PROGRESS,
        dueDate: new Date(), // AI review due immediately
      });
      reviewPromises.push(aiReview.save());

      // Execute all assignments
      const reviews = await Promise.all(reviewPromises);

      // Update proposal status to under review
      proposal.status = 'under_review';
      proposal.reviewStatus = 'pending';
      await proposal.save();

      // Notify reviewers about their assignments
      try {
        for (const reviewer of eligibleReviewers) {
          await emailService.sendReviewAssignmentEmail(
            reviewer.email,
            reviewer.name,
            proposal.projectTitle || 'Research Proposal',
            dueDate
          );
        }
      } catch (error) {
        logger.error(
          'Failed to send reviewer notification emails:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Continue execution even if emails fail
      }

      // Generate AI review scores immediately using the placeholder service
      const aiReviewId = reviews.find(
        (r) => r.reviewType === ReviewType.AI
      )?._id;
      if (aiReviewId) {
        await this.generateAIReview(aiReviewId.toString());
      }

      logger.info(
        `Assigned proposal ${proposalId} to ${eligibleReviewers.length} reviewers and AI`
      );

      res.status(200).json({
        success: true,
        message: `Proposal assigned to ${eligibleReviewers.length} reviewers successfully`,
        data: {
          reviewers: eligibleReviewers.map((r) => ({
            id: r._id,
            name: r.name,
            email: r.email,
            faculty: r.facultyId,
          })),
          aiReview: aiReview._id,
          dueDate,
        },
      });
    }
  );

  // Generate AI review using placeholder implementation
  generateAIReview = async (reviewId: string): Promise<void> => {
    const review = await Review.findById(reviewId).populate('proposal');
    if (!review || review.reviewType !== ReviewType.AI) {
      throw new NotFoundError('AI Review not found');
    }

    const proposal = review.proposal;

    // Use placeholder AI scoring function
    const aiScores = this.generateAIScore();

    // Update review with AI scores
    review.scores = aiScores.scores;
    review.comments = aiScores.explanations;
    review.status = ReviewStatus.COMPLETED;
    review.completedAt = new Date();

    await review.save();

    logger.info(`Generated AI review for proposal ${proposal._id}`);
  };

  // Generate placeholder AI scores
  private generateAIScore() {
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
    const scores: any = {};
    Object.keys(baseScores).forEach((criterion) => {
      const variation = Math.random() * 0.4 - 0.2; // -20% to +20%
      const baseScore = baseScores[criterion as keyof typeof baseScores];
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

    return {
      scores,
      explanations,
      totalScore: Object.values(scores)
        .map(Number)
        .reduce((sum: number, score: number) => sum + score, 0),
    };
  }

  // Check for overdue reviews and send reminder notifications
  checkOverdueReviews = asyncHandler(
    async (
      req: Request,
      res: Response<IAssignReviewResponse>
    ): Promise<void> => {
      const today = new Date();
      const twoDaysFromNow = new Date(today);
      twoDaysFromNow.setDate(today.getDate() + 2);

      // Find reviews approaching deadline (due in 2 days)
      const approachingDeadlineReviews = await Review.find({
        status: ReviewStatus.IN_PROGRESS,
        reviewType: ReviewType.HUMAN,
        dueDate: { $lte: twoDaysFromNow, $gt: today },
      }).populate<{
        reviewer: Pick<IUser, 'email' | 'name'>;
        proposal: Pick<IProposal, 'projectTitle'>;
      }>([
        { path: 'reviewer', select: 'email name' },
        { path: 'proposal', select: 'projectTitle' },
      ]);
      // Find overdue reviews
      const overdueReviews = await Review.find({
        status: ReviewStatus.IN_PROGRESS,
        reviewType: ReviewType.HUMAN,
        dueDate: { $lt: today },
      }).populate<{
        reviewer: Pick<IUser, 'email' | 'name'>;
        proposal: Pick<IProposal, 'projectTitle'>;
      }>([
        { path: 'reviewer', select: 'email name' },
        { path: 'proposal', select: 'projectTitle' },
      ]);

      // Send reminders for approaching deadlines
      for (const review of approachingDeadlineReviews as PopulatedReview[]) {
        if (review.reviewer && review.proposal) {
          try {
            const reviewer = review.reviewer;
            await emailService.sendReviewReminderEmail(
              reviewer.email,
              reviewer.name,
              review.proposal?.projectTitle || 'Research Proposal',
              review.dueDate
            );
            logger.info(
              `Sent deadline reminder to reviewer ${reviewer._id} for review ${review._id}`
            );
          } catch (error) {
            logger.error(
              `Failed to send reminder email for review ${review._id}:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      }

      // Mark overdue reviews and notify
      for (const review of overdueReviews as PopulatedReview[]) {
        review.status = ReviewStatus.OVERDUE;
        await review.save();

        if (review.reviewer && review.proposal) {
          try {
            const reviewer = review.reviewer;
            await emailService.sendOverdueReviewNotification(
              reviewer.email,
              reviewer.name,
              review.proposal.projectTitle || 'Research Proposal'
            );
            logger.info(
              `Marked review ${review._id} as overdue and notified reviewer ${reviewer._id}`
            );
          } catch (error) {
            logger.error(
              `Failed to send overdue notification for review ${review._id}:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      }

      res.status(200).json({
        success: true,
        message: 'Review deadline check completed',
        data: {
          approachingDeadline: approachingDeadlineReviews.length,
          overdue: overdueReviews.length,
        },
      });
    }
  );

  // Detect discrepancies between reviews and assign reconciliation if needed
  checkReviewDiscrepancies = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IAssignReviewResponse>
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
              invitationStatus: 'accepted',
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
        const dueDate = calculateDueDate(5);
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
}

// Helper function to calculate due date (X business days from now)
function calculateDueDate(businessDays: number): Date {
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

export default new AssignReviewController();
