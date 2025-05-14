import { Request, Response } from 'express';
import crypto from 'crypto';
import Reviewer, { ReviewerStatus } from '../model/reviewer.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import Faculty from '../../Proposal_Submission/models/faculty.model';
import Department from '../../Proposal_Submission/models/department.model';
import emailService from '../../services/email.service';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import generateSecurePassword from '../../utils/passwordGenerator';
import { Types } from 'mongoose';

interface IReviewerQuery {
  status?: string;
  faculty?: string;
  department?: string;
}

interface IPaginationOptions {
  page: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

interface IReviewerResponse {
  success: boolean;
  count?: number;
  totalPages?: number;
  currentPage?: number;
  message?: string;
  data?: any;
}

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email?: string;
    role: string;
  };
}

class ReviewerController {
  // Invite a reviewer by email
  inviteReviewer = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { email } = req.body;

      logger.info(`Reviewer invitation request received for email: ${email}`);

      const existingReviewer = await Reviewer.findOne({ email });
      if (existingReviewer) {
        logger.warn(
          `Attempt to invite already registered reviewer email: ${email}`
        );
        throw new BadRequestError('Email already registered as a reviewer');
      }

      // Generate invite token
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(inviteToken)
        .digest('hex');

      // Store invitation
      await Reviewer.create({
        email,
        inviteToken: hashedToken,
        inviteTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: ReviewerStatus.PENDING,
        assignedProposals: [],
      });

      logger.info(`Created reviewer invitation record for email: ${email}`);

      // Send invitation email
      await emailService.sendReviewerInvitationEmail(email, inviteToken);
      logger.info(`Reviewer invitation email sent to: ${email}`);

      res.status(200).json({
        success: true,
        message: 'Reviewer invitation sent successfully',
      });
    }
  );

  // Complete reviewer profile from invitation
  completeReviewerProfile = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { token } = req.params;
      const {
        name,
        facultyId,
        departmentId,
        phoneNumber,
        academicTitle,
        alternativeEmail,
      } = req.body;

      logger.info(
        `Reviewer profile completion attempt with token: ${token.substring(0, 8)}...`
      );

      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const reviewer = await Reviewer.findOne({
        inviteToken: hashedToken,
        inviteTokenExpires: { $gt: Date.now() },
      });

      if (!reviewer) {
        logger.warn(
          `Invalid or expired reviewer invitation token: ${token.substring(0, 8)}...`
        );
        throw new BadRequestError('Invalid or expired invitation token');
      }

      // Validate faculty and department
      const faculty = await Faculty.findById(facultyId);
      if (!faculty) {
        throw new BadRequestError('Invalid faculty selected');
      }

      const department = await Department.findById(departmentId);
      if (!department || department.faculty.toString() !== facultyId) {
        throw new BadRequestError('Invalid department selected');
      }

      // Generate a secure password for the reviewer
      const generatedPassword = generateSecurePassword();

      // Update reviewer profile
      reviewer.name = name;
      reviewer.faculty = faculty._id as unknown as Types.ObjectId;
      reviewer.department = department._id as unknown as Types.ObjectId;
      reviewer.phoneNumber = phoneNumber;
      reviewer.academicTitle = academicTitle;
      reviewer.alternativeEmail = alternativeEmail;
      reviewer.password = generatedPassword;
      reviewer.status = ReviewerStatus.ACTIVE;
      reviewer.inviteToken = undefined;
      reviewer.inviteTokenExpires = undefined;
      reviewer.completedAt = new Date();

      await reviewer.save();
      logger.info(`Reviewer profile completed for: ${reviewer.email}`);

      // Send login credentials to the reviewer
      await emailService.sendReviewerCredentialsEmail(
        reviewer.email,
        generatedPassword
      );
      logger.info(`Login credentials sent to reviewer: ${reviewer.email}`);

      res.status(200).json({
        success: true,
        message:
          'Profile completed successfully. Login credentials have been sent to your email.',
      });
    }
  );

  // Get all reviewers with pagination and filtering
  getAllReviewers = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const {
        page = 1,
        limit = 10,
        status,
        faculty,
        department,
        sort = 'createdAt',
        order = 'desc',
      } = req.query;

      const query: IReviewerQuery = {};

      // Apply filters if provided
      if (status) query.status = status as string;
      if (faculty) query.faculty = faculty as string;
      if (department) query.department = department as string;

      // Build sort object
      const sortObj: Record<string, 1 | -1> = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      const options: IPaginationOptions = {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sort: sortObj,
      };

      const reviewers = await Reviewer.find(query)
        .sort(sortObj)
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .populate('faculty', 'name code')
        .populate('department', 'name code');

      const totalReviewers = await Reviewer.countDocuments(query);

      logger.info(`Admin ${user.userId} retrieved reviewers list`);

      res.status(200).json({
        success: true,
        count: reviewers.length,
        totalPages: Math.ceil(totalReviewers / options.limit),
        currentPage: options.page,
        data: reviewers,
      });
    }
  );

  // Get reviewer by ID
  getReviewerById = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;

      const reviewer = await Reviewer.findById(id)
        .populate('faculty', 'name code')
        .populate('department', 'name code');

      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      logger.info(`Admin ${user.userId} retrieved reviewer ${id}`);

      res.status(200).json({
        success: true,
        data: reviewer,
      });
    }
  );

  // Delete a reviewer
  deleteReviewer = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;

      const reviewer = await Reviewer.findById(id);
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      // Check if reviewer has assigned proposals
      if (reviewer.assignedProposals.length > 0) {
        throw new BadRequestError(
          'Cannot delete reviewer with assigned proposals. Please reassign them first.'
        );
      }

      await Reviewer.findByIdAndDelete(id);
      logger.info(`Admin ${user.userId} deleted reviewer ${id}`);

      res.status(200).json({
        success: true,
        message: 'Reviewer deleted successfully',
      });
    }
  );

  // Resend invitation
  resendInvitation = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;

      const reviewer = await Reviewer.findById(id);
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      if (reviewer.status !== ReviewerStatus.PENDING) {
        throw new BadRequestError(
          'Can only resend invitations for pending reviewers'
        );
      }

      // Generate new invite token
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(inviteToken)
        .digest('hex');

      // Update reviewer with new token
      reviewer.inviteToken = hashedToken;
      reviewer.inviteTokenExpires = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ); // 30 days

      await reviewer.save();
      logger.info(`Reviewer invitation resent for email: ${reviewer.email}`);

      // Send invitation email
      await emailService.sendReviewerInvitationEmail(
        reviewer.email,
        inviteToken
      );
      logger.info(`Reviewer invitation email resent to: ${reviewer.email}`);

      res.status(200).json({
        success: true,
        message: 'Reviewer invitation resent successfully',
      });
    }
  );

  // Get reviewer dashboard
  getReviewerDashboard = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as AuthenticatedRequest).user.userId;

      const reviewer = await Reviewer.findById(userId);
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      // Get assigned proposals with details
      const assignedProposals = await Proposal.find({
        _id: { $in: reviewer.assignedProposals },
      })
        .populate('submitter', 'name email')
        .populate('faculty', 'name code')
        .populate('department', 'name code')
        .select('-docFile -cvFile');

      // Calculate statistics
      const pendingReviews = assignedProposals.filter(
        (p) => p.reviewStatus === 'pending'
      ).length;
      const completedReviews = assignedProposals.filter(
        (p) => p.reviewStatus === 'reviewed'
      ).length;
      const totalAssigned = assignedProposals.length;

      logger.info(`Reviewer ${userId} viewed their dashboard`);

      res.status(200).json({
        success: true,
        data: {
          reviewer: {
            name: reviewer.name,
            email: reviewer.email,
            department: reviewer.department,
            faculty: reviewer.faculty,
            academicTitle: reviewer.academicTitle,
          },
          statistics: {
            pendingReviews,
            completedReviews,
            totalAssigned,
          },
          assignedProposals,
        },
      });
    }
  );
}

export default new ReviewerController();
