/* eslint-disable max-lines */
import { Request, Response } from 'express';
import Proposal, {
  ProposalStatus,
} from '../Proposal_Submission/models/proposal.model';
import { NotFoundError, UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';
import User, { IUser } from '../model/user.model'; // Import IUser interface
import Faculty from '../Proposal_Submission/models/faculty.model';
import emailService from '../services/email.service'; // Import email service
import Award, { AwardStatus } from '../Review_System/models/award.model';
// Define a generic response interface for admin controller
interface IAdminResponse {
  success: boolean;
  message?: string;
  data?: any;
  count?: number;
  totalPages?: number;
  currentPage?: number;
}

interface IProposalQuery {
  status?: string;
  submitterType?: string;
  isArchived?: boolean; // Add this new field
}

interface IPaginationOptions {
  page: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

interface IProposalResponse {
  success: boolean;
  count?: number;
  totalPages?: number;
  currentPage?: number;
  message?: string;
  data?: any;
}

interface IStatisticsResponse {
  success: boolean;
  data: {
    total: number;
    byType: {
      staff: number;
      master_student: number;
    };
    byStatus: Record<string, number>;
  };
}

interface AdminAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

class AdminController {
  // Get proposals ready for final decision
  getProposalsForDecision = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const {
        page = 1,
        limit = 10,
        sort = 'createdAt',
        order = 'desc',
      } = req.query;

      const query = {
        reviewStatus: { $in: ['reviewed'] }, // Proposals that have completed review or reconciliation
      };

      const sortObj: Record<string, 1 | -1> = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      const options: IPaginationOptions = {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sort: sortObj,
      };

      const proposals = await Proposal.find(query)
        .sort(sortObj)
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .populate({
          path: 'submitter',
          select:
            'name email userType phoneNumber alternativeEmail faculty department',
          populate: [
            { path: 'faculty', select: 'title' },
            { path: 'department', select: 'title' },
          ],
        });

      const totalProposals = await Proposal.countDocuments(query);

      logger.info(`Admin ${user.id} retrieved proposals for decision`);

      res.status(200).json({
        success: true,
        count: proposals.length,
        totalPages: Math.ceil(totalProposals / options.limit),
        currentPage: options.page,
        data: proposals,
      });
    }
  );

  // Update proposal status (can be used for final decision)
  updateProposalStatus = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { status, finalScore, fundingAmount, feedbackComments } = req.body;

      const proposal = await Proposal.findById(id);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      if (status) {
        proposal.status = status;

        if (proposal.status === ProposalStatus.APPROVED) {
          // Find and update the award status
          await Award.findOneAndUpdate(
            { proposal: proposal._id },
            {
              status: AwardStatus.APPROVED,
              approvedBy: user.id,
              approvedAt: new Date(),
              feedbackComments:
                feedbackComments || 'Your proposal has been approved.',
            },
            { new: true }
          );
        } else if (proposal.status === ProposalStatus.REJECTED) {
          // Update award status to declined
          await Award.findOneAndUpdate(
            { proposal: proposal._id },
            {
              status: AwardStatus.DECLINED,
              feedbackComments:
                feedbackComments || 'Your proposal has been declined.',
            },
            { new: true }
          );
        }
      }
      // Optionally update other fields if provided, e.g., from finalizeProposalDecision
      if (finalScore !== undefined) proposal.finalScore = finalScore;
      if (fundingAmount !== undefined) proposal.fundingAmount = fundingAmount;
      if (feedbackComments !== undefined)
        proposal.feedbackComments = feedbackComments;

      await proposal.save();

      logger.info(
        `Admin ${user.id} updated status for proposal ${id} to ${status}`
      );

      res.status(200).json({
        success: true,
        message: 'Proposal status updated successfully',
        data: proposal,
      });
    }
  );

  // Notify applicants about decision
  notifyApplicants = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { proposalId } = req.params; // Assuming proposalId is passed in params

      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'email name faculty department',
        populate: [
          { path: 'faculty', select: 'title' },
          { path: 'department', select: 'title' },
        ],
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      if (!proposal.submitter) {
        throw new Error('Submitter not found for notification');
      }

      const submitterUser = proposal.submitter as unknown as IUser; // Explicitly cast to IUser type

      if (!submitterUser.email || !proposal.projectTitle) {
        throw new Error('Submitter email or proposal title not found for notification');
      }

      await emailService.sendProposalStatusUpdateEmail(
        submitterUser.email,
        submitterUser.name,
        proposal.projectTitle as string, // Explicitly cast to string
        proposal.status,
        proposal.fundingAmount,
        proposal.feedbackComments
      );

      logger.info(
        `Admin ${user.id} notified applicant for proposal ${proposalId}`
      );

      res.status(200).json({
        success: true,
        message: 'Applicant notified successfully',
      });
    }
  );

  // Export decisions report
  exportDecisionsReport = asyncHandler(
    async (req: Request, res: Response<string>): Promise<void> => {
      // Changed Response type to string
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      // Fetch proposals that have a final decision (approved/rejected)
      const proposals = await Proposal.find({
        status: { $in: ['approved', 'rejected'] },
      }).populate({
        path: 'submitter',
        select: 'name email faculty department',
        populate: [
          { path: 'faculty', select: 'title' },
          { path: 'department', select: 'title' },
        ],
      }); // Populate submitter details

      // Basic CSV generation (for demonstration)
      let csvContent =
        'Proposal Title,Submitter Name,Submitter Email,Faculty,Department,Decision,Final Score,Funding Amount,Feedback\n';

      proposals.forEach((proposal) => {
        const submitterUser = proposal.submitter as unknown as IUser; // Explicitly cast to IUser type
        const submitterName = submitterUser ? submitterUser.name : 'N/A';
        const submitterEmail = submitterUser ? submitterUser.email : 'N/A';
        const facultyName = (submitterUser.faculty as any)?.title || 'N/A'; // Access title from populated faculty
        const departmentName =
          (submitterUser.department as any)?.title || 'N/A'; // Access title from populated department

        // eslint-disable-next-line max-len
        csvContent += `"${proposal.projectTitle}","${submitterName}","${submitterEmail}","${facultyName}","${departmentName}","${proposal.status || 'N/A'}",${proposal.finalScore || 'N/A'},${proposal.fundingAmount || 'N/A'},"${proposal.feedbackComments || 'N/A'}"\n`;
      });

      res.header('Content-Type', 'text/csv');
      res.attachment('decisions_report.csv');
      res.status(200).send(csvContent);

      logger.info(`Admin ${user.id} exported decisions report`);
    }
  );

  // Get all proposals with pagination and filtering
  getAllProposals = asyncHandler(
    async (req: Request, res: Response<IProposalResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
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
        submitterType,
        faculty,
        sort = 'createdAt',
        order = 'desc',
        isArchived, // Add this new query parameter
      } = req.query;

      const query: IProposalQuery = {};

      // Apply filters if provided
      if (status) query.status = status as string;
      if (submitterType) query.submitterType = submitterType as string;
      // Apply isArchived filter
      if (isArchived !== undefined) {
        query.isArchived = isArchived === 'true'; // Convert string to boolean
      } else {
        query.isArchived = false; // Default to fetching non-archived proposals
      }

      // Build sort object
      const sortObj: Record<string, 1 | -1> = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      const options: IPaginationOptions = {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sort: sortObj,
      };

      // Add faculty filter logic
      let proposals;

      if (faculty) {
        // Since faculty is stored in the User model, we need to first find users with the specified faculty
        const usersWithFaculty = await User.find({
          faculty: faculty as string,
        }).select('_id');
        const userIds = usersWithFaculty.map((user) => user._id);

        // Then find proposals submitted by those users
        proposals = await Proposal.find({
          ...query,
          submitter: { $in: userIds },
        })
          .sort({ [sort as string]: order === 'asc' ? 1 : -1 })
          .skip(
            (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10)
          )
          .limit(parseInt(limit as string, 10))
          .populate(
            'submitter',
            'name email userType phoneNumber alternativeEmail'
          );

        // Count total for pagination
        const totalProposals = await Proposal.countDocuments({
          ...query,
          submitter: { $in: userIds },
        });

        logger.info(
          `Admin ${user.id} retrieved proposals list filtered by faculty`
        );

        res.status(200).json({
          success: true,
          count: proposals.length,
          totalPages: Math.ceil(totalProposals / parseInt(limit as string, 10)),
          currentPage: parseInt(page as string, 10),
          data: proposals,
        });
      } else {
        const proposals = await Proposal.find(query)
          .sort(sortObj)
          .skip((options.page - 1) * options.limit)
          .limit(options.limit)
          .populate(
            'submitter',
            'name email userType phoneNumber alternativeEmail'
          );

        const totalProposals = await Proposal.countDocuments(query);

        logger.info(`Admin ${user.id} retrieved proposals list`);

        res.status(200).json({
          success: true,
          count: proposals.length,
          totalPages: Math.ceil(totalProposals / options.limit),
          currentPage: options.page,
          data: proposals,
        });
      }
    }
  );

  // Get proposal by ID
  getProposalById = asyncHandler(
    async (req: Request, res: Response<IProposalResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;

      const proposal = await Proposal.findById(id).populate(
        'submitter',
        'name email userType phoneNumber alternativeEmail faculty department academicTitle'
      );

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      logger.info(`Admin ${user.id} retrieved proposal ${id}`);

      res.status(200).json({
        success: true,
        data: proposal,
      });
    }
  );

  getFacultiesWithProposals = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      logger.info(`Admin ${user.id} retrieving faculties with proposals`);

      try {
        // Get all submitters who have created proposals
        const proposalSubmitters = await Proposal.find().distinct('submitter');
        logger.info(`Found ${proposalSubmitters.length} proposal submitters`);

        // Find users who submitted proposals and get their faculty IDs
        const facultyIds = await User.find({
          _id: { $in: proposalSubmitters },
        }).distinct('faculty');

        logger.info(`Found ${facultyIds.length} distinct faculty IDs`);

        // Find the faculty details for these IDs
        const faculties = await Faculty.find({
          _id: { $in: facultyIds },
        });

        logger.info(`Retrieved ${faculties.length} faculties with proposals`);

        res.status(200).json({
          success: true,
          data: faculties,
        });
      } catch (error) {
        logger.error(`Error retrieving faculties with proposals: ${error}`);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve faculties with proposals',
        });
      }
    }
  );

  // Get proposal statistics
  // Toggle proposal archive status
  toggleProposalArchiveStatus = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { isArchived } = req.body; // Expect boolean true/false

      if (typeof isArchived !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'Invalid value for isArchived. Must be true or false.',
        });
        return;
      }

      const proposal = await Proposal.findById(id).populate(
        'submitter',
        'name email'
      ); // Populate submitter for email notification

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      const previousIsArchivedStatus = proposal.isArchived; // Store current status

      proposal.isArchived = isArchived;
      await proposal.save();

      // Send email notification if proposal is newly archived
      if (isArchived && !previousIsArchivedStatus) {
        const submitterUser = proposal.submitter as unknown as IUser;
        if (submitterUser && submitterUser.email && proposal.projectTitle) {
          try {
            await emailService.sendProposalArchiveNotificationEmail(
              submitterUser.email,
              submitterUser.name,
              proposal.projectTitle as string // Explicitly cast to string
            );
            logger.info(`Sent archive notification email to ${submitterUser.email} for proposal ${proposal._id}`);
          } catch (error: any) {
            logger.error(`Failed to send archive notification email for proposal ${proposal._id}: ${error.message}`);
          }
        } else {
          logger.warn(`Could not send archive notification for proposal ${proposal._id}: Missing submitter info or project title.`);
        }
      }

      logger.info(
        `Admin ${user.id} set archive status for proposal ${id} to ${isArchived}`
      );

      res.status(200).json({
        success: true,
        message: `Proposal ${isArchived ? 'archived' : 'unarchived'} successfully`,
        data: proposal,
      });
    }
  );

  // Get proposal statistics
  getProposalStatistics = asyncHandler(
    async (req: Request, res: Response<IStatisticsResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      // Check if user is admin
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const totalProposals = await Proposal.countDocuments();
      const staffProposals = await Proposal.countDocuments({
        submitterType: 'staff',
      });
      const studentProposals = await Proposal.countDocuments({
        submitterType: 'master_student',
      });

      const statusCounts = await Proposal.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const statusStats: Record<string, number> = {};
      statusCounts.forEach((item) => {
        statusStats[item._id] = item.count;
      });

      logger.info(`Admin ${user.id} retrieved proposal statistics`);

      res.status(200).json({
        success: true,
        data: {
          total: totalProposals,
          byType: {
            staff: staffProposals,
            master_student: studentProposals,
          },
          byStatus: statusStats,
        },
      });
    }
  );
}

export default new AdminController();
