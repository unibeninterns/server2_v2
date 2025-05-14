import { Request, Response } from 'express';
import User from '../../model/user.model';
import Proposal, { SubmitterType } from '../models/proposal.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import { Types } from 'mongoose';

interface ICoInvestigator {
  name: string;
  department?: string;
  faculty?: string;
}

interface IProposalResponse {
  success: boolean;
  message?: string;
  data?: {
    proposalId?: string;
    [key: string]: any;
  };
  count?: number;
}

interface IStaffProposalRequest {
  fullName: string;
  academicTitle: string;
  department: string;
  faculty: string;
  email: string;
  alternativeEmail?: string;
  phoneNumber: string;
  projectTitle: string;
  backgroundProblem: string;
  researchObjectives: string;
  methodologyOverview: string;
  expectedOutcomes: string;
  workPlan: string;
  estimatedBudget: string | number;
  coInvestigators?: string | ICoInvestigator[];
}

interface IMasterStudentProposalRequest {
  fullName: string;
  email: string;
  alternativeEmail?: string;
  phoneNumber: string;
}

class SubmitController {
  // Submit staff proposal
  submitStaffProposal = asyncHandler(
    async (
      req: Request<{}, {}, IStaffProposalRequest>,
      res: Response<IProposalResponse>
    ): Promise<void> => {
      const {
        fullName,
        academicTitle,
        department,
        faculty,
        email,
        alternativeEmail,
        phoneNumber,
        projectTitle,
        backgroundProblem,
        researchObjectives,
        methodologyOverview,
        expectedOutcomes,
        workPlan,
        estimatedBudget,
        coInvestigators,
      } = req.body;

      let parsedCoInvestigators: ICoInvestigator[] = [];
      if (coInvestigators) {
        try {
          parsedCoInvestigators =
            typeof coInvestigators === 'string'
              ? (JSON.parse(coInvestigators) as ICoInvestigator[])
              : (coInvestigators as ICoInvestigator[]);
        } catch (error) {
          logger.error(
            'Failed to parse coInvestigators:',
            error instanceof Error ? error.message : 'Unknown error'
          );
          // Default to empty array if parsing fails
          parsedCoInvestigators = [];
        }
      }

      // Check if user already exists or create new user
      let user = await User.findOne({ email });

      if (!user) {
        user = new User({
          name: fullName,
          email,
          alternativeEmail,
          userType: 'staff',
          department,
          faculty,
          academicTitle,
          phoneNumber,
        });

        await user.save();
        logger.info(`New staff user created with email: ${email}`);
      }

      // Create a new proposal
      const proposal = new Proposal({
        submitterType: SubmitterType.STAFF,
        projectTitle,
        submitter: user._id,
        problemStatement: backgroundProblem,
        objectives: researchObjectives,
        methodology: methodologyOverview,
        expectedOutcomes,
        workPlan,
        estimatedBudget: Number(estimatedBudget),
        coInvestigators: parsedCoInvestigators,
      });

      // Handle CV file upload if present
      if (req.files && 'cvFile' in req.files) {
        proposal.cvFile = `${
          process.env.API_URL || 'http://localhost:3000'
        }/uploads/documents/${req.files.cvFile[0].filename}`;
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
          projectTitle,
          'staff'
        );

        await emailService.sendSubmissionConfirmationEmail(
          email,
          fullName,
          projectTitle,
          'staff'
        );
      } catch (error) {
        logger.error(
          'Failed to send emails:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Don't throw error to prevent proposal submission from failing
      }

      logger.info(`Staff proposal submitted by user: ${user.email}`);

      res.status(201).json({
        success: true,
        message: 'Staff proposal submitted successfully and is under review.',
        data: { proposalId: (proposal._id as Types.ObjectId).toString() },
      });
    }
  );

  // Submit master student proposal
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

  // Get user's proposals by email - fixed with proper Request type
  getUserProposalsByEmail = asyncHandler(
    async (req: Request, res: Response<IProposalResponse>): Promise<void> => {
      const { email } = req.params as { email: string };

      const user = await User.findOne({ email });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const proposals = await Proposal.find({ submitter: user._id }).sort({
        createdAt: -1,
      });

      res.status(200).json({
        success: true,
        count: proposals.length,
        data: proposals,
      });
    }
  );

  // Get proposal by ID - fixed with proper Request type
  getProposalById = asyncHandler(
    async (req: Request, res: Response<IProposalResponse>): Promise<void> => {
      const { id } = req.params as { id: string };

      const proposal = await Proposal.findById(id)
        .populate('submitter', 'name email academicTitle')
        .populate({
          path: 'submitter',
          populate: [
            { path: 'faculty', select: 'title code' },
            { path: 'department', select: 'title code' },
          ],
        });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      res.status(200).json({
        success: true,
        data: proposal,
      });
    }
  );
}

export default new SubmitController();
