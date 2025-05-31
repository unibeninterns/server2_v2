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
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import { Types } from 'mongoose';

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

  private keywordToFacultyMap: { [key: string]: keyof typeof ReassignReviewController.prototype.clusterMap } = {
    "Agriculture": "Faculty of Agriculture",
    "Life Sciences": "Faculty of Life Sciences",
    "Veterinary Medicine": "Faculty of Veterinary Medicine",
    "Pharmacy": "Faculty of Pharmacy",
    "Dentistry": "Faculty of Dentistry",
    "Medicine": "Faculty of Medicine",
    "Basic Medical Sciences": "Faculty of Basic Medical Sciences",
    "Management Sciences": "Faculty of Management Sciences",
    "Education": "Faculty of Education",
    "Social Sciences": "Faculty of Social Sciences",
    "Vocational Education": "Faculty of Vocational Education",
    "Law": "Faculty of Law",
    "Arts": "Faculty of Arts",
    "Institute of Education": "Institute of Education",
    "Engineering": "Faculty of Engineering",
    "Physical Sciences": "Faculty of Physical Sciences",
    "Environmental Sciences": "Faculty of Environmental Sciences",
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

        // Verify