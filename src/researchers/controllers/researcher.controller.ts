import { Request, Response } from 'express';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import User from '../../model/user.model';
import { NotFoundError, UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import Award from '../../Review_System/models/award.model';
import FullProposal from '../models/fullProposal.model';

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
        .select(
          '+projectTitle +problemStatement +objectives +methodology +expectedOutcomes +workPlan +estimatedBudget +cvFile +docFile +isArchived'
        )
        .sort({
          updatedAt: -1,
        })
        .populate('submitter', 'name email userType')
        .lean();
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
      const proposal = await Proposal.findById(proposalId)
        .select(
          '+projectTitle +problemStatement +objectives +methodology +expectedOutcomes +workPlan +estimatedBudget +cvFile +docFile +isArchived'
        )
        .populate(
          'submitter',
          'name email userType phoneNumber alternativeEmail faculty department academicTitle'
        )
        .lean();

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Check if the researcher owns this proposal
      if (proposal.submitter._id.toString() !== userId.toString()) {
        throw new UnauthorizedError(
          'You do not have permission to view this proposal'
        );
      }

      let awardData = null;
      let fullProposalData = null;

      // Check if proposal is approved or declined, fetch award data
      if (proposal.status === 'approved' || proposal.status === 'rejected') {
        const award = await Award.findOne({ proposal: proposalId })
          .select('status feedbackComments fundingAmount')
          .lean();

        if (award) {
          awardData = {
            status: award.status,
            feedbackComments: award.feedbackComments,
            fundingAmount:
              proposal.status === 'approved' ? award.fundingAmount : null,
          };
        }
      }

      // Check for full proposal data if award is approved
      if (awardData && awardData.status === 'approved') {
        const fullProposal = await FullProposal.findOne({
          proposal: proposalId,
        })
          .select('status reviewComments reviewedAt submittedAt')
          .lean();

        if (
          fullProposal &&
          ['approved', 'rejected'].includes(fullProposal.status)
        ) {
          fullProposalData = {
            status: fullProposal.status,
            reviewComments: fullProposal.reviewComments,
            reviewedAt: fullProposal.reviewedAt,
            submittedAt: fullProposal.submittedAt,
          };
        }
      }

      logger.info(`Researcher ${userId} accessed proposal ${proposalId}`);

      res.status(200).json({
        success: true,
        data: {
          ...proposal,
          award: awardData,
          fullProposal: fullProposalData,
        },
      });
    }
  );
}

export default new ResearcherController();
