import { Request, Response } from 'express';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import { NotFoundError, UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import { IUser } from '../../model/user.model'; // Import IUser interface
import emailService from '../../services/email.service'; // Import email service
import Award, { AwardStatus } from '../../Review_System/models/award.model';

// Define a generic response interface for admin controller
interface IAdminResponse {
  success: boolean;
  message?: string;
  data?: any;
  count?: number;
  totalPages?: number;
  currentPage?: number;
}

interface IPaginationOptions {
  page: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

interface AdminAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

class DecisionsController {
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
              fundingAmount: fundingAmount || proposal.estimatedBudget,
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
        throw new Error(
          'Submitter email or proposal title not found for notification'
        );
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
}

export default new DecisionsController();
