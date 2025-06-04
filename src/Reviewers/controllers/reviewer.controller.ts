/* eslint-disable max-lines */
import { Request, Response } from 'express';
import crypto from 'crypto';
import User, { UserRole } from '../../model/user.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import Faculty from '../../Proposal_Submission/models/faculty.model';
import Department from '../../Proposal_Submission/models/department.model';
import Review, { ReviewStatus } from '../../Review_System/models/review.model';
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
    _id: string;
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

      const existingReviewer = await User.findOne({ email });
      if (existingReviewer) {
        logger.warn(`Attempt to invite already registered email: ${email}`);
        throw new BadRequestError('Email already registered');
      }

      // Generate invite token
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(inviteToken)
        .digest('hex');

      // Store invitation
      await User.create({
        email,
        inviteToken: hashedToken,
        inviteTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        role: UserRole.REVIEWER,
        invitationStatus: 'pending',
        isActive: false,
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

      const reviewer = await User.findOne({
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
      if (!department) {
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
      reviewer.isActive = true;
      reviewer.inviteToken = undefined;
      reviewer.inviteTokenExpires = undefined;
      reviewer.invitationStatus = 'accepted';

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

  // Add a reviewer profile manually (without invitation)
  addReviewerProfile = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const {
        email,
        name,
        facultyId,
        departmentId,
        phoneNumber,
        academicTitle,
        alternativeEmail,
      } = req.body;

      logger.info(
        `Manual reviewer profile creation request for email: ${email}`
      );

      // Check if reviewer already exists
      const existingReviewer = await User.findOne({ email });
      if (existingReviewer) {
        logger.warn(
          `Attempt to create profile for already registered email: ${email}`
        );
        throw new BadRequestError('Email already registered as a reviewer');
      }

      // Validate faculty and department
      const faculty = await Faculty.findById(facultyId);
      if (!faculty) {
        throw new BadRequestError('Invalid faculty selected');
      }

      const department = await Department.findById(departmentId);
      if (!department) {
        throw new BadRequestError('Invalid department selected');
      }

      // Generate a secure password for the reviewer
      const generatedPassword = generateSecurePassword();

      // Create new reviewer profile
      const newReviewer = await User.create({
        email,
        name,
        faculty: faculty._id as unknown as Types.ObjectId,
        department: department._id as unknown as Types.ObjectId,
        phoneNumber,
        academicTitle,
        alternativeEmail,
        password: generatedPassword,
        role: UserRole.REVIEWER,
        isActive: true,
        invitationStatus: 'added',
        assignedProposals: [],
      });

      logger.info(`Reviewer profile manually created for: ${email}`);

      // Send login credentials to the reviewer
      await emailService.sendReviewerCredentialsEmail(email, generatedPassword);
      logger.info(`Login credentials sent to reviewer: ${email}`);

      res.status(201).json({
        success: true,
        message:
          'Reviewer profile created successfully. Login credentials have been sent to their email.',
        data: {
          id: newReviewer._id,
          email: newReviewer.email,
          name: newReviewer.name,
          faculty: newReviewer.faculty,
          department: newReviewer.department,
          academicTitle: newReviewer.academicTitle,
        },
      });
    }
  );

  // Get all reviewers with pagination, filtering, and statistics
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

      // Base query to filter only reviewers
      const query: any = {
        role: UserRole.REVIEWER, // Add this filter for reviewers only
      };

      // Apply additional filters if provided
      if (status) query.invitationStatus = status as string;
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

      const reviewers = await User.find(query)
        .sort(sortObj)
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .populate('faculty', 'title code')
        .populate('department', 'title code')
        .populate({
          path: 'assignedProposals',
          select: 'projectTitle submitter', // Select relevant fields from Proposal
          populate: {
            path: 'submitter',
            select: 'name email', // Select relevant fields from Submitter (User)
          },
        });

      const totalReviewers = await User.countDocuments(query);

      // Get statistics and assigned proposals for each reviewer
      const reviewersWithDetails = await Promise.all(
        reviewers.map(async (reviewer) => {
          // Get assigned reviews (all reviews assigned to this reviewer)
          // This count is based on the Review model, not directly from User.assignedProposals
          const assignedReviewsCount = await Review.countDocuments({
            reviewer: reviewer._id,
          });

          // Get completed reviews
          const completedReviewsCount = await Review.countDocuments({
            reviewer: reviewer._id,
            status: ReviewStatus.COMPLETED,
          });

          // Calculate completion rate
          const completionRate =
            assignedReviewsCount > 0
              ? Math.round((completedReviewsCount / assignedReviewsCount) * 100)
              : 0;

          // Fetch all reviews assigned to this reviewer
          const allAssignedReviews = await Review.find({
            reviewer: reviewer._id,
            reviewType: { $ne: 'ai' }, // Exclude AI reviews if necessary
          }).populate('proposal', 'projectTitle submitterType'); // Populate proposal details for each review

          return {
            ...reviewer.toObject(),
            statistics: {
              assigned: assignedReviewsCount,
              completed: completedReviewsCount,
              completionRate,
            },
            // Include the populated assignedProposals directly
            assignedProposals: reviewer.assignedProposals,
          };
        })
      );

      logger.info(`Admin ${user._id} retrieved reviewers list`);

      res.status(200).json({
        success: true,
        count: reviewers.length,
        totalPages: Math.ceil(totalReviewers / options.limit),
        currentPage: options.page,
        data: reviewersWithDetails,
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

      const reviewer = await User.findOne({
        _id: id,
        role: UserRole.REVIEWER,
      })
        .populate('faculty', 'title code')
        .populate('department', 'title code');
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      // Fetch all reviews assigned to this reviewer
      const allAssignedReviews = await Review.find({
        reviewer: reviewer._id,
        reviewType: { $ne: 'ai' }, // Exclude AI reviews if necessary, based on the getReviewerDashboard
      }).populate({
        path: 'proposal',
        select: 'projectTitle submitterType submitter',
        populate: {
          path: 'submitter',
          select: 'name email',
        },
      });

      // Filter reviews by status
      const completedReviews = allAssignedReviews.filter(
        (review) => review.status === ReviewStatus.COMPLETED
      );
      const inProgressReviews = allAssignedReviews.filter(
        (review) => review.status === ReviewStatus.IN_PROGRESS
      );
      const overdueReviews = allAssignedReviews.filter(
        (review) => review.status === ReviewStatus.OVERDUE
      );

      // Combine in-progress and overdue reviews to represent "assigned proposals reviews" (incomplete ones)
      const assignedProposalsReviews = [...inProgressReviews, ...overdueReviews];

      logger.info(`Admin ${user._id} retrieved reviewer ${id}`);

      res.status(200).json({
        success: true,
        data: {
          ...reviewer.toObject(), // Convert Mongoose document to plain object
          // Set assignedProposals to be the list of incomplete reviews as per user's clarification
          assignedProposals: assignedProposalsReviews,
          allAssignedReviews, // Still provide all assigned review documents
          completedReviews,
          inProgressReviews,
          overdueReviews,
        },
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

      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid reviewer ID');
      }

      const reviewer = await User.findById(id);
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      // Check if reviewer has assigned proposals
      if ((reviewer.assignedProposals ?? []).length > 0) {
        throw new BadRequestError(
          'Cannot delete reviewer with assigned proposals. Please reassign them first.'
        );
      }

      await User.findByIdAndDelete(id);
      logger.info(`Admin ${user._id} deleted reviewer ${id}`);

      res.status(200).json({
        success: true,
        message: 'Reviewer deleted successfully',
      });
    }
  );

  // Get all reviewer invitations
  getInvitations = asyncHandler(
    async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      // Update expired invitations
      await User.updateMany(
        {
          role: UserRole.REVIEWER,
          invitationStatus: 'pending',
          inviteTokenExpires: { $lt: new Date() },
        },
        { invitationStatus: 'expired' }
      );

      const invitations = await User.find({
        role: UserRole.REVIEWER,
        invitationStatus: { $in: ['pending', 'expired', 'accepted', 'added'] },
      }).select('_id email inviteTokenExpires createdAt invitationStatus');

      const formattedInvitations = invitations.map((invitation) => ({
        id: invitation._id,
        email: invitation.email,
        status: invitation.invitationStatus,
        created: invitation.createdAt.toISOString().split('T')[0],
        expires: invitation.inviteTokenExpires
          ? invitation.inviteTokenExpires.toISOString().split('T')[0]
          : null,
      }));

      logger.info(`Admin ${user._id} retrieved reviewer invitations list`);

      res.status(200).json({
        success: true,
        data: formattedInvitations,
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

      const reviewer = await User.findById(id);
      if (!reviewer) {
        throw new NotFoundError('Reviewer not found');
      }

      if (reviewer.invitationStatus !== 'pending') {
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
      const user = (req as AuthenticatedRequest).user;

      const userId = user._id;
      logger.info(`Reviewer dashboard request for user: ${userId}`);

      const reviewer = await User.findById(userId).select(
        '-password -refreshToken'
      );

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

      // Get completed reviews
      const completedReviews = await Review.find({
        reviewer: userId,
        status: ReviewStatus.COMPLETED,
      }).populate('proposal', 'projectTitle submitterType');

      // Get in-progress reviews
      const inProgressReviews = await Review.find({
        reviewer: userId,
        status: ReviewStatus.IN_PROGRESS,
      }).populate('proposal', 'projectTitle submitterType');

      // Get overdue reviews
      const overdueReviews = await Review.find({
        reviewer: userId,
        status: ReviewStatus.OVERDUE,
      }).populate('proposal', 'projectTitle submitterType');

      const totalAssigned = await Review.find({
        reviewer: userId,
        reviewType: { $ne: 'ai' },
      }).populate('proposal', 'projectTitle submitterType');

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
            completed: completedReviews.length,
            inProgress: inProgressReviews.length,
            overdue: overdueReviews.length,
            totalAssigned: totalAssigned.length,
          },
          assignedProposals,
          completedReviews,
          inProgressReviews,
          overdueReviews,
        },
      });
    }
  );
}

export default new ReviewerController();
