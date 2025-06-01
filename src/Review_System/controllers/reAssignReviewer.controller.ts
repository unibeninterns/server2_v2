import { Request, Response } from 'express';
import User, { UserRole, IUser } from '../../model/user.model';
import Proposal, {
  IProposal,
  ProposalStatus,
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
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import { Types } from 'mongoose';
import mongoose from 'mongoose';

interface IReassignReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

class ReassignReviewController {
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

  private keywordToFacultyMap: { 
    [key: string]: keyof typeof ReassignReviewController.prototype.clusterMap 
  } = {
    'Agriculture': 'Faculty of Agriculture',
    'Life Sciences': 'Faculty of Life Sciences',
    'Veterinary Medicine': 'Faculty of Veterinary Medicine',
    'Pharmacy': 'Faculty of Pharmacy',
    'Dentistry': 'Faculty of Dentistry',
    'Medicine': 'Faculty of Medicine',
    'Basic Medical Sciences': 'Faculty of Basic Medical Sciences',
    'Management Sciences': 'Faculty of Management Sciences',
    'Education': 'Faculty of Education',
    'Social Sciences': 'Faculty of Social Sciences',
    'Vocational Education': 'Faculty of Vocational Education',
    'Law': 'Faculty of Law',
    'Arts': 'Faculty of Arts',
    'Institute of Education': 'Institute of Education',
    'Engineering': 'Faculty of Engineering',
    'Physical Sciences': 'Faculty of Physical Sciences',
    'Environmental Sciences': 'Faculty of Environmental Sciences',
  };

  // Reassign regular review to another reviewer
  reassignRegularReview = asyncHandler(
    async (
      req: Request<{ reviewId: string }, {}, { newReviewerId?: string }>,
      res: Response<IReassignReviewResponse>
    ): Promise<void> => {
      const { reviewId } = req.params;
      const { newReviewerId } = req.body;

      // Find the existing review
      const existingReview = await Review.findById(reviewId).populate('proposal');
      
      if (!existingReview) {
        throw new NotFoundError('Review not found');
      }

      // Check if review can be reassigned (not completed yet)
      if (existingReview.status === ReviewStatus.COMPLETED) {
        throw new BadRequestError('Cannot reassign a completed review');
      }

      // Ensure it's a human review (not AI or reconciliation)
      if (existingReview.reviewType !== ReviewType.HUMAN) {
        throw new BadRequestError('Can only reassign human reviews using this endpoint');
      }

      // Get proposal with faculty information
      const proposal = await Proposal.findById(existingReview.proposal).populate({
        path: 'submitter',
        select: 'faculty',
        populate: { path: 'faculty', select: 'title code' },
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
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
          existingReview.proposal.toString()
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
          existingReview.proposal.toString()
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
        `Reassigned review ${reviewId} from ${oldReviewer?.name} to ${newReviewer.name}`
      );

      res.status(200).json({
        success: true,
        message: 'Review reassigned successfully',
        data: {
          reviewId,
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
          throw new BadRequestError('Cannot reassign a completed reconciliation review');
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
        // Auto-assign reconciliation reviewer using same logic as reconciliation controller
        newReviewer = await this.findReconciliationReviewer(proposal, proposalId);

        if (!newReviewer) {
          throw new BadRequestError(
            'No eligible reconciliation reviewers available'
          );
        }
      }

      const dueDate = this.calculateDueDate(5);

      if (existingReconciliationReview) {
        // Update existing reconciliation review
        const oldReviewer = await User.findById(existingReconciliationReview.reviewer);
        
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

        const scores = completedReviews.map(r => r.totalScore);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

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
    // Check if reviewer is active and has reviewer role
    const reviewer = await User.findById(reviewerId);
    if (
      !reviewer ||
      reviewer.role !== UserRole.REVIEWER ||
      !reviewer.isActive ||
      !['accepted', 'added'].includes(reviewer.invitationStatus)
    ) {
      return false;
    }

    // Check if reviewer is already assigned to this proposal
    const existingAssignment = await Review.findOne({
      proposal: proposalId,
      reviewer: reviewerId,
    });

    if (existingAssignment) {
      return false;
    }

    // Check if reviewer is in the same cluster
    return this.isReviewerInSameCluster(reviewer.faculty, proposal);
  }

  // Helper method to verify reviewer eligibility for reconciliation reviews
  private async verifyReconciliationReviewerEligibility(
    reviewerId: string,
    proposal: any,
    proposalId: string
  ): Promise<boolean> {
    // Check if reviewer is active and has reviewer role
    const reviewer = await User.findById(reviewerId);
    if (
      !reviewer ||
      reviewer.role !== UserRole.REVIEWER ||
      !reviewer.isActive ||
      !['accepted', 'added'].includes(reviewer.invitationStatus)
    ) {
      return false;
    }

    // Check if reviewer has already reviewed this proposal
    const existingReview = await Review.findOne({
      proposal: proposalId,
      reviewer: reviewerId,
      reviewType: ReviewType.HUMAN,
    });

    if (existingReview) {
      return false;
    }

    // Check if reviewer is in the same cluster
    return this.isReviewerInSameCluster(reviewer.faculty, proposal);
  }

  // Helper method to check if reviewer is in the same cluster
  private async isReviewerInSameCluster(
    reviewerFacultyId: Types.ObjectId,
    proposal: any
  ): Promise<boolean> {
    const submitterFaculty = (proposal.submitter as any).faculty;
    if (!submitterFaculty) {
      return false;
    }

    const rawFacultyTitle =
      typeof submitterFaculty === 'string'
        ? submitterFaculty
        : (submitterFaculty as any).title;

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
      return false;
    }

    const eligibleFaculties = this.clusterMap[canonicalFacultyTitle] || [];
    const eligibleFacultyKeywords = eligibleFaculties.map((title) =>
      title.split('(')[0].trim()
    );

    const regexPattern = eligibleFacultyKeywords
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    const facultyIds = await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id');

    const facultyIdList = facultyIds.map((f) => f._id.toString());

    return facultyIdList.includes(reviewerFacultyId.toString());
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

    const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

    let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

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
    const eligibleFacultyKeywords = eligibleFaculties.map((title) =>
      title.split('(')[0].trim()
    );

    const regexPattern = eligibleFacultyKeywords
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    const facultyIds = await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id');

    const facultyIdList = facultyIds.map((f) => f._id);

    // Get existing reviewers for this proposal
    const existingReviewerIds = await Review.find({
      proposal: proposalId,
    }).distinct('reviewer');

    // Find eligible reviewers
    const eligibleReviewers = await User.aggregate([
      {
        $match: {
          faculty: { $in: facultyIdList },
          role: UserRole.REVIEWER,
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
        },
      },
      {
        $sort: {
          pendingReviewsCount: 1,
          _id: 1,
        },
      },
      {
        $limit: 1,
      },
    ]);

    return eligibleReviewers.length > 0 ? eligibleReviewers[0] : null;
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

    const cleanedFacultyTitle = rawFacultyTitle.split('(')[0].trim();

    let canonicalFacultyTitle: keyof typeof this.clusterMap | undefined;

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
    const eligibleFacultyKeywords = eligibleFaculties.map((title) =>
      title.split('(')[0].trim()
    );

    const regexPattern = eligibleFacultyKeywords
      .map((keyword) => `.*${keyword}.*`)
      .join('|');
    const facultyTitleRegex = new RegExp(regexPattern, 'i');

    const facultyIds = await Faculty.find({
      title: { $regex: facultyTitleRegex },
    }).select('_id');

    const facultyIdList = facultyIds.map((f) => f._id);

    // Get existing reviewers for this proposal
    const existingReviewerIds = await Review.find({
      proposal: proposalId,
      reviewType: ReviewType.HUMAN,
    }).distinct('reviewer');

    // First, try to find eligible reconciliation reviewer with good history
    let eligibleReviewer = await User.aggregate([
      {
        $match: {
          faculty: { $in: facultyIdList },
          role: UserRole.REVIEWER,
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
          completedReviewsCount: {
            $size: {
              $filter: {
                input: '$activeReviews',
                as: 'review',
                cond: { $eq: ['$$review.status', 'completed'] },
              },
            },
          },
        },
      },
      {
        $match: {
          completedReviewsCount: { $gt: 0 },
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

    // If no reviewer found with completed reviews, find any available reviewer
    if (eligibleReviewer.length === 0) {
      eligibleReviewer = await User.aggregate([
        {
          $match: {
            faculty: { $in: facultyIdList },
            role: UserRole.REVIEWER,
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
          },
        },
        {
          $sort: {
            pendingReviewsCount: 1,
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
}

export default new ReassignReviewController();