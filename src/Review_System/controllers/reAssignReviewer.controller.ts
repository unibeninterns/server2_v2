/* eslint-disable max-lines */
import { Request, Response } from 'express';
import User, { UserRole } from '../../model/user.model';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import Review, { ReviewStatus, ReviewType } from '../models/review.model';
import Faculty from '../../Proposal_Submission/models/faculty.model';
import Department from '../../Proposal_Submission/models/department.model';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import mongoose, { Types } from 'mongoose';
import agenda from '../../config/agenda'; // Import agenda

interface IReassignReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

interface IEligibleReviewersResponse {
  success: boolean;
  message?: string;
  data?: {
    eligibleReviewers: any[];
    proposalInfo: {
      id: string;
      title: string;
      submitterFaculty: string;
      cluster: string[];
    };
  };
}

interface FacultyDocument {
  _id: string;
  title: string;
}

class ReassignReviewController {
  private readonly BYPASS_USER_ID = '68557cdbc6540899e1dc934f';

  private clusterMap = {
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

  private keywordToFacultyMap: {
    [key: string]: keyof typeof ReassignReviewController.prototype.clusterMap;
  } = {
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

  // Reassign regular review to another reviewer
  // Updated reassignRegularReview method
  reassignRegularReview = asyncHandler(
    async (
      req: Request<
        { proposalId: string },
        {},
        { newReviewerId?: string; reviewId?: string }
      >,
      res: Response<IReassignReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;
      const { newReviewerId, reviewId } = req.body;

      // Find the proposal first
      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'faculty',
        populate: { path: 'faculty', select: 'title code' },
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Check if an AI review exists for this proposal, if not create one
      // If exists but has zero total score, regenerate it
      const existingAIReview = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.AI,
      });

      if (!existingAIReview) {
        logger.info(
          `No existing AI review found for proposal ${proposalId}. Dispatching job to generate one.`
        );
        await agenda.now('generate AI review', { proposalId: proposalId });
      } else if (existingAIReview.totalScore === 0) {
        logger.info(
          `Existing AI review found for proposal ${proposalId} but has zero score. Regenerating AI review.`
        );

        // Delete the existing AI review with zero score
        await Review.findByIdAndDelete(existingAIReview._id);

        // Generate a new AI review
        await agenda.now('generate AI review', { proposalId: proposalId });
      } else {
        logger.info(
          `Valid AI review already exists for proposal ${proposalId} with score ${existingAIReview.totalScore}`
        );
      }

      let existingReview;

      if (reviewId) {
        // If specific reviewId is provided, find that review
        existingReview = await Review.findOne({
          _id: reviewId,
          proposal: proposalId,
          reviewType: ReviewType.HUMAN,
        });

        if (!existingReview) {
          throw new NotFoundError('Review not found for this proposal');
        }
      } else {
        // If no reviewId provided, find any in-progress human review for this proposal
        existingReview = await Review.findOne({
          proposal: proposalId,
          reviewType: ReviewType.HUMAN,
          status: { $ne: ReviewStatus.COMPLETED },
        });

        if (!existingReview) {
          throw new NotFoundError(
            'No reassignable review found for this proposal'
          );
        }
      }

      // Check if review can be reassigned (not completed yet)
      if (existingReview.status === ReviewStatus.COMPLETED) {
        throw new BadRequestError('Cannot reassign a completed review');
      }

      let newReviewer;

      if (newReviewerId) {
        // Specific reviewer requested
        newReviewer = await User.findById(newReviewerId);
        if (!newReviewer) {
          throw new NotFoundError('Specified reviewer not found');
        }

        // Verify the new reviewer is eligible (same cluster, not already assigned)
        const isEligible = await this.verifyReviewerEligibility(
          newReviewerId,
          proposal,
          proposalId
        );

        if (!isEligible) {
          throw new BadRequestError(
            'Specified reviewer is not eligible for this proposal'
          );
        }
      } else {
        // Auto-assign to best available reviewer in the same cluster
        newReviewer = await this.findBestReviewerInCluster(
          proposal,
          proposalId
        );

        if (!newReviewer) {
          throw new BadRequestError(
            'No eligible reviewers available for reassignment'
          );
        }
      }

      // Get old reviewer info for logging
      const oldReviewer = await User.findById(existingReview.reviewer);

      // Update the review with new reviewer
      existingReview.reviewer = newReviewer._id;
      existingReview.status = ReviewStatus.IN_PROGRESS;
      existingReview.dueDate = this.calculateDueDate(5); // Reset due date
      await existingReview.save();

      // Send notification to new reviewer
      try {
        await emailService.sendReviewAssignmentEmail(
          newReviewer.email,
          proposal.projectTitle || 'Research Proposal',
          newReviewer.name,
          existingReview.dueDate
        );
      } catch (error) {
        logger.error(
          'Failed to send reviewer notification email:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      logger.info(
        `Reassigned review ${existingReview._id} from ${oldReviewer?.name} to ${newReviewer.name} for proposal ${proposalId}`
      );

      res.status(200).json({
        success: true,
        message: 'Review reassigned successfully',
        data: {
          proposalId,
          reviewId: existingReview._id,
          oldReviewer: {
            id: oldReviewer?._id,
            name: oldReviewer?.name,
          },
          newReviewer: {
            id: newReviewer._id,
            name: newReviewer.name,
            email: newReviewer.email,
          },
          dueDate: existingReview.dueDate,
        },
      });
    }
  );

  // Reassign reconciliation review
  reassignReconciliationReview = asyncHandler(
    async (
      req: Request<{ proposalId: string }, {}, { newReviewerId?: string }>,
      res: Response<IReassignReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;
      const { newReviewerId } = req.body;

      // Find the proposal
      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'faculty',
        populate: { path: 'faculty', select: 'title code' },
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Check if proposal is in revision_requested status and reviewStatus is pending
      if (
        proposal.status !== ProposalStatus.REVISION_REQUESTED ||
        proposal.reviewStatus !== 'pending'
      ) {
        throw new BadRequestError(
          'Proposal must be in revision_requested status with pending review status for reconciliation reassignment'
        );
      }

      // Find existing reconciliation review (if any)
      const existingReconciliationReview = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.RECONCILIATION,
      });

      // If there's an existing reconciliation review, check if it can be reassigned
      if (existingReconciliationReview) {
        if (existingReconciliationReview.status === ReviewStatus.COMPLETED) {
          throw new BadRequestError(
            'Cannot reassign a completed reconciliation review'
          );
        }
      }

      let newReviewer;

      if (newReviewerId) {
        // Specific reviewer requested
        newReviewer = await User.findById(newReviewerId);
        if (!newReviewer) {
          throw new NotFoundError('Specified reviewer not found');
        }

        // Verify the new reviewer is eligible for reconciliation
        const isEligible = await this.verifyReconciliationReviewerEligibility(
          newReviewerId,
          proposal,
          proposalId
        );

        if (!isEligible) {
          throw new BadRequestError(
            'Specified reviewer is not eligible for reconciliation review'
          );
        }
      } else {
        // Auto-assign reconciliation reviewer using fixed logic
        newReviewer = await this.findReconciliationReviewer(
          proposal,
          proposalId
        );

        if (!newReviewer) {
          throw new BadRequestError(
            'No eligible reconciliation reviewers available'
          );
        }
      }

      const dueDate = this.calculateDueDate(5);

      if (existingReconciliationReview) {
        // Update existing reconciliation review
        const oldReviewer = await User.findById(
          existingReconciliationReview.reviewer
        );

        existingReconciliationReview.reviewer = newReviewer._id;
        existingReconciliationReview.status = ReviewStatus.IN_PROGRESS;
        existingReconciliationReview.dueDate = dueDate;
        await existingReconciliationReview.save();

        logger.info(
          `Reassigned reconciliation review ${existingReconciliationReview._id} from ${oldReviewer?.name} to ${newReviewer.name}`
        );
      } else {
        // Create new reconciliation review
        const reconciliationReview = new Review({
          proposal: proposalId,
          reviewer: newReviewer._id,
          reviewType: ReviewType.RECONCILIATION,
          status: ReviewStatus.IN_PROGRESS,
          dueDate,
        });

        await reconciliationReview.save();

        logger.info(
          `Created new reconciliation review ${reconciliationReview._id} for proposal ${proposalId} assigned to ${newReviewer.name}`
        );
      }

      // Send notification to new reconciliation reviewer
      try {
        // Get completed reviews for context
        const completedReviews = await Review.find({
          proposal: proposalId,
          status: ReviewStatus.COMPLETED,
          reviewType: { $ne: ReviewType.RECONCILIATION },
        });

        const scores = completedReviews.map((r) => r.totalScore);
        const avgScore =
          scores.reduce((sum, score) => sum + score, 0) / scores.length;

        await emailService.sendReconciliationAssignmentEmail(
          newReviewer.email,
          newReviewer.name,
          proposal.projectTitle || 'Research Proposal',
          dueDate,
          completedReviews.length,
          Math.round(avgScore * 10) / 10,
          scores
        );
      } catch (error) {
        logger.error(
          'Failed to send reconciliation reviewer notification email:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      res.status(200).json({
        success: true,
        message: 'Reconciliation review reassigned successfully',
        data: {
          proposalId,
          reconciliationReviewer: {
            id: newReviewer._id,
            name: newReviewer.name,
            email: newReviewer.email,
          },
          dueDate,
          isNewAssignment: !existingReconciliationReview,
        },
      });
    }
  );

  // Helper method to verify reviewer eligibility for regular reviews
  private async verifyReviewerEligibility(
    reviewerId: string,
    proposal: any,
    proposalId: string
  ): Promise<boolean> {
    logger.info(
      `Verifying eligibility for reviewer ${reviewerId} on proposal ${proposalId}`
    );

    // Bypass faculty cluster checks for special user
    if (reviewerId === this.BYPASS_USER_ID) {
      logger.info(
        `Bypass user ${reviewerId} detected - checking basic eligibility only`
      );

      // Check if reviewer is active and has reviewer role
      const reviewer = await User.findById(reviewerId);
      if (
        !reviewer ||
        reviewer.role !== UserRole.REVIEWER ||
        !reviewer.isActive ||
        !['accepted', 'added'].includes(reviewer.invitationStatus)
      ) {
        logger.warn(
          `Bypass user ${reviewerId} failed basic eligibility checks`
        );
        return false;
      }

      // Check if reviewer is already assigned to this proposal
      const existingAssignment = await Review.findOne({
        proposal: proposalId,
        reviewer: reviewerId,
      });

      if (existingAssignment) {
        logger.warn(
          `Bypass user ${reviewerId} already assigned to proposal ${proposalId}`
        );
        return false;
      }

      logger.info(`Bypass user ${reviewerId} is eligible`);
      return true;
    }

    // Check if reviewer is active and has reviewer role
    const reviewer = await User.findById(reviewerId);
    if (
      !reviewer ||
      reviewer.role !== UserRole.REVIEWER ||
      !reviewer.isActive ||
      !['accepted', 'added'].includes(reviewer.invitationStatus)
    ) {
      logger.warn(
        `Reviewer ${reviewerId} failed basic eligibility checks: role=${reviewer?.role}, isActive=${reviewer?.isActive}, invitationStatus=${reviewer?.invitationStatus}`
      );
      return false;
    }

    // Check if reviewer is already assigned to this proposal
    const existingAssignment = await Review.findOne({
      proposal: proposalId,
      reviewer: reviewerId,
    });

    if (existingAssignment) {
      logger.warn(
        `Reviewer ${reviewerId} already assigned to proposal ${proposalId}`
      );
      return false;
    }

    // Check if reviewer is in the same cluster
    if (reviewer.faculty) {
      const clusterEligible = await this.isReviewerInSameCluster(
        reviewer.faculty,
        proposal
      );
      logger.info(
        `Reviewer ${reviewerId} cluster eligibility: ${clusterEligible}`
      );
      return clusterEligible;
    } else {
      // Handle the case where faculty is undefined
      logger.warn(
        `Reviewer ${reviewerId} does not have a faculty assigned and cannot be considered eligible.`
      );
      return false;
    }
  }

  // Helper method to verify reviewer eligibility for reconciliation reviews
  private async verifyReconciliationReviewerEligibility(
    reviewerId: string,
    proposal: any,
    proposalId: string
  ): Promise<boolean> {
    logger.info(
      `Verifying reconciliation eligibility for reviewer ${reviewerId} on proposal ${proposalId}`
    );

    // Bypass faculty cluster checks for special user
    if (reviewerId === this.BYPASS_USER_ID) {
      logger.info(
        `Bypass user ${reviewerId} detected - checking basic eligibility only`
      );

      // Check if reviewer is active and has reviewer role
      const reviewer = await User.findById(reviewerId);
      if (
        !reviewer ||
        reviewer.role !== UserRole.REVIEWER ||
        !reviewer.isActive ||
        !['accepted', 'added'].includes(reviewer.invitationStatus)
      ) {
        logger.warn(
          `Bypass user ${reviewerId} failed basic eligibility checks`
        );
        return false;
      }

      // Check if reviewer has already reviewed this proposal
      const existingReview = await Review.findOne({
        proposal: proposalId,
        reviewer: reviewerId,
        reviewType: ReviewType.HUMAN,
      });

      if (existingReview) {
        logger.warn(
          `Bypass user ${reviewerId} has already reviewed this proposal`
        );
        return false;
      }

      logger.info(`Bypass user ${reviewerId} is eligible for reconciliation`);
      return true;
    }

    // Check if reviewer is active and has reviewer role
    const reviewer = await User.findById(reviewerId);
    if (
      !reviewer ||
      reviewer.role !== UserRole.REVIEWER ||
      !reviewer.isActive ||
      !['accepted', 'added'].includes(reviewer.invitationStatus)
    ) {
      logger.warn(
        `Reviewer ${reviewerId} is not active or has an invalid invitation status and cannot be considered eligible.`
      );
      return false;
    }

    // Check if reviewer has already reviewed this proposal
    const existingReview = await Review.findOne({
      proposal: proposalId,
      reviewer: reviewerId,
      reviewType: ReviewType.HUMAN,
    });

    if (existingReview) {
      logger.warn(
        `Reviewer ${reviewerId} has already reviewed this proposal and cannot be considered eligible for reconciliation.`
      );
      return false;
    }

    // Check if reviewer is in the same cluster
    if (reviewer.faculty) {
      const clusterEligible = await this.isReviewerInSameCluster(
        reviewer.faculty,
        proposal
      );
      logger.info(
        `Reconciliation reviewer ${reviewerId} cluster eligibility: ${clusterEligible}`
      );
      return clusterEligible;
    } else {
      // Handle the case where faculty is undefined
      logger.warn(
        `Reviewer ${reviewerId} does not have a faculty assigned and cannot be considered eligible.`
      );
      return false;
    }
  }

  // Helper method to check if reviewer is in the same cluster
  private async isReviewerInSameCluster(
    reviewerFacultyId: Types.ObjectId,
    proposal: any
  ): Promise<boolean> {
    const submitterFaculty = (proposal.submitter as any).faculty;
    if (!submitterFaculty) {
      logger.warn('Proposal submitter has no faculty assigned');
      return false;
    }

    const rawFacultyTitle =
      typeof submitterFaculty === 'string'
        ? submitterFaculty
        : (submitterFaculty as any).title;

    logger.info(
      `Comparing reviewer faculty ${reviewerFacultyId} with submitter faculty: ${rawFacultyTitle}`
    );

    // Remove parenthetical codes and trim
    const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();
    logger.info(`Cleaned submitter faculty title: ${cleanedFacultyTitle}`);

    let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

    // Find the canonical faculty title using keywords
    for (const keyword in this.keywordToFacultyMap) {
      if (cleanedFacultyTitle.includes(keyword)) {
        canonicalFacultyTitle = this.keywordToFacultyMap[keyword];
        logger.info(
          `Found canonical faculty title: ${canonicalFacultyTitle} using keyword: ${keyword}`
        );
        break;
      }
    }

    if (!canonicalFacultyTitle) {
      logger.warn(
        `No canonical faculty title found for: ${cleanedFacultyTitle}`
      );
      return false;
    }

    const eligibleFaculties = this.clusterMap[canonicalFacultyTitle] || [];
    logger.info(
      `Eligible faculties in cluster: ${JSON.stringify(eligibleFaculties)}`
    );

    const eligibleKeywordsForRegex = eligibleFaculties
      .map((canonicalTitle) => {
        for (const keyword in this.keywordToFacultyMap) {
          if (this.keywordToFacultyMap[keyword] === canonicalTitle) {
            return keyword;
          }
        }
        return null;
      })
      .filter(Boolean);

    logger.info(
      `Eligible keywords for regex: ${JSON.stringify(eligibleKeywordsForRegex)}`
    );

    // Build a regex to match any of the keywords in the Faculty title
    const regexPattern = eligibleKeywordsForRegex
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    logger.info(`Faculty title regex pattern: ${regexPattern}`);

    const facultyIds = (await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id title')) as FacultyDocument[];

    logger.info(
      `Found ${facultyIds.length} matching faculties: ${JSON.stringify(facultyIds.map((f) => ({ id: f._id, title: f.title })))}`
    );

    // Convert both to strings for comparison
    const facultyIdStrings = facultyIds.map((f) => f._id.toString());
    const reviewerFacultyIdString = reviewerFacultyId.toString();

    logger.info(
      `Checking if reviewer faculty ID ${reviewerFacultyIdString} is in eligible list: ${JSON.stringify(facultyIdStrings)}`
    );

    const isEligible = facultyIdStrings.includes(reviewerFacultyIdString);
    logger.info(`Reviewer cluster eligibility result: ${isEligible}`);

    return isEligible;
  }

  // Helper method to find best reviewer in cluster for regular reviews
  private async findBestReviewerInCluster(
    proposal: any,
    proposalId: string
  ): Promise<any> {
    const submitterFaculty = (proposal.submitter as any).faculty;
    if (!submitterFaculty) {
      return null;
    }

    const rawFacultyTitle =
      typeof submitterFaculty === 'string'
        ? submitterFaculty
        : (submitterFaculty as any).title;

    // Remove parenthetical codes and trim
    const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

    let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

    // Find the canonical faculty title using keywords
    for (const keyword in this.keywordToFacultyMap) {
      if (cleanedFacultyTitle.includes(keyword)) {
        canonicalFacultyTitle = this.keywordToFacultyMap[keyword];
        break;
      }
    }

    if (!canonicalFacultyTitle) {
      return null;
    }

    const eligibleFaculties = this.clusterMap[canonicalFacultyTitle] || [];

    const eligibleKeywordsForRegex = eligibleFaculties
      .map((canonicalTitle) => {
        for (const keyword in this.keywordToFacultyMap) {
          if (this.keywordToFacultyMap[keyword] === canonicalTitle) {
            return keyword;
          }
        }
        return null;
      })
      .filter(Boolean);

    // Build a regex to match any of the keywords in the Faculty title
    const regexPattern = eligibleKeywordsForRegex
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    const facultyIds = (await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id')) as { _id: Types.ObjectId }[];

    const facultyIdList = facultyIds.map((f) => f._id);

    // Get existing reviewers for this proposal
    const existingReviewerIds = await Review.find({
      proposal: proposalId,
    }).distinct('reviewer');

    // Find eligible reviewers with comprehensive workload tracking
    const eligibleReviewers = await User.aggregate([
      {
        $match: {
          faculty: { $in: facultyIdList },
          role: UserRole.REVIEWER,
          isActive: true,
          invitationStatus: { $in: ['accepted', 'added'] },
          _id: {
            $nin: existingReviewerIds
              .filter((id) => id !== null)
              .map((id) => new mongoose.Types.ObjectId(id)),
          },
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
          totalReviewsCount: { $size: '$allReviews' },
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

    const MAX_REVIEWS_PER_REVIEWER = 10;

    // Function to select a reviewer based on least workload, then randomization
    const selectReviewerByWorkload = (reviewers: any[]): any => {
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

    let selectedReviewer;

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
    }

    return selectedReviewer || null;
  }

  // Helper method to find reconciliation reviewer (similar to reconciliation controller logic)
  private async findReconciliationReviewer(
    proposal: any,
    proposalId: string
  ): Promise<any> {
    const submitterFaculty = (proposal.submitter as any).faculty;
    if (!submitterFaculty) {
      return null;
    }

    const rawFacultyTitle =
      typeof submitterFaculty === 'string'
        ? submitterFaculty
        : (submitterFaculty as any).title;

    // Remove parenthetical codes and trim
    const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

    let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

    // Find the canonical faculty title using keywords
    for (const keyword in this.keywordToFacultyMap) {
      if (cleanedFacultyTitle.includes(keyword)) {
        canonicalFacultyTitle = this.keywordToFacultyMap[keyword];
        break;
      }
    }

    if (!canonicalFacultyTitle) {
      return null;
    }

    const eligibleFaculties = this.clusterMap[canonicalFacultyTitle] || [];

    const eligibleKeywordsForRegex = eligibleFaculties
      .map((canonicalTitle) => {
        for (const keyword in this.keywordToFacultyMap) {
          if (this.keywordToFacultyMap[keyword] === canonicalTitle) {
            return keyword;
          }
        }
        return null;
      })
      .filter(Boolean);

    // Build a regex to match any of the keywords in the Faculty title
    const regexPattern = eligibleKeywordsForRegex
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    const facultyIds = await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id');

    const facultyIdList = facultyIds.map((f) => f._id);

    // Get existing reviewers for this proposal (only human reviews)
    const existingReviewerIds = await Review.find({
      proposal: proposalId,
      reviewType: ReviewType.HUMAN,
    }).distinct('reviewer');

    // First, try to find eligible reconciliation reviewer with completed reviews (experience)
    let eligibleReviewer = await User.aggregate([
      {
        $match: {
          faculty: { $in: facultyIdList },
          role: UserRole.REVIEWER,
          isActive: true,
          invitationStatus: { $in: ['accepted', 'added'] },
          _id: {
            $nin: existingReviewerIds
              .filter((id) => id !== null)
              .map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
      {
        $lookup: {
          from: 'reviews', // Fixed: lowercase collection name
          localField: '_id',
          foreignField: 'reviewer',
          as: 'allReviews',
        },
      },
      {
        $addFields: {
          totalReviewsCount: { $size: '$allReviews' },
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
          completedReviewsCount: {
            $size: {
              $filter: {
                input: '$allReviews',
                as: 'review',
                cond: { $eq: ['$$review.status', 'completed'] },
              },
            },
          },
        },
      },
      {
        $match: {
          completedReviewsCount: { $gt: 0 }, // Prioritize experienced reviewers
        },
      },
      {
        $sort: {
          totalReviewsCount: 1, // Primary sort by total workload
          discrepancyCount: 1, // Secondary sort by reconciliation experience
          pendingReviewsCount: 1, // Tertiary sort by pending workload
          _id: 1, // Quaternary sort for consistency
        },
      },
      {
        $limit: 1,
      },
    ]);

    // If no experienced reviewer found, find any available reviewer
    if (eligibleReviewer.length === 0) {
      eligibleReviewer = await User.aggregate([
        {
          $match: {
            faculty: { $in: facultyIdList },
            role: UserRole.REVIEWER,
            isActive: true,
            invitationStatus: { $in: ['accepted', 'added'] },
            _id: {
              $nin: existingReviewerIds
                .filter((id) => id !== null)
                .map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
        {
          $lookup: {
            from: 'reviews', // Fixed: lowercase collection name
            localField: '_id',
            foreignField: 'reviewer',
            as: 'allReviews',
          },
        },
        {
          $addFields: {
            totalReviewsCount: { $size: '$allReviews' },
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
            discrepancyCount: 1, // Tertiary sort by reconciliation experience
            _id: 1, // Quaternary sort for consistency
          },
        },
        {
          $limit: 1,
        },
      ]);
    }

    return eligibleReviewer.length > 0 ? eligibleReviewer[0] : null;
  }

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

  getEligibleReviewers = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IEligibleReviewersResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      // Find the proposal with submitter faculty information
      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'faculty name',
        populate: { path: 'faculty', select: 'title code' },
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Get existing reviewers for this proposal
      const existingReviewerIds = await Review.find({
        proposal: proposalId,
      }).distinct('reviewer');

      // Check if bypass user exists and is not already assigned
      const bypassUser = await User.findById(this.BYPASS_USER_ID);
      const bypassUserAlreadyAssigned = existingReviewerIds
        .filter((id) => id !== null)
        .map((id) => id.toString())
        .includes(this.BYPASS_USER_ID);

      let bypassUserEligible = null;

      if (
        bypassUser &&
        !bypassUserAlreadyAssigned &&
        bypassUser.role === UserRole.REVIEWER &&
        bypassUser.isActive &&
        ['accepted', 'added'].includes(bypassUser.invitationStatus)
      ) {
        // Get bypass user's review statistics
        const bypassUserReviews = await Review.find({
          reviewer: this.BYPASS_USER_ID,
        });
        const totalReviewsCount = bypassUserReviews.length;
        const pendingReviewsCount = bypassUserReviews.filter(
          (r) => r.status !== ReviewStatus.COMPLETED
        ).length;
        const completedReviewsCount = bypassUserReviews.filter(
          (r) => r.status === ReviewStatus.COMPLETED
        ).length;
        const discrepancyCount = bypassUserReviews.filter(
          (r) => r.reviewType === ReviewType.RECONCILIATION
        ).length;

        // Get faculty and department details
        const facultyDetails = await Faculty.findById(bypassUser.faculty);
        const departmentDetails = bypassUser.department
          ? await Department.findById(bypassUser.department)
          : null;

        bypassUserEligible = {
          _id: bypassUser._id,
          name: bypassUser.name,
          email: bypassUser.email,
          academicTitle: bypassUser.academicTitle,
          phoneNumber: bypassUser.phoneNumber,
          facultyTitle: facultyDetails?.title || 'Unknown',
          departmentTitle: departmentDetails?.title || 'Unknown',
          totalReviewsCount,
          pendingReviewsCount,
          completedReviewsCount,
          discrepancyCount,
          lastLogin: bypassUser.lastLogin,
          createdAt: bypassUser.createdAt,
          completionRate:
            totalReviewsCount > 0
              ? Math.round((completedReviewsCount / totalReviewsCount) * 100)
              : 0,
          isSpecialReviewer: true, // Flag to identify this user in frontend
        };

        logger.info(
          `Bypass user ${this.BYPASS_USER_ID} added to eligible reviewers list`
        );
      }

      const submitterFaculty = (proposal.submitter as any).faculty;
      if (!submitterFaculty) {
        throw new BadRequestError('Proposal submitter has no faculty assigned');
      }

      const rawFacultyTitle =
        typeof submitterFaculty === 'string'
          ? submitterFaculty
          : (submitterFaculty as any).title;

      // Remove parenthetical codes and trim
      const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

      let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

      // Find the canonical faculty title using keywords
      for (const keyword in this.keywordToFacultyMap) {
        if (cleanedFacultyTitle.includes(keyword)) {
          canonicalFacultyTitle = this.keywordToFacultyMap[keyword];
          break;
        }
      }

      if (!canonicalFacultyTitle) {
        throw new BadRequestError('No cluster found for the proposal faculty');
      }

      const eligibleFaculties = this.clusterMap[canonicalFacultyTitle] || [];

      const eligibleKeywordsForRegex = eligibleFaculties
        .map((canonicalTitle) => {
          for (const keyword in this.keywordToFacultyMap) {
            if (this.keywordToFacultyMap[keyword] === canonicalTitle) {
              return keyword;
            }
          }
          return null;
        })
        .filter(Boolean);

      // Build a regex to match any of the keywords in the Faculty title
      const regexPattern = eligibleKeywordsForRegex
        .map((keyword) => `.*${keyword}.*`)
        .join('|');
      const facultyTitleRegex = new RegExp(regexPattern, 'i');

      const facultyIds = await Faculty.find({
        title: { $regex: facultyTitleRegex },
      }).select('_id');

      const facultyIdList = facultyIds.map((f) => f._id);

      // Find eligible reviewers with comprehensive workload tracking
      const eligibleReviewers = await User.aggregate([
        {
          $match: {
            faculty: { $in: facultyIdList },
            role: UserRole.REVIEWER,
            isActive: true,
            invitationStatus: { $in: ['accepted', 'added'] },
            _id: {
              $nin: existingReviewerIds
                .filter((id) => id !== null)
                .map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
        {
          $lookup: {
            from: 'reviews',
            localField: '_id',
            foreignField: 'reviewer',
            as: 'allReviews',
          },
        },
        {
          $lookup: {
            from: 'faculties',
            localField: 'faculty',
            foreignField: '_id',
            as: 'facultyDetails',
          },
        },
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentDetails',
          },
        },
        {
          $addFields: {
            totalReviewsCount: { $size: '$allReviews' },
            pendingReviewsCount: {
              $size: {
                $filter: {
                  input: '$allReviews',
                  as: 'review',
                  cond: { $ne: ['$$review.status', 'completed'] },
                },
              },
            },
            completedReviewsCount: {
              $size: {
                $filter: {
                  input: '$allReviews',
                  as: 'review',
                  cond: { $eq: ['$$review.status', 'completed'] },
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
            facultyTitle: { $arrayElemAt: ['$facultyDetails.title', 0] },
            departmentTitle: { $arrayElemAt: ['$departmentDetails.title', 0] },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            academicTitle: 1,
            phoneNumber: 1,
            facultyTitle: 1,
            departmentTitle: 1,
            totalReviewsCount: 1,
            pendingReviewsCount: 1,
            completedReviewsCount: 1,
            discrepancyCount: 1,
            lastLogin: 1,
            createdAt: 1,
            // Calculate completion rate
            completionRate: {
              $cond: {
                if: { $gt: ['$totalReviewsCount', 0] },
                then: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: [
                            '$completedReviewsCount',
                            '$totalReviewsCount',
                          ],
                        },
                        100,
                      ],
                    },
                    0,
                  ],
                },
                else: 0,
              },
            },
          },
        },
        {
          $sort: {
            totalReviewsCount: 1, // Primary sort by total workload
            pendingReviewsCount: 1, // Secondary sort by pending workload
            name: 1, // Tertiary sort by name for consistency
          },
        },
      ]);

      if (bypassUserEligible) {
        eligibleReviewers.unshift(bypassUserEligible); // Add to beginning of list
      }

      logger.info(
        `Retrieved ${eligibleReviewers.length} eligible reviewers for proposal ${proposalId}${bypassUserEligible ? ' (including bypass user)' : ''}`
      );

      res.status(200).json({
        success: true,
        data: {
          eligibleReviewers,
          proposalInfo: {
            id: proposalId,
            title: proposal.projectTitle || 'Research Proposal',
            submitterFaculty: rawFacultyTitle,
            cluster: eligibleFaculties,
          },
        },
      });
    }
  );
}

export default new ReassignReviewController();
