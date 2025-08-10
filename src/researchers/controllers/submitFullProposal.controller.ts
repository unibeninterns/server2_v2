import { Request, Response } from 'express';
import User from '../../model/user.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import FullProposal from '../models/fullProposal.model';
import Award from '../../Review_System/models/award.model';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import { Types } from 'mongoose';

interface IFullProposalResponse {
  success: boolean;
  message?: string;
  data?: {
    fullProposalId?: string;
    [key: string]: any;
  };
}

interface IFullProposalRequest {
  proposalId: string;
  userId: string;
}

interface IFinalSubmissionResponse {
  success: boolean;
  message?: string;
  data?: {
    fullProposalId?: string;
    [key: string]: any;
  };
}

interface IFinalSubmissionRequest {
  proposalId: string;
  userId: string;
}

class SubmitFullProposalController {
  // Submit full proposal for approved proposal
  submitFullProposal = asyncHandler(
    async (
      req: Request<{}, {}, IFullProposalRequest>,
      res: Response<IFullProposalResponse>
    ): Promise<void> => {
      const { proposalId, userId } = req.body;

      // Validate proposal exists and is approved
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        res.status(404).json({
          success: false,
          message: 'Proposal not found',
        });
        return;
      }

      // Check if proposal is approved by checking award status
      const award = await Award.findOne({
        proposal: proposalId,
        status: 'approved',
      });

      if (!award) {
        res.status(400).json({
          success: false,
          message: 'Proposal is not approved for full proposal submission',
        });
        return;
      }

      // Validate user exists and owns the proposal
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (proposal.submitter.toString() !== userId) {
        res.status(403).json({
          success: false,
          message:
            'You are not authorized to submit full proposal for this proposal',
        });
        return;
      }

      // Check if full proposal already exists
      const existingFullProposal = await FullProposal.findOne({
        proposal: proposalId,
      });

      if (existingFullProposal) {
        res.status(400).json({
          success: false,
          message: 'Full proposal has already been submitted for this proposal',
        });
        return;
      }

      // Check deadline (July 31, 2025)
      const deadline = new Date('2025-07-31T23:59:59.999Z');
      const now = new Date();

      if (now > deadline) {
        res.status(400).json({
          success: false,
          message:
            'The deadline for full proposal submission (July 31, 2025) has passed',
        });
        return;
      }

      // Handle document file upload
      if (!req.files || !('docFile' in req.files)) {
        res.status(400).json({
          success: false,
          message: 'Document file is required',
        });
        return;
      }

      const docFileUrl = `${
        process.env.API_URL || 'http://localhost:3000'
      }/uploads/documents/${req.files.docFile[0].filename}`;

      // Create full proposal
      const fullProposal = new FullProposal({
        proposal: proposalId,
        submitter: userId,
        docFile: docFileUrl,
        deadline,
      });

      await fullProposal.save();

      // Send notification emails
      try {
        const reviewerEmails =
          process.env.REVIEWER_EMAILS || 'reviewer@example.com';
        await emailService.sendProposalNotificationEmail(
          reviewerEmails,
          user.name,
          proposal.projectTitle || 'Full Proposal Submission',
          proposal.submitterType
        );

        // Send confirmation to submitter
        await emailService.sendSubmissionConfirmationEmail(
          user.email,
          user.name,
          proposal.projectTitle || 'Full Proposal',
          proposal.submitterType
        );
      } catch (error) {
        logger.error(
          'Failed to send emails:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      logger.info(
        `Full proposal submitted for proposal ${proposalId} by user: ${user.email}`
      );

      res.status(201).json({
        success: true,
        message: 'Full proposal submitted successfully and is under review.',
        data: {
          fullProposalId: (fullProposal._id as Types.ObjectId).toString(),
          deadline: deadline.toISOString(),
        },
      });
    }
  );

  // Check if user can submit full proposal (approved proposal + within deadline)
  canSubmitFullProposal = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { proposalId } = req.params;

      // Check if proposal exists and get award status
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        res.status(404).json({
          success: false,
          message: 'Proposal not found',
        });
        return;
      }

      const award = await Award.findOne({
        proposal: proposalId,
        status: 'approved',
      });

      const existingFullProposal = await FullProposal.findOne({
        proposal: proposalId,
      });

      const deadline = new Date('2025-07-31T23:59:59.999Z');
      const now = new Date();
      const isWithinDeadline = now <= deadline;

      res.status(200).json({
        success: true,
        data: {
          canSubmit: !!award && !existingFullProposal && isWithinDeadline,
          isApproved: !!award,
          hasSubmitted: !!existingFullProposal,
          isWithinDeadline,
          deadline: deadline.toISOString(),
          daysRemaining: isWithinDeadline
            ? Math.ceil(
                (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              )
            : 0,
        },
      });
    }
  );

  // Submit final submission for approved full proposal
  submitFinalSubmission = asyncHandler(
    async (
      req: Request<{}, {}, IFinalSubmissionRequest>,
      res: Response<IFinalSubmissionResponse>
    ): Promise<void> => {
      const { proposalId, userId } = req.body;

      // Validate proposal exists
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        res.status(404).json({
          success: false,
          message: 'Proposal not found',
        });
        return;
      }

      // Find the full proposal and check if it's approved
      const fullProposal = await FullProposal.findOne({
        proposal: proposalId,
        status: 'approved',
      });

      if (!fullProposal) {
        res.status(400).json({
          success: false,
          message: 'Full proposal is not approved for final submission',
        });
        return;
      }

      // Validate user exists and owns the proposal
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (proposal.submitter.toString() !== userId) {
        res.status(403).json({
          success: false,
          message:
            'You are not authorized to submit final submission for this proposal',
        });
        return;
      }

      // Check if final submission already exists
      if (fullProposal.submitted) {
        res.status(400).json({
          success: false,
          message:
            'Final submission has already been submitted for this proposal',
        });
        return;
      }

      // Check deadline (August 15, 2025)
      const deadline = new Date('2025-08-14T23:59:59.999Z');
      const now = new Date();

      if (now > deadline) {
        res.status(400).json({
          success: false,
          message:
            'The deadline for final submission (August 15, 2025) has passed',
        });
        return;
      }

      // Handle document file upload
      if (!req.files || !('finalSubmission' in req.files)) {
        res.status(400).json({
          success: false,
          message: 'Final submission document is required',
        });
        return;
      }

      const finalSubmissionUrl = `${
        process.env.API_URL || 'http://localhost:3000'
      }/uploads/documents/${req.files.finalSubmission[0].filename}`;

      // Update full proposal with final submission
      fullProposal.finalSubmission = finalSubmissionUrl;
      fullProposal.submitted = true;
      fullProposal.finalSubmittedAt = new Date();
      fullProposal.finalSubmissionDeadline = deadline;

      await fullProposal.save();

      // Send notification emails
      try {
        const reviewerEmails = process.env.REVIEWER_EMAILS || 'drid@uniben.edu';
        await emailService.sendProposalNotificationEmail(
          reviewerEmails,
          user.name,
          proposal.projectTitle || 'Final Submission Completed',
          proposal.submitterType
        );

        // Send confirmation to submitter
        await emailService.sendSubmissionConfirmationEmail(
          user.email,
          user.name,
          `Final Submission - ${proposal.projectTitle}`,
          proposal.submitterType
        );
      } catch (error) {
        logger.error(
          'Failed to send emails:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      logger.info(
        `Final submission completed for proposal ${proposalId} by user: ${user.email}`
      );

      res.status(201).json({
        success: true,
        message:
          'Final submission completed successfully. Remember to also submit the physical documents at the DRID office.',
        data: {
          fullProposalId: (fullProposal._id as Types.ObjectId).toString(),
          deadline: deadline.toISOString(),
        },
      });
    }
  );

  // Check if user can submit final submission
  canSubmitFinalSubmission = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { proposalId } = req.params;

      // Check if proposal exists and get full proposal
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        res.status(404).json({
          success: false,
          message: 'Proposal not found',
        });
        return;
      }

      const fullProposal = await FullProposal.findOne({
        proposal: proposalId,
      });

      if (!fullProposal) {
        res.status(404).json({
          success: false,
          message: 'Full proposal not found',
        });
        return;
      }

      const deadline = new Date('2025-08-14T23:59:59.999Z');
      const now = new Date();
      const isWithinDeadline = now <= deadline;
      const isApproved = fullProposal.status === 'approved';
      const hasSubmitted = fullProposal.submitted;

      res.status(200).json({
        success: true,
        data: {
          canSubmit: isApproved && !hasSubmitted && isWithinDeadline,
          isApproved,
          hasSubmitted,
          isWithinDeadline,
          deadline: deadline.toISOString(),
          daysRemaining: isWithinDeadline
            ? Math.ceil(
                (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              )
            : 0,
          reviewComments: fullProposal.reviewComments,
        },
      });
    }
  );
}

export default new SubmitFullProposalController();
