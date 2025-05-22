import { Request, Response } from 'express';
import Proposal from '../Proposal_Submission/models/proposal.model';
import { NotFoundError, UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';
import User from '../model/user.model';
import Faculty from '../Proposal_Submission/models/faculty.model';

interface IProposalQuery {
  status?: string;
  submitterType?: string;
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
      } = req.query;

      const query: IProposalQuery = {};

      // Apply filters if provided
      if (status) query.status = status as string;
      if (submitterType) query.submitterType = submitterType as string;

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
