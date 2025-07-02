import { Request, Response } from 'express';
import User from '../../model/user.model';
import Proposal, { SubmitterType } from '../models/proposal.model';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import { Types } from 'mongoose';

interface IProposalResponse {
  success: boolean;
  message?: string;
  data?: {
    proposalId?: string;
    [key: string]: any;
  };
  count?: number;
}

interface IMasterStudentProposalRequest {
  fullName: string;
  email: string;
  alternativeEmail?: string;
  phoneNumber: string;
}

class SubmitController {
  submitMasterStudentProposal = asyncHandler(
    async (
      req: Request<{}, {}, IMasterStudentProposalRequest>,
      res: Response<IProposalResponse>
    ): Promise<void> => {
      const { fullName, email, alternativeEmail, phoneNumber } = req.body;

      // Check if user already exists or create new user
      let user = await User.findOne({ email });

      if (!user) {
        user = new User({
          name: fullName,
          email,
          alternativeEmail,
          userType: 'master_student',
          phoneNumber,
        });

        await user.save();
        logger.info(`New master student user created with email: ${email}`);
      }

      // Create a new proposal with string literal instead of enum
      const proposal = new Proposal({
        submitterType: SubmitterType.MASTER_STUDENT,
        submitter: user._id,
      });

      // Handle budget file upload if present
      if (req.files && 'docFile' in req.files) {
        proposal.docFile = `${
          process.env.API_URL || 'http://localhost:3000'
        }/uploads/documents/${req.files.docFile[0].filename}`;
      }

      await proposal.save();

      // Add proposal to user's proposals
      user.proposals = user.proposals || [];
      user.proposals.push(proposal._id as any);
      await user.save();

      // Send notification email to reviewers
      try {
        const reviewerEmails =
          process.env.REVIEWER_EMAILS || 'reviewer@example.com';
        await emailService.sendProposalNotificationEmail(
          reviewerEmails,
          user.name,
          'Master Student Proposal',
          SubmitterType.MASTER_STUDENT
        );

        // Send confirmation to submitter
        await emailService.sendSubmissionConfirmationEmail(
          email,
          fullName,
          'Master Student Proposal',
          SubmitterType.MASTER_STUDENT
        );
      } catch (error) {
        logger.error(
          'Failed to send emails:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Don't throw error to prevent proposal submission from failing
      }

      logger.info(`Master student proposal submitted by user: ${user.email}`);

      res.status(201).json({
        success: true,
        message:
          'Master student proposal submitted successfully and is under review.',
        data: { proposalId: (proposal._id as Types.ObjectId).toString() },
      });
    }
  );
}

export default new SubmitController();
