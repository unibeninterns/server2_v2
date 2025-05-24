import { Request, Response } from 'express';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import User from '../../model/user.model';
import { NotFoundError, UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';

interface ResearcherAuthenticatedRequest extends Request {
  user: {
    _id: string;
    role: string;
    email: string;
  };
}

class ResearcherController {
  // Get researcher dashboard data
  getResearcherDashboard = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;

      const userId = user._id;

      // Find the researcher
      const researcher = await User.findById(userId).select(
        '-password -refreshToken'
      );

      if (!researcher) {
        throw new NotFoundError('Researcher not found');
      }

      // Find all proposals by this researcher
      const proposals = await Proposal.find({ submitter: userId })
        .sort({
          updatedAt: -1,
        })
        .populate('submitter', 'name email userType');
      // Calculate statistics
      const totalProposals = proposals.length;
      const statusCounts: Record<string, number> = {
        submitted: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
        revision_requested: 0,
      };

      // Count proposals by status
      proposals.forEach((proposal) => {
        if (statusCounts[proposal.status] !== undefined) {
          statusCounts[proposal.status]++;
        }
      });

      // Get the most recent proposal
      const recentProposal = proposals[0] || null;

      logger.info(`Researcher ${userId} accessed dashboard`);

      res.status(200).json({
        success: true,
        data: {
          profile: researcher,
          proposals: proposals,
          stats: {
            totalProposals,
            statusCounts,
          },
          recentProposal,
        },
      });
    }
  );

  // Get researcher's proposal details
  getProposalDetails = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;

      const userId = user._id;
      const { proposalId } = req.params;

      // Find the proposal and verify ownership
      const proposal = await Proposal.findById(proposalId).populate(
        'submitter',
        'name email userType phoneNumber alternativeEmail faculty department academicTitle'
      );

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Check if the researcher owns this proposal
      if (proposal.submitter._id.toString() !== userId.toString()) {
        throw new UnauthorizedError(
          'You do not have permission to view this proposal'
        );
      }

      logger.info(`Researcher ${userId} accessed proposal ${proposalId}`);

      res.status(200).json({
        success: true,
        data: proposal,
      });
    }
  );
}

export default new ResearcherController();
