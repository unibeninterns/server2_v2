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
import agenda from '../../config/agenda'; // Import the agenda instance
import { Types } from 'mongoose';

interface IAssignReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

// Define interface for populated review
interface PopulatedReview extends Omit<IReview, 'proposal' | 'reviewer'> {
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
  save(): Promise<IReview>;
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
      const submitter = proposal.submitter as any;
      const submitterFaculty = submitter.faculty;
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

      type FacultyTitle = keyof typeof clusterMap;

      const submitterFacultyTitle: FacultyTitle =
        typeof submitterFaculty === 'string'
          ? submitterFaculty
          : (submitterFaculty as any).title;

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
            proposal.projectTitle || 'Research Proposal',
            reviewer.name,
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

      // Dispatch AI review generation job to Agenda
      if (proposal && proposal._id) {
        await agenda.now('generate AI review', { proposalId: proposal._id.toString() });
        logger.info(`Dispatched AI review job for proposal ${proposal._id} to Agenda`);
      } else {
        logger.warn('Could not dispatch AI review job due to missing proposal information');
      }


      logger.info(
        `Assigned proposal ${proposalId} to ${eligibleReviewers.length} human reviewers and dispatched AI review job`
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
