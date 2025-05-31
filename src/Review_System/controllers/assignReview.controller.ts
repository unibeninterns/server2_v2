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

      // Define a map from keywords to canonical FacultyTitle
      const keywordToFacultyMap: { [key: string]: FacultyTitle } = {
        Agriculture: 'Faculty of Agriculture',
        'Life Sciences': 'Faculty of Life Sciences',
        'Veterinary Medicine': 'Faculty of Veterinary Medicine',
        Pharmacy: 'Faculty of Pharmacy',
        Dentistry: 'Faculty of Dentistry',
        Medicine: 'Faculty of Medicine',
        'Basic Medical Sciences': 'Faculty of Basic Medical Sciences',
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

      // Convert eligibleFaculties to a list of keywords for flexible matching
      const eligibleFacultyKeywords = eligibleFaculties.map((title) =>
        title.split('(')[0].trim()
      );

      // Build a regex to match any of the keywords in the Faculty title
      const regexPattern = eligibleFacultyKeywords
        .map((keyword) => `.*${keyword}.*`)
        .join('|');
      const facultyTitleRegex = new RegExp(regexPattern, 'i'); // Case-insensitive match

      const facultyIds = await Faculty.find({
        title: { $regex: facultyTitleRegex },
      }).select('_id'); // Get ObjectIds instead of codes

      logger.info(
        `Faculty IDs found for eligible faculties: ${JSON.stringify(facultyIds)}`
      );

      const facultyIdList = facultyIds.map((f) => f._id);

      logger.info(
        `Faculty ID list for matching: ${JSON.stringify(facultyIdList)}`
      );

      // Find eligible reviewers and sort by current workload with better distribution
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
            pendingReviewsCount: 1, // Primary sort by workload
            discrepancyCount: 1, // Secondary sort by discrepancy handling
            _id: 1, // Tertiary sort for consistency
          },
        },
      ]);

      logger.info(
        `Eligible reviewers found: ${JSON.stringify(
          eligibleReviewers.map((r) => ({
            id: r._id,
            name: r.name,
            faculty: r.faculty,
            pendingReviews: r.pendingReviewsCount,
          }))
        )}`
      );

      if (eligibleReviewers.length < 1) {
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

      // Enhanced selection logic for better load balancing across faculties
      const selectedReviewers = [] as typeof eligibleReviewers;
      const reviewersByFaculty = new Map();

      // Group reviewers by faculty for better distribution
      eligibleReviewers.forEach((reviewer) => {
        const facultyId = reviewer.faculty.toString();
        if (!reviewersByFaculty.has(facultyId)) {
          reviewersByFaculty.set(facultyId, []);
        }
        reviewersByFaculty.get(facultyId).push(reviewer);
      });

      // Select reviewers with preference for different faculties and low workload
      const maxReviewers = Math.min(2, eligibleReviewers.length);
      const facultyKeys = Array.from(reviewersByFaculty.keys());

      for (
        let i = 0;
        i < maxReviewers && selectedReviewers.length < maxReviewers;
        i++
      ) {
        // Try to select from different faculties if possible
        for (const facultyId of facultyKeys) {
          if (selectedReviewers.length >= maxReviewers) break;

          const facultyReviewers = reviewersByFaculty.get(facultyId);

          // Check if we already selected someone from this faculty
          const alreadySelectedFromFaculty = selectedReviewers.some(
            (selected) => selected.faculty.toString() === facultyId
          );

          if (!alreadySelectedFromFaculty && facultyReviewers.length > 0) {
            // Select the reviewer with lowest workload from this faculty
            const bestReviewer = facultyReviewers.reduce((prev: IReviewerWithCounts, current: IReviewerWithCounts) => {
              if (current.pendingReviewsCount < prev.pendingReviewsCount) {
                return current;
              } else if (
                current.pendingReviewsCount === prev.pendingReviewsCount
              ) {
                return current.discrepancyCount < prev.discrepancyCount
                  ? current
                  : prev;
              }
              return prev;
            });

            selectedReviewers.push(bestReviewer);
            // Remove selected reviewer from the faculty list
            const index = facultyReviewers.indexOf(bestReviewer);
            facultyReviewers.splice(index, 1);
          }
        }

        // If we still need more reviewers and couldn't get from different faculties
        if (selectedReviewers.length < maxReviewers) {
          // Just pick the next best reviewer regardless of faculty
          const remainingReviewers = eligibleReviewers.filter(
            (reviewer) =>
              !selectedReviewers.some(
                (selected) =>
                  selected._id.toString() === reviewer._id.toString()
              )
          );

          if (remainingReviewers.length > 0) {
            selectedReviewers.push(remainingReviewers[0]);
          }
        }
      }

      // Calculate due date (5 business days from now)
      const dueDate = calculateDueDate(5);

      // Create review assignments for the selected reviewers
      const reviewPromises = selectedReviewers.map((reviewer) => {
        const review = new Review({
          proposal: proposalId,
          reviewer: reviewer._id,
          reviewType: ReviewType.HUMAN,
          status: ReviewStatus.IN_PROGRESS,
          dueDate,
        });
        return review.save();
      });

      // Execute all assignments
      const reviews = await Promise.all(reviewPromises);
      logger.info(
        `Assigned ${reviews.length} human reviewers to proposal ${proposalId}`
      );

      // Update proposal status to under review
      proposal.status = 'under_review';
      proposal.reviewStatus = 'pending';
      await proposal.save();

      // Notify reviewers about their assignments
      try {
        for (const reviewer of selectedReviewers) {
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
        `Assigned proposal ${proposalId} to ${selectedReviewers.length} human reviewers across ${new Set(selectedReviewers.map((r) => r.faculty.toString())).size} different faculties and dispatched AI review job`
      );

      res.status(200).json({
        success: true,
        message: `Proposal assigned to ${selectedReviewers.length} reviewers successfully`,
        data: {
          reviewers: selectedReviewers.map((r) => ({
            id: r._id,
            name: r.name,
            email: r.email,
            faculty: r.faculty,
            pendingReviews: r.pendingReviewsCount,
          })),
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
