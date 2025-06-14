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
import agenda from '../../config/agenda'; // Import the agenda instance
import { Types } from 'mongoose';

interface IAssignReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

// Define interface for reviewers with aggregated counts
interface IReviewerWithCounts extends IUser {
  pendingReviewsCount: number;
  discrepancyCount: number;
  totalReviewsCount: number; // Added for the new requirement
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
  // Updated assignReviewers method for assignReview.controller.ts

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

      logger.info(
        `Proposal ${proposalId} submitter faculty: ${JSON.stringify(submitterFaculty)}`
      );

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
          'School of Basic Clinical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
          'Institute of Child Health',
        ],
        'Faculty of Dentistry': [
          'Faculty of Pharmacy',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
          'School of Basic Clinical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
          'Institute of Child Health',
        ],
        'Faculty of Medicine': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Basic Medical Sciences',
          'School of Basic Clinical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
          'Institute of Child Health',
        ],
        'Faculty of Basic Medical Sciences': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Medicine',
          'School of Basic Clinical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
          'Institute of Child Health',
        ],
        'School of Basic Clinical Sciences': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
          'Institute of Child Health',
        ],
        'Centre of Excellence in Reproductive Health Innovation': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
          'School of Basic Clinical Sciences',
          'Institute of Child Health',
        ],
        'Institute of Child Health': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
          'School of Basic Clinical Sciences',
          'Centre of Excellence in Reproductive Health Innovation',
        ],

        // Cluster 3
        'Faculty of Management Sciences': [
          'Institute of Education',
          'Faculty of Social Sciences',
          'Faculty of Vocational Education',
        ],
        'Institute of Education': [
          'Faculty of Management Sciences',
          'Faculty of Social Sciences',
          'Faculty of Vocational Education',
        ],
        'Faculty of Social Sciences': [
          'Faculty of Management Sciences',
          'Institute of Education',
          'Faculty of Vocational Education',
        ],
        'Faculty of Vocational Education': [
          'Faculty of Management Sciences',
          'Institute of Education',
          'Faculty of Social Sciences',
        ],

        // Cluster 4
        'Faculty of Law': ['Faculty of Arts', 'Faculty of Education'],
        'Faculty of Arts': ['Faculty of Law', 'Faculty of Education'],
        'Faculty of Education': ['Faculty of Law', 'Faculty of Arts'],

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

      // Define a map from keywords to canonical FacultyTitle
      const keywordToFacultyMap: { [key: string]: FacultyTitle } = {
        Agriculture: 'Faculty of Agriculture',
        'Life Sciences': 'Faculty of Life Sciences',
        'Veterinary Medicine': 'Faculty of Veterinary Medicine',
        Pharmacy: 'Faculty of Pharmacy',
        Dentistry: 'Faculty of Dentistry',
        Medicine: 'Faculty of Medicine',
        'Basic Medical Sciences': 'Faculty of Basic Medical Sciences',
        'Basic Clinical Sciences': 'School of Basic Clinical Sciences',
        'Reproductive Health Innovation':
          'Centre of Excellence in Reproductive Health Innovation',
        'Child Health': 'Institute of Child Health',
        'Management Sciences': 'Faculty of Management Sciences',
        Education: 'Faculty of Education',
        'Social Sciences': 'Faculty of Social Sciences',
        'Vocational Education': 'Faculty of Vocational Education',
        Law: 'Faculty of Law',
        Arts: 'Faculty of Arts',
        'Institute of Education': 'Institute of Education',
        Engineering: 'Faculty of Engineering',
        'Physical Sciences': 'Faculty of Physical Sciences',
        'Environmental Sciences': 'Faculty of Environmental Sciences',
      };

      const rawFacultyTitle =
        typeof submitterFaculty === 'string'
          ? submitterFaculty
          : (submitterFaculty as any).title;

      // Remove parenthetical codes and trim
      const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

      logger.info(`Cleaned faculty title: ${cleanedFacultyTitle}`);

      let canonicalFacultyTitle: FacultyTitle | undefined;

      // Find the canonical faculty title using keywords
      for (const keyword in keywordToFacultyMap) {
        if (cleanedFacultyTitle.includes(keyword)) {
          canonicalFacultyTitle = keywordToFacultyMap[keyword];
          break;
        }
      }

      if (!canonicalFacultyTitle) {
        logger.error(
          `No canonical faculty title found for cleaned title: ${cleanedFacultyTitle}`
        );
        res.status(400).json({
          success: false,
          message:
            "Cannot assign reviewers: Could not determine a matching faculty for the proposal's cluster.",
        });
        return;
      }

      logger.info(
        `Canonical faculty title determined: ${canonicalFacultyTitle}`
      );

      const eligibleFaculties = clusterMap[canonicalFacultyTitle] || [];

      logger.info(
        `Eligible faculties from cluster map: ${JSON.stringify(eligibleFaculties)}`
      );

      if (eligibleFaculties.length === 0) {
        logger.error(
          `No eligible faculties found for ${canonicalFacultyTitle}`
        );
        res.status(400).json({
          success: false,
          message:
            "Cannot assign reviewers: No eligible faculties found for the proposal's cluster",
        });
        return;
      }

      const eligibleKeywordsForRegex = eligibleFaculties
        .map((canonicalTitle) => {
          for (const keyword in keywordToFacultyMap) {
            if (keywordToFacultyMap[keyword] === canonicalTitle) {
              return keyword;
            }
          }
          return null; // Should not happen if maps are consistent
        })
        .filter(Boolean); // Remove nulls

      // Build a regex to match any of the keywords in the Faculty title
      const regexPattern = eligibleKeywordsForRegex
        .map((keyword) => `.*${keyword}.*`)
        .join('|');
      const facultyTitleRegex = new RegExp(regexPattern, 'i'); // Case-insensitive match

      const facultyIds = (await Faculty.find({
        title: { $regex: facultyTitleRegex },
      }).select('_id')) as { _id: Types.ObjectId }[]; // Get ObjectIds instead of codes

      logger.info(
        `Faculty IDs found for eligible faculties: ${JSON.stringify(facultyIds)}`
      );

      const facultyIdList = facultyIds.map((f) => f._id);

      logger.info(
        `Faculty ID list for matching: ${JSON.stringify(facultyIdList)}`
      );

      // Find eligible reviewers and sort by current workload with better distribution
      const eligibleReviewers = await User.aggregate<IReviewerWithCounts>([
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
            from: 'reviews', // Collection name is typically lowercase and plural
            localField: '_id',
            foreignField: 'reviewer',
            as: 'allReviews',
          },
        },
        {
          $addFields: {
            totalReviewsCount: { $size: '$allReviews' }, // Count all reviews
            pendingReviewsCount: {
              $size: {
                $filter: {
                  input: '$allReviews',
                  as: 'review',
                  cond: { $ne: ['$$review.status', 'completed'] },
                },
              },
            },
            discrepancyCount: {
              $size: {
                $filter: {
                  input: '$allReviews',
                  as: 'review',
                  cond: { $eq: ['$$review.reviewType', 'reconciliation'] },
                },
              },
            },
          },
        },
        {
          $sort: {
            totalReviewsCount: 1, // Primary sort by total workload
            pendingReviewsCount: 1, // Secondary sort by pending workload
            discrepancyCount: 1, // Tertiary sort by discrepancy handling
            _id: 1, // Quaternary sort for consistency
          },
        },
      ]);

      logger.info(
        `Eligible reviewers found: ${JSON.stringify(
          eligibleReviewers.map((r) => ({
            id: r._id,
            name: r.name,
            faculty: r.faculty,
            totalReviews: r.totalReviewsCount,
            pendingReviews: r.pendingReviewsCount,
          }))
        )}`
      );

      const MAX_REVIEWS_PER_REVIEWER = 10;
      let selectedReviewer: IReviewerWithCounts | undefined;

      // Function to select a reviewer based on least workload, then randomization
      const selectReviewerByWorkload = (
        reviewers: IReviewerWithCounts[]
      ): IReviewerWithCounts | undefined => {
        if (reviewers.length === 0) {
          return undefined;
        }

        // Sort by totalReviewsCount to find the least workload
        reviewers.sort((a, b) => a.totalReviewsCount - b.totalReviewsCount);

        const minReviews = reviewers[0].totalReviewsCount;
        const leastWorkloadReviewers = reviewers.filter(
          (r) => r.totalReviewsCount === minReviews
        );

        // Randomly select from those with the least workload
        const randomIndex = Math.floor(
          Math.random() * leastWorkloadReviewers.length
        );
        return leastWorkloadReviewers[randomIndex];
      };

      // Filter reviewers who have less than the maximum allowed reviews
      const reviewersUnderLimit = eligibleReviewers.filter(
        (reviewer) => reviewer.totalReviewsCount < MAX_REVIEWS_PER_REVIEWER
      );

      if (reviewersUnderLimit.length > 0) {
        // If there are reviewers under the limit, prioritize by least workload
        selectedReviewer = selectReviewerByWorkload(reviewersUnderLimit);
        logger.info(
          `Selected reviewer ${selectedReviewer?._id} (under limit) with ${selectedReviewer?.totalReviewsCount} reviews.`
        );
      } else if (eligibleReviewers.length > 0) {
        // If all reviewers have reached or exceeded the limit,
        // still prioritize by least workload among them
        selectedReviewer = selectReviewerByWorkload(eligibleReviewers);
        logger.info(
          `Selected reviewer ${selectedReviewer?._id} (over limit) with ${selectedReviewer?.totalReviewsCount} reviews.`
        );
      } else {
        // No eligible reviewers found at all
        logger.error('No eligible reviewers found for assignment.');
        res.status(400).json({
          success: false,
          message: 'No eligible reviewers found for assignment.',
        });
        return;
      }

      // Ensure a reviewer was selected
      if (!selectedReviewer) {
        logger.error('Failed to select a reviewer.');
        res.status(500).json({
          success: false,
          message: 'Failed to select a reviewer for assignment.',
        });
        return;
      }

      // Calculate due date (5 business days from now)
      const dueDate = calculateDueDate(5);

      // Create review assignment for the selected reviewer
      const review = new Review({
        proposal: proposalId,
        reviewer: selectedReviewer._id,
        reviewType: ReviewType.HUMAN,
        status: ReviewStatus.IN_PROGRESS,
        dueDate,
      });

      const savedReview = await review.save();
      logger.info(
        `Assigned proposal ${proposalId} to human reviewer ${selectedReviewer._id}`
      );

      // Update proposal status to under review
      proposal.status = 'under_review';
      proposal.reviewStatus = 'pending';
      await proposal.save();

      // Notify reviewer about their assignment
      try {
        await emailService.sendReviewAssignmentEmail(
          selectedReviewer.email,
          proposal.projectTitle || 'Research Proposal',
          selectedReviewer.name,
          dueDate
        );
      } catch (error) {
        logger.error(
          'Failed to send reviewer notification email:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Continue execution even if emails fail
      }

      // Dispatch AI review generation job to Agenda
      if (proposal && proposal._id) {
        await agenda.now('generate AI review', {
          proposalId: proposal._id.toString(),
        });
        logger.info(
          `Dispatched AI review job for proposal ${proposal._id} to Agenda`
        );
      } else {
        logger.warn(
          'Could not dispatch AI review job due to missing proposal information'
        );
      }

      logger.info(
        // eslint-disable-next-line max-len
        `Assigned proposal ${proposalId} to 1 human reviewer and dispatched AI review job`
      );

      res.status(200).json({
        success: true,
        message: `Proposal assigned to 1 reviewer successfully`,
        data: {
          reviewer: {
            id: selectedReviewer._id,
            name: selectedReviewer.name,
            email: selectedReviewer.email,
            faculty: selectedReviewer.faculty,
            totalReviews: selectedReviewer.totalReviewsCount,
          },
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
