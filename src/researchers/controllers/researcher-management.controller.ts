import { Request, Response } from 'express';
import User, { UserRole } from '../../model/user.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import emailService from '../../services/email.service';
import generateSecurePassword from '../../utils/passwordGenerator';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';

interface AdminAuthenticatedRequest extends Request {
  user: {
    _id: string;
    role: string;
  };
}

class ResearcherManagementController {
  // Get all researchers who have submitted proposals
  getResearchersWithProposals = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      // Get all unique submitters from proposals
      const proposals = await Proposal.find().select('submitter');
      const submitterIds = [
        ...new Set(proposals.map((p) => p.submitter.toString())),
      ];

      // Find all users matching these IDs
      const researchers = await User.find({
        _id: { $in: submitterIds },
      }).select(
        '_id name email userType credentialsSent credentialsSentAt lastLogin'
      );

      // For each researcher, count their proposals
      const researcherData = await Promise.all(
        researchers.map(async (researcher) => {
          const proposalCount = await Proposal.countDocuments({
            submitter: researcher._id,
          });
          return {
            ...researcher.toObject(),
            proposalCount,
          };
        })
      );

      logger.info(`Admin ${user._id} retrieved researchers list`);

      res.status(200).json({
        success: true,
        count: researcherData.length,
        data: researcherData,
      });
    }
  );

  // Send login credentials to a researcher
  sendResearcherCredentials = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      const { researcherId } = req.params;

      const researcher = await User.findById(researcherId);
      if (!researcher) {
        throw new NotFoundError('Researcher not found');
      }

      // Generate a secure password
      const generatedPassword = generateSecurePassword();

      // Update the researcher record
      researcher.password = generatedPassword;
      researcher.role = UserRole.RESEARCHER;
      researcher.isActive = true;
      researcher.credentialsSent = true;
      researcher.credentialsSentAt = new Date();
      await researcher.save();

      // Send credentials email
      await emailService.sendCredentialsEmail(
        researcher.email,
        generatedPassword
      );

      logger.info(
        `Admin ${user._id} sent credentials to researcher ${researcherId}`
      );

      res.status(200).json({
        success: true,
        message: 'Login credentials sent successfully',
      });
    }
  );

  // Get researcher details with proposals
  getResearcherDetails = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      const { researcherId } = req.params;

      const researcher = await User.findById(researcherId)
        .select('-password -refreshToken')
        .populate('faculty', 'title code')
        .populate('department', 'title code');

      if (!researcher) {
        throw new NotFoundError('Researcher not found');
      }

      // Find all proposals by this researcher
      const proposals = await Proposal.find({ submitter: researcherId }).sort({
        updatedAt: -1,
      });

      logger.info(
        `Admin ${user._id} accessed researcher ${researcherId} details`
      );

      res.status(200).json({
        success: true,
        data: {
          researcher,
          proposals,
        },
      });
    }
  );

  // Resend credentials to a researcher
  resendResearcherCredentials = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      const { researcherId } = req.params;

      const researcher = await User.findById(researcherId);
      if (!researcher) {
        throw new NotFoundError('Researcher not found');
      }

      if (!researcher.credentialsSent) {
        throw new BadRequestError(
          'Credentials have not been sent yet. Use send credentials instead.'
        );
      }

      // Generate a new password
      const generatedPassword = generateSecurePassword();

      // Update the researcher record
      researcher.password = generatedPassword;
      researcher.credentialsSentAt = new Date();
      await researcher.save();

      // Send credentials email
      await emailService.sendCredentialsEmail(
        researcher.email,
        generatedPassword
      );

      logger.info(
        `Admin ${user._id} resent credentials to researcher ${researcherId}`
      );

      res.status(200).json({
        success: true,
        message: 'Login credentials resent successfully',
      });
    }
  );
}

export default new ResearcherManagementController();
