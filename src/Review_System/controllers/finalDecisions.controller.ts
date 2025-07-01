/* eslint-disable max-lines */
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
    totalProposals: number;
    pendingDecisions: number;
    approved: number;
    rejected: number;
    averageScore: number;
    proposalsAboveThreshold: number;
    totalBudgetAboveThreshold: number;
    approvedBudget: number;
  };
}

interface AdminAuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

class DecisionsController {
  // Enhanced getProposalsForDecision method with threshold and budget calculations
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
        faculty,
        threshold = 70, // Add threshold parameter
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const thresholdNum = parseInt(threshold as string, 10);
      const skip = (pageNum - 1) * limitNum;

      // Build aggregation pipeline for statistics
      const statisticsPipeline: any[] = [
        // Match proposals ready for decision
        {
          $match: {
            reviewStatus: { $in: ['reviewed'] },
            isArchived: { $ne: true },
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
        // Lookup award details
        {
          $lookup: {
            from: 'awards',
            localField: '_id',
            foreignField: 'proposal',
            as: 'awardDetails',
          },
        },
        {
          $unwind: {
            path: '$awardDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Add computed fields
        {
          $addFields: {
            finalScore: '$awardDetails.finalScore',
            awardStatus: '$awardDetails.status',
            awardFundingAmount: '$awardDetails.fundingAmount',
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
        // Calculate statistics
        {
          $group: {
            _id: null,
            totalProposals: { $sum: 1 },
            pendingDecisions: {
              $sum: {
                $cond: [{ $eq: ['$awardStatus', 'pending'] }, 1, 0],
              },
            },
            approved: {
              $sum: {
                $cond: [{ $eq: ['$awardStatus', 'approved'] }, 1, 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$awardStatus', 'declined'] }, 1, 0],
              },
            },
            totalScoreSum: {
              $sum: {
                $cond: [{ $ne: ['$finalScore', null] }, '$finalScore', 0],
              },
            },
            scoredProposalsCount: {
              $sum: {
                $cond: [{ $ne: ['$finalScore', null] }, 1, 0],
              },
            },
            proposalsAboveThreshold: {
              $sum: {
                $cond: [
                  { $gte: [{ $ifNull: ['$finalScore', 0] }, thresholdNum] },
                  1,
                  0,
                ],
              },
            },
            totalBudgetAboveThreshold: {
              $sum: {
                $cond: [
                  { $gte: [{ $ifNull: ['$finalScore', 0] }, thresholdNum] },
                  { $ifNull: ['$estimatedBudget', 0] },
                  0,
                ],
              },
            },
            approvedBudget: {
              $sum: {
                $cond: [
                  { $eq: ['$awardStatus', 'approved'] },
                  { $ifNull: ['$awardFundingAmount', 0] },
                  0,
                ],
              },
            },
          },
        },
      ];

      // Build main data pipeline
      const dataPipeline: any[] = [
        // Match proposals ready for decision
        {
          $match: {
            reviewStatus: { $in: ['reviewed'] },
            isArchived: { $ne: true },
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
        // Lookup reviews
        {
          $lookup: {
            from: 'Reviews',
            localField: '_id',
            foreignField: 'proposal',
            as: 'reviews',
          },
        },
        // Lookup award details
        {
          $lookup: {
            from: 'awards',
            localField: '_id',
            foreignField: 'proposal',
            as: 'awardDetails',
          },
        },
        {
          $unwind: {
            path: '$awardDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Add computed fields for review scores
        {
          $addFields: {
            aiScore: {
              $let: {
                vars: {
                  aiReview: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$reviews',
                          as: 'review',
                          cond: {
                            $and: [
                              { $eq: ['$$review.reviewType', 'ai'] },
                              { $eq: ['$$review.status', 'completed'] },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$aiReview.totalScore',
              },
            },
            humanScore: {
              $let: {
                vars: {
                  humanReview: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$reviews',
                          as: 'review',
                          cond: {
                            $and: [
                              { $eq: ['$$review.reviewType', 'human'] },
                              { $eq: ['$$review.status', 'completed'] },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$humanReview.totalScore',
              },
            },
            reconciliationScore: {
              $let: {
                vars: {
                  reconciliationReview: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$reviews',
                          as: 'review',
                          cond: {
                            $and: [
                              {
                                $eq: ['$$review.reviewType', 'reconciliation'],
                              },
                              { $eq: ['$$review.status', 'completed'] },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$reconciliationReview.totalScore',
              },
            },
            finalScore: '$awardDetails.finalScore',
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

      // Add projection to clean up response
      dataPipeline.push({
        $project: {
          projectTitle: 1,
          submitterType: 1,
          status: 1,
          reviewStatus: 1,
          estimatedBudget: 1,
          fundingAmount: 1,
          feedbackComments: 1,
          aiScore: 1,
          humanScore: 1,
          reconciliationScore: 1,
          finalScore: 1,
          createdAt: 1,
          updatedAt: 1,
          lastNotifiedAt: 1,
          notificationCount: 1,
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
          award: {
            status: '$awardDetails.status',
            fundingAmount: '$awardDetails.fundingAmount',
            approvedBy: '$awardDetails.approvedBy',
            approvedAt: '$awardDetails.approvedAt',
          },
        },
      });

      // Count total documents for pagination
      const countPipeline = [...dataPipeline, { $count: 'total' }];

      // Add sorting
      const sortObj: Record<string, 1 | -1> = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;
      dataPipeline.push({ $sort: sortObj });

      // Add pagination
      dataPipeline.push({ $skip: skip }, { $limit: limitNum });

      // Execute all aggregations
      const [statisticsResult, proposals, totalResult] = await Promise.all([
        Proposal.aggregate(statisticsPipeline),
        Proposal.aggregate(dataPipeline),
        Proposal.aggregate(countPipeline),
      ]);

      const statistics = statisticsResult[0] || {
        totalProposals: 0,
        pendingDecisions: 0,
        approved: 0,
        rejected: 0,
        totalScoreSum: 0,
        scoredProposalsCount: 0,
        proposalsAboveThreshold: 0,
        totalBudgetAboveThreshold: 0,
        approvedBudget: 0,
      };

      const totalProposals = totalResult[0]?.total || 0;
      const averageScore =
        statistics.scoredProposalsCount > 0
          ? Math.round(
              statistics.totalScoreSum / statistics.scoredProposalsCount
            )
          : 0;

      logger.info(
        `Admin ${user.id} retrieved proposals list for decision${
          faculty ? ` filtered by faculty: ${faculty}` : ''
        } with threshold: ${thresholdNum}`
      );

      res.status(200).json({
        success: true,
        count: proposals.length,
        total: totalProposals,
        totalPages: Math.ceil(totalProposals / limitNum),
        currentPage: pageNum,
        data: proposals,
        statistics: {
          totalProposals: statistics.totalProposals,
          pendingDecisions: statistics.pendingDecisions,
          approved: statistics.approved,
          rejected: statistics.rejected,
          averageScore,
          proposalsAboveThreshold: statistics.proposalsAboveThreshold,
          totalBudgetAboveThreshold: statistics.totalBudgetAboveThreshold,
          approvedBudget: statistics.approvedBudget,
        },
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
}

export default new DecisionsController();
