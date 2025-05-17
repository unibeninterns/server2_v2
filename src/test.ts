import { Request, Response } from 'express';
import crypto from 'crypto';
import Reviewer from '../models/reviewer.model';
import User from '../../model/user.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import Review, { ReviewStatus } from '../models/review.model';
import Faculty from '../../Proposal_Submission/models/faculty.model';
import Department from '../../Proposal_Submission/models/department.model';
import emailService from '../../services/email.service';
import { NotFoundError, UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import jwt from 'jsonwebtoken';
import moment from 'moment';

interface IReviewerResponse {
  success: boolean;
  message?: string;
  data?: any;
  count?: number;
}

class ReviewerController {
  // Admin functionality: Invite a new reviewer
  inviteReviewer = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const { email } = req.body;

      // Check if reviewer already exists
      let reviewer = await Reviewer.findOne({ email });

      if (reviewer) {
        if (reviewer.isProfileComplete) {
          res.status(400).json({
            success: false,
            message:
              'Reviewer with this email already exists and has completed their profile',
          });
          return;
        }

        // Generate a new token and update expiry
        const token = crypto.randomBytes(20).toString('hex');
        reviewer.invitationToken = token;
        reviewer.invitationExpires = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ); // 7 days
        await reviewer.save();

        // Send invitation email
        await emailService.sendReviewerInvitation(email, token);

        res.status(200).json({
          success: true,
          message: 'Invitation re-sent to existing reviewer',
          data: reviewer,
        });
        return;
      }

      // Create new reviewer with invitation token
      const token = crypto.randomBytes(20).toString('hex');
      reviewer = new Reviewer({
        email,
        invitationToken: token,
        invitationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        isProfileComplete: false,
      });

      await reviewer.save();

      // Send invitation email
      await emailService.sendReviewerInvitation(email, token);

      logger.info(`Reviewer invitation sent to ${email}`);

      res.status(201).json({
        success: true,
        message: 'Reviewer invitation sent successfully',
        data: reviewer,
      });
    }
  );

  // Complete reviewer profile with invitation token
  completeReviewerProfile = asyncHandler(
    async (
      req: Request<{ token: string }>,
      res: Response<IReviewerResponse>
    ): Promise<void> => {
      const { token } = req.params;
      const {
        name,
        facultyId,
        departmentId,
        phoneNumber,
        academicTitle,
        alternativeEmail,
      } = req.body;

      // Find reviewer by token
      const reviewer = await Reviewer.findOne({
        invitationToken: token,
        invitationExpires: { $gt: Date.now() },
      });

      if (!reviewer) {
        throw new NotFoundError('Invalid or expired invitation token');
      }

      // Validate faculty and department existence
      const faculty = await Faculty.findById(facultyId);
      const department = await Department.findById(departmentId);

      if (!faculty || !department) {
        throw new NotFoundError('Faculty or department not found');
      }

      // Update reviewer profile
      reviewer.name = name;
      reviewer.faculty = faculty.code;
      reviewer.department = department.code;
      reviewer.phoneNumber = phoneNumber;
      reviewer.academicTitle = academicTitle;
      reviewer.alternativeEmail = alternativeEmail;
      reviewer.isProfileComplete = true;
      reviewer.invitationToken = undefined;
      reviewer.invitationExpires = undefined;

      await reviewer.save();

      // Generate JWT token for reviewer
      const jwtToken = jwt.sign(
        { id: reviewer._id, email: reviewer.email, role: 'reviewer' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1d' }
      );

      logger.info(`Reviewer profile completed for ${reviewer.email}`);

      res.status(200).json({
        success: true,
        message: 'Reviewer profile completed successfully',
        data: {
          reviewer,
          token: jwtToken,
        },
      });
    }
  );

  // Admin functionality: Add reviewer profile directly
  addReviewerProfile = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const {
        email,
        name,
        facultyId,
        departmentId,
        phoneNumber,
        academicTitle,
        alternativeEmail,
      } = req.body;

      // Check if reviewer already exists
      let reviewer = await Reviewer.findOne({ email });

      if (reviewer && reviewer.isProfileComplete) {
        res.status(400).json({
          success: false,
          message: 'Reviewer with this email already exists',
        });
        return;
      }

      // Validate faculty and department existence
      const faculty = await Faculty.findById(facultyId);
      const department = await Department.findById(departmentId);

      if (!faculty || !department) {
        throw new NotFoundError('Faculty or department not found');
      }

      if (reviewer) {
        // Update existing reviewer
        reviewer.name = name;
        reviewer.faculty = faculty.code;
        reviewer.department = department.code;
        reviewer.phoneNumber = phoneNumber;
        reviewer.academicTitle = academicTitle;
        reviewer.alternativeEmail = alternativeEmail;
        reviewer.isProfileComplete = true;
        reviewer.invitationToken = undefined;
        reviewer.invitationExpires = undefined;
      } else {
        // Create new reviewer
        reviewer = new Reviewer({
          email,
          name,
          faculty: faculty.code,
          department: department.code,
          phoneNumber,
          academicTitle,
          alternativeEmail,
          isProfileComplete: true,
        });
      }

      await reviewer.save();

      logger.info(`Reviewer profile added for ${email} by admin`);

      res.status(201).json({
        success: true,
        message: 'Reviewer profile added successfully',
        data: reviewer,
      });
    }
  );

  // Admin functionality: Get all reviewers
  getAllReviewers = asyncHandler(
    async (_req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const reviewers = await Reviewer.find().sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        count: reviewers.length,
        data: reviewers,
      });
    }
  );

  // Admin functionality: Get reviewer by ID
  getReviewerById = asyncHandler(
    async (
      req: Request<{ id: string }>,
      res: Response<IReviewerResponse>
    ): Promise<void> => {
      const reviewer = await Reviewer.findById(req.params.id)
        .populate({
          path: 'assignedProposals',
          populate: {
            path: 'submitter',
            select: 'name email',
          },
        })
        .populate('completedReviews');

      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      res.status(200).json({
        success: true,
        data: reviewer,
      });
    }
  );

  // Admin functionality: Delete reviewer
  deleteReviewer = asyncHandler(
    async (
      req: Request<{ id: string }>,
      res: Response<IReviewerResponse>
    ): Promise<void> => {
      const reviewer = await Reviewer.findById(req.params.id);

      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      // Instead of hard delete, set active to false
      reviewer.active = false;
      await reviewer.save();

      logger.info(`Reviewer ${reviewer.email} deactivated by admin`);

      res.status(200).json({
        success: true,
        message: 'Reviewer deactivated successfully',
      });
    }
  );

  // Admin functionality: Resend invitation
  resendInvitation = asyncHandler(
    async (
      req: Request<{ id: string }>,
      res: Response<IReviewerResponse>
    ): Promise<void> => {
      const reviewer = await Reviewer.findById(req.params.id);

      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      if (reviewer.isProfileComplete) {
        res.status(400).json({
          success: false,
          message: 'Reviewer has already completed their profile',
        });
        return;
      }

      // Generate new token
      const token = crypto.randomBytes(20).toString('hex');
      reviewer.invitationToken = token;
      reviewer.invitationExpires = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ); // 7 days
      await reviewer.save();

      // Send invitation email
      await emailService.sendReviewerInvitation(reviewer.email, token);

      logger.info(`Invitation resent to reviewer ${reviewer.email}`);

      res.status(200).json({
        success: true,
        message: 'Invitation resent successfully',
      });
    }
  );

  // Reviewer functionality: Get reviewer dashboard
  getReviewerDashboard = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const reviewerId = (req as any).reviewer.id;

      const reviewer = await Reviewer.findById(reviewerId);
      if (!reviewer) {
        throw new UnauthorizedError('Reviewer not found');
      }

      // Get assigned proposals with their details
      const assignedProposals = await Proposal.find({
        _id: { $in: reviewer.assignedProposals },
      })
        .populate('submitter', 'name email')
        .sort({ createdAt: -1 });

      // Get completed reviews
      const completedReviews = await Review.find({
        _id: { $in: reviewer.completedReviews },
      }).populate('proposal', 'projectTitle submitterType');

      // Get in-progress reviews
      const inProgressReviews = await Review.find({
        reviewer: reviewerId,
        status: ReviewStatus.IN_PROGRESS,
      }).populate('proposal', 'projectTitle submitterType');

      // Get overdue reviews
      const overdueReviews = await Review.find({
        reviewer: reviewerId,
        status: ReviewStatus.OVERDUE,
      }).populate('proposal', 'projectTitle submitterType');

      res.status(200).json({
        success: true,
        data: {
          reviewer,
          assignedProposals,
          completedReviews,
          inProgressReviews,
          overdueReviews,
          stats: {
            totalAssigned: assignedProposals.length,
            completed: completedReviews.length,
            inProgress: inProgressReviews.length,
            overdue: overdueReviews.length,
          },
        },
      });
    }
  );
}

export default new ReviewerController();
