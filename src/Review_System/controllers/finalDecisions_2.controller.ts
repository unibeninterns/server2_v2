/* eslint-disable max-lines */
import { Request, Response } from 'express';
import FullProposal, {
  FullProposalStatus,
} from '../../researchers/models/fullProposal.model';
import Award, { AwardStatus } from '../../Review_System/models/award.model';
import { NotFoundError, UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import { IUser } from '../../model/user.model';
import emailService from '../../services/email.service';
import mongoose from 'mongoose';

// Define a generic response interface for admin controller
interface IAdminResponse {
  success: boolean;
  message?: string;
  data?: any;
  count?: number;
  total?: number;
  totalPages?: number;
  currentPage?: number;
  statistics?: {
    totalFullProposals: number;
    pendingDecisions: number;
    approved: number;
    rejected: number;
    approvedBudget: number;
    submittedThisMonth: number;
    nearingDeadline: number;
  };
}

interface AdminAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

class FullProposalDecisionsController {
  // Get all full proposals for decision making
  getAllFullProposals = asyncHandler(
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
        sort = 'score',
        order = 'desc',
        faculty,
        status,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      // Build aggregation pipeline for statistics
      const statisticsPipeline: any[] = [
        // First lookup the original proposal
        {
          $lookup: {
            from: 'Proposals',
            localField: 'proposal',
            foreignField: '_id',
            as: 'proposalDetails',
          },
        },
        {
          $unwind: '$proposalDetails',
        },
        // Lookup award details to ensure only approved awards are included
        {
          $lookup: {
            from: 'awards',
            localField: 'proposal',
            foreignField: 'proposal',
            as: 'awardDetails',
          },
        },
        {
          $unwind: '$awardDetails',
        },
        // Only include full proposals where the award is approved
        {
          $match: {
            'awardDetails.status': AwardStatus.APPROVED,
          },
        },
        // Lookup submitter details
        {
          $lookup: {
            from: 'Users_2',
            localField: 'submitter',
            foreignField: '_id',
            as: 'submitterDetails',
          },
        },
        {
          $unwind: '$submitterDetails',
        },
        // Lookup faculty details
        {
          $lookup: {
            from: 'faculties',
            localField: 'submitterDetails.faculty',
            foreignField: '_id',
            as: 'facultyDetails',
          },
        },
        {
          $unwind: {
            path: '$facultyDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Apply faculty filter if provided
        ...(faculty
          ? [
              {
                $match: {
                  'facultyDetails._id': new mongoose.Types.ObjectId(
                    faculty as string
                  ),
                },
              },
            ]
          : []),
        // Apply status filter if provided
        ...(status
          ? [
              {
                $match: {
                  status: status as string,
                },
              },
            ]
          : []),
        // Calculate statistics
        {
          $group: {
            _id: null,
            totalFullProposals: { $sum: 1 },
            pendingDecisions: {
              $sum: {
                $cond: [
                  { $eq: ['$status', FullProposalStatus.SUBMITTED] },
                  1,
                  0,
                ],
              },
            },
            approved: {
              $sum: {
                $cond: [
                  { $eq: ['$status', FullProposalStatus.APPROVED] },
                  1,
                  0,
                ],
              },
            },
            rejected: {
              $sum: {
                $cond: [
                  { $eq: ['$status', FullProposalStatus.REJECTED] },
                  1,
                  0,
                ],
              },
            },
            approvedBudget: {
              $sum: {
                $cond: [
                  { $eq: ['$status', FullProposalStatus.APPROVED] },
                  { $ifNull: ['$awardDetails.fundingAmount', 0] },
                  0,
                ],
              },
            },
            submittedThisMonth: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      '$submittedAt',
                      new Date(
                        new Date().getFullYear(),
                        new Date().getMonth(),
                        1
                      ),
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            nearingDeadline: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', FullProposalStatus.SUBMITTED] },
                      {
                        $lte: [
                          '$deadline',
                          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ];

      // Build main data pipeline
      const dataPipeline: any[] = [
        // Lookup the original proposal
        {
          $lookup: {
            from: 'Proposals',
            localField: 'proposal',
            foreignField: '_id',
            as: 'proposalDetails',
          },
        },
        {
          $unwind: '$proposalDetails',
        },
        // Lookup award details to ensure only approved awards are included
        {
          $lookup: {
            from: 'awards',
            localField: 'proposal',
            foreignField: 'proposal',
            as: 'awardDetails',
          },
        },
        {
          $unwind: '$awardDetails',
        },
        // Only include full proposals where the award is approved
        {
          $match: {
            'awardDetails.status': AwardStatus.APPROVED,
          },
        },
        // Lookup submitter details
        {
          $lookup: {
            from: 'Users_2',
            localField: 'submitter',
            foreignField: '_id',
            as: 'submitterDetails',
          },
        },
        {
          $unwind: '$submitterDetails',
        },
        // Lookup faculty details
        {
          $lookup: {
            from: 'faculties',
            localField: 'submitterDetails.faculty',
            foreignField: '_id',
            as: 'facultyDetails',
          },
        },
        {
          $unwind: {
            path: '$facultyDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Lookup department details
        {
          $lookup: {
            from: 'departments',
            localField: 'submitterDetails.department',
            foreignField: '_id',
            as: 'departmentDetails',
          },
        },
        {
          $unwind: {
            path: '$departmentDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
      ];

      // Apply faculty filter if provided
      if (faculty) {
        dataPipeline.push({
          $match: {
            'facultyDetails._id': new mongoose.Types.ObjectId(
              faculty as string
            ),
          },
        });
      }

      // Apply status filter if provided
      if (status) {
        dataPipeline.push({
          $match: {
            status: status as string,
          },
        });
      }

      // Add projection to clean up response
      dataPipeline.push({
        $project: {
          docFile: 1,
          status: 1,
          score: 1,
          submittedAt: 1,
          deadline: 1,
          reviewedAt: 1,
          reviewComments: 1,
          createdAt: 1,
          updatedAt: 1,
          originalProposal: {
            _id: '$proposalDetails._id',
            projectTitle: '$proposalDetails.projectTitle',
            estimatedBudget: '$proposalDetails.estimatedBudget',
          },
          award: {
            fundingAmount: '$awardDetails.fundingAmount',
            approvedAt: '$awardDetails.approvedAt',
          },
          submitter: {
            name: '$submitterDetails.name',
            email: '$submitterDetails.email',
            userType: '$submitterDetails.userType',
            phoneNumber: '$submitterDetails.phoneNumber',
            alternativeEmail: '$submitterDetails.alternativeEmail',
          },
          faculty: {
            _id: '$facultyDetails._id',
            title: '$facultyDetails.title',
            code: '$facultyDetails.code',
          },
          department: {
            title: '$departmentDetails.title',
            code: '$departmentDetails.code',
          },
        },
      });

      // Count total documents for pagination
      const countPipeline = [...dataPipeline, { $count: 'total' }];

      // Add sorting
      let sortObj: Record<string, 1 | -1> = {};

      if (sort === 'title') {
        sortObj = { 'originalProposal.projectTitle': order === 'asc' ? 1 : -1 };
      } else if (sort === 'deadline') {
        sortObj = { deadline: order === 'asc' ? 1 : -1 };
      } else if (sort === 'score') {
        sortObj = {
          score: order === 'asc' ? 1 : -1,
          submittedAt: -1,
        };
      } else {
        sortObj[sort as string] = order === 'asc' ? 1 : -1;
      }

      dataPipeline.push({ $sort: sortObj });

      // Add pagination
      dataPipeline.push({ $skip: skip }, { $limit: limitNum });

      // Execute all aggregations
      const [statisticsResult, fullProposals, totalResult] = await Promise.all([
        FullProposal.aggregate(statisticsPipeline),
        FullProposal.aggregate(dataPipeline),
        FullProposal.aggregate(countPipeline),
      ]);

      const statistics = statisticsResult[0] || {
        totalFullProposals: 0,
        pendingDecisions: 0,
        approved: 0,
        rejected: 0,
        approvedBudget: 0,
        submittedThisMonth: 0,
        nearingDeadline: 0,
      };

      const totalProposals = totalResult[0]?.total || 0;

      logger.info(
        `Admin ${user.id} retrieved full proposals list for decision${
          faculty ? ` filtered by faculty: ${faculty}` : ''
        }${status ? ` with status: ${status}` : ''}`
      );

      res.status(200).json({
        success: true,
        count: fullProposals.length,
        total: totalProposals,
        totalPages: Math.ceil(totalProposals / limitNum),
        currentPage: pageNum,
        data: fullProposals,
        statistics,
      });
    }
  );

  // Assign score to full proposal
  assignFullProposalScore = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { score } = req.body;

      // Validate score
      if (!score || score < 1 || score > 100) {
        throw new Error('Score must be between 1 and 100');
      }

      const fullProposal = await FullProposal.findById(id);

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      // Check if the original proposal has an approved award
      const award = await Award.findOne({
        proposal: fullProposal.proposal,
        status: AwardStatus.APPROVED,
      });

      if (!award) {
        throw new UnauthorizedError(
          'This full proposal is not associated with an approved award'
        );
      }

      // Update the full proposal with score
      fullProposal.score = score;
      await fullProposal.save();

      logger.info(
        `Admin ${user.id} assigned score ${score} to full proposal ${id}`
      );

      res.status(200).json({
        success: true,
        message: 'Full proposal score assigned successfully',
        data: fullProposal,
      });
    }
  );

  editFullProposalScore = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { score } = req.body;

      // Validate score
      if (!score || score < 1 || score > 100) {
        throw new Error('Score must be between 1 and 100');
      }

      const fullProposal = await FullProposal.findById(id);

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      // Ensure a score was previously assigned
      if (fullProposal.score === undefined || fullProposal.score === null) {
        throw new Error('No score has been assigned yet to edit');
      }

      // Check if the original proposal has an approved award
      const award = await Award.findOne({
        proposal: fullProposal.proposal,
        status: AwardStatus.APPROVED,
      });

      if (!award) {
        throw new UnauthorizedError(
          'This full proposal is not associated with an approved award'
        );
      }

      // Update the score
      fullProposal.score = score;
      await fullProposal.save();

      logger.info(
        `Admin ${user.id} edited score to ${score} for full proposal ${id}`
      );

      res.status(200).json({
        success: true,
        message: 'Full proposal score edited successfully',
        data: fullProposal,
      });
    }
  );

  // Update full proposal status (approve/reject with review comments)
  updateFullProposalStatus = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { status, reviewComments, fundingAmount } = req.body;

      // Validate status
      if (!Object.values(FullProposalStatus).includes(status)) {
        throw new Error('Invalid status provided');
      }

      const fullProposal = await FullProposal.findById(id).populate('proposal');

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      // Check if score is assigned before allowing status update
      if (fullProposal.score === undefined || fullProposal.score === null) {
        throw new Error(
          'Score must be assigned before updating proposal status'
        );
      }

      // Find the associated award
      const award = await Award.findOne({
        proposal: fullProposal.proposal,
        status: AwardStatus.APPROVED,
      });

      if (!award) {
        throw new UnauthorizedError(
          'This full proposal is not associated with an approved award'
        );
      }

      // Update the full proposal
      fullProposal.status = status;
      fullProposal.reviewComments = reviewComments || '';
      fullProposal.reviewedAt = new Date();

      // If approving the full proposal, update the award funding amount
      if (
        status === FullProposalStatus.APPROVED &&
        fundingAmount !== undefined
      ) {
        award.fundingAmount = fundingAmount;
        await award.save();

        logger.info(
          `Admin ${user.id} updated funding amount to ${fundingAmount} for full proposal ${id}`
        );
      }

      await fullProposal.save();

      logger.info(
        `Admin ${user.id} updated full proposal ${id} status to ${status}`
      );

      res.status(200).json({
        success: true,
        message: 'Full proposal status updated successfully',
        data: {
          ...fullProposal.toObject(),
          award: {
            fundingAmount: award.fundingAmount,
            approvedAt: award.approvedAt,
          },
        },
      });
    }
  );

  // Edit funding amount for approved full proposal
  editFullProposalFundingAmount = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;
      const { fundingAmount } = req.body;

      // Validate funding amount
      if (!fundingAmount || fundingAmount <= 0) {
        throw new Error('Funding amount must be a positive number');
      }

      const fullProposal = await FullProposal.findById(id);

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      // Only allow editing funding amount for approved full proposals
      if (fullProposal.status !== FullProposalStatus.APPROVED) {
        throw new UnauthorizedError(
          'Funding amount can only be edited for approved full proposals'
        );
      }

      // Find the associated award
      const award = await Award.findOne({
        proposal: fullProposal.proposal,
        status: AwardStatus.APPROVED,
      });

      if (!award) {
        throw new UnauthorizedError(
          'This full proposal is not associated with an approved award'
        );
      }

      // Update the funding amount
      const previousAmount = award.fundingAmount;
      award.fundingAmount = fundingAmount;
      await award.save();

      logger.info(
        `Admin ${user.id} edited funding amount from ${previousAmount} to ${fundingAmount} for full proposal ${id}`
      );

      res.status(200).json({
        success: true,
        message: 'Funding amount updated successfully',
        data: {
          fullProposalId: fullProposal._id,
          previousAmount,
          newAmount: fundingAmount,
          updatedAt: new Date(),
        },
      });
    }
  );

  // Get full proposal by ID
  getFullProposalById = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { id } = req.params;

      const fullProposal = await FullProposal.findById(id)
        .populate({
          path: 'proposal',
          select: 'projectTitle estimatedBudget submitterType',
        })
        .populate({
          path: 'submitter',
          select:
            'name email userType phoneNumber alternativeEmail faculty department',
          populate: [
            { path: 'faculty', select: 'title code' },
            { path: 'department', select: 'title code' },
          ],
        });

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      // Check if the original proposal has an approved award
      const award = await Award.findOne({
        proposal: fullProposal.proposal,
        status: AwardStatus.APPROVED,
      });

      if (!award) {
        throw new UnauthorizedError(
          'This full proposal is not associated with an approved award'
        );
      }

      logger.info(`Admin ${user.id} retrieved full proposal ${id}`);

      res.status(200).json({
        success: true,
        data: {
          ...fullProposal.toObject(),
          award: {
            fundingAmount: award.fundingAmount,
            approvedAt: award.approvedAt,
          },
        },
      });
    }
  );

  // Notify applicants about full proposal decision
  notifyFullProposalApplicants = asyncHandler(
    async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
      const user = (req as AdminAuthenticatedRequest).user;
      if (user.role !== 'admin') {
        throw new UnauthorizedError(
          'You do not have permission to access this resource'
        );
      }

      const { fullProposalId } = req.params;

      const fullProposal = await FullProposal.findById(fullProposalId)
        .populate({
          path: 'proposal',
          select: 'projectTitle',
        })
        .populate({
          path: 'submitter',
          select: 'email name faculty department',
          populate: [
            { path: 'faculty', select: 'title' },
            { path: 'department', select: 'title' },
          ],
        });

      if (!fullProposal) {
        throw new NotFoundError('Full proposal not found');
      }

      if (!fullProposal.submitter) {
        throw new Error('Submitter not found for notification');
      }

      const submitterUser = fullProposal.submitter as unknown as IUser;
      const proposalDetails = fullProposal.proposal as any;

      if (!submitterUser.email || !proposalDetails.projectTitle) {
        throw new Error(
          'Submitter email or proposal title not found for notification'
        );
      }

      // Send email notification about full proposal decision
      await emailService.sendFullProposalStatusUpdateEmail(
        submitterUser.email,
        submitterUser.name,
        proposalDetails.projectTitle,
        fullProposal.status,
        fullProposal.reviewComments
      );

      logger.info(
        `Admin ${user.id} notified applicant for full proposal ${fullProposalId}`
      );

      res.status(200).json({
        success: true,
        message: 'Applicant notified successfully about full proposal decision',
      });
    }
  );
}

export default new FullProposalDecisionsController();
