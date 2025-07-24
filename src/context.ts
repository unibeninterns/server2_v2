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
}

export default AdminController;
