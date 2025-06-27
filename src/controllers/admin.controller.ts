import { Request, Response } from 'express';
import Proposal from '../Proposal_Submission/models/proposal.model';
import { NotFoundError, UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';
import User, { IUser } from '../model/user.model';
import Faculty from '../Proposal_Submission/models/faculty.model';
import emailService from '../services/email.service';
import { PipelineStage } from 'mongoose';
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
        isArchived,
      } = req.query;

      const query: IProposalQuery = {};

      // Apply filters if provided
      if (status) query.status = status as string;
      if (submitterType) query.submitterType = submitterType as string;
      // Apply isArchived filter
      if (isArchived !== undefined) {
        query.isArchived = isArchived === 'true';
      } else {
        query.isArchived = false;
      }

      // Handle duplicates sorting - when sort is 'duplicates'
      if (sort === 'duplicates') {
        // Find submitters who have more than one proposal
        const duplicateSubmitters = await Proposal.aggregate([
          { $match: query }, // Apply existing filters first
          { $group: { _id: '$submitter', count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $project: { submitter: '$_id' } },
        ]);

        const duplicateSubmitterIds = duplicateSubmitters.map(
          (item) => item.submitter
        );

        if (duplicateSubmitterIds.length === 0) {
          // No duplicates found, return empty result
          logger.info(
            `Admin ${user.id} retrieved proposals list - no duplicates found`
          );
          res.status(200).json({
            success: true,
            count: 0,
            totalPages: 0,
            currentPage: parseInt(page as string, 10),
            data: [],
          });
        }

        // Build aggregation pipeline for grouped results by submitter
        const pipeline = [
          {
            $match: {
              ...query,
              submitter: { $in: duplicateSubmitterIds },
            },
          },
          {
            $lookup: {
              from: 'Users_2', // Adjust collection name as needed
              localField: 'submitter',
              foreignField: '_id',
              as: 'submitterData',
            },
          },
          {
            $unwind: '$submitterData',
          },
          {
            $sort: {
              'submitterData.name': order === 'asc' ? 1 : -1, // Group by submitter name with specified order
              createdAt: -1, // Within each submitter, sort by submission date (newest first)
            },
          },
          {
            $skip:
              (parseInt(page as string, 10) - 1) *
              parseInt(limit as string, 10),
          },
          {
            $limit: parseInt(limit as string, 10),
          },
          {
            $project: {
              _id: 1,
              projectTitle: 1,
              submitterType: 1,
              status: 1,
              createdAt: 1,
              isArchived: 1,
              submitter: {
                _id: '$submitterData._id',
                name: '$submitterData.name',
                email: '$submitterData.email',
                userType: '$submitterData.userType',
                phoneNumber: '$submitterData.phoneNumber',
                alternativeEmail: '$submitterData.alternativeEmail',
              },
            },
          },
        ];

        const proposals = await Proposal.aggregate(pipeline as PipelineStage[]);

        // Count total proposals from duplicate submitters
        const totalProposals = await Proposal.countDocuments({
          ...query,
          submitter: { $in: duplicateSubmitterIds },
        });

        logger.info(
          `Admin ${user.id} retrieved proposals list sorted by duplicates`
        );

        res.status(200).json({
          success: true,
          count: proposals.length,
          totalPages: Math.ceil(totalProposals / parseInt(limit as string, 10)),
          currentPage: parseInt(page as string, 10),
          data: proposals,
        });
      }

      // Regular sorting for other fields (existing logic continues...)
      // Build sort object for non-duplicate queries
      const sortObj: Record<string, 1 | -1> = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      const options: IPaginationOptions = {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sort: sortObj,
      };

      // Add faculty filter logic (existing code)
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
      const { isArchived, comment } = req.body; // Expect boolean true/false and a comment

      if (typeof isArchived !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'Invalid value for isArchived. Must be true or false.',
        });
        return;
      }

      // If archiving, a comment is required
      if (isArchived && !comment) {
        res.status(400).json({
          success: false,
          message: 'A comment is required when archiving a proposal.',
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
      // Store the comment if provided, or clear it if unarchiving
      proposal.archiveReason = isArchived ? comment : undefined;
      await proposal.save();

      // Send email notification if proposal status changed
      if (isArchived !== previousIsArchivedStatus) {
        const submitterUser = proposal.submitter as unknown as IUser;
        if (submitterUser && submitterUser.email && proposal.projectTitle) {
          try {
            await emailService.sendProposalArchiveNotificationEmail(
              submitterUser.email,
              submitterUser.name,
              proposal.projectTitle as string, // Explicitly cast to string
              isArchived, // Pass the new archive status
              comment // Pass the comment
            );
            logger.info(
              `Sent ${isArchived ? 'archive' : 'unarchive'} notification email to ${submitterUser.email} for proposal ${proposal._id}`
            );
          } catch (error: any) {
            logger.error(
              `Failed to send ${isArchived ? 'archive' : 'unarchive'} notification email for proposal ${proposal._id}: ${error.message}`
            );
          }
        } else {
          logger.warn(
            `Could not send ${isArchived ? 'archive' : 'unarchive'} notification for proposal ${proposal._id}: Missing submitter info or project title.`
          );
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
