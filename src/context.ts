/* eslint-disable max-lines */
import { Request, Response } from 'express';
import Proposal from '../Proposal_Submission/models/proposal.model';
import { NotFoundError, UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';
import User, { IUser } from '../model/user.model';
import Faculty from '../Proposal_Submission/models/faculty.model';
import emailService from '../services/email.service';
import { PipelineStage } from 'mongoose';

// use this as context for the id page for the full proposal

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

// context for the graph or chart.
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

// Get proposal statistics
getProposalStatistics = asyncHandler(
  async (req: Request, res: Response<IStatisticsResponse>): Promise<void> => {
    const user = (req as AdminAuthenticatedRequest).user;
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new UnauthorizedError(
        'You do not have permission to access this resource'
      );
    }

    const totalProposals = await Proposal.countDocuments();
    const staffProposals = await Proposal.countDocuments({
      submitterType: 'staff',
    });
    const studentProposals = await Proposal.countDocuments({
      submitterType: 'master_student',
    });

    const statusCounts = await Proposal.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusStats: Record<string, number> = {};
    statusCounts.forEach((item) => {
      statusStats[item._id] = item.count;
    });

    logger.info(`Admin ${user.id} retrieved proposal statistics`);

    res.status(200).json({
      success: true,
      data: {
        total: totalProposals,
        byType: {
          staff: staffProposals,
          master_student: studentProposals,
        },
        byStatus: statusStats,
      },
    });
  }
);

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
      sort = 'finalScore',
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
          'facultyDetails._id': new mongoose.Types.ObjectId(faculty as string),
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
    let sortObj: Record<string, 1 | -1> = {};

    if (sort === 'finalScore' || sort === 'score') {
      // Sort by finalScore from award details
      sortObj = { finalScore: order === 'asc' ? 1 : -1 };
    } else if (sort === 'title') {
      sortObj = { projectTitle: order === 'asc' ? 1 : -1 };
    } else {
      sortObj[sort as string] = order === 'asc' ? 1 : -1;
    }

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
        ? Math.round(statistics.totalScoreSum / statistics.scoredProposalsCount)
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

getFacultiesWithProposals = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as AdminAuthenticatedRequest).user;
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new UnauthorizedError(
        'You do not have permission to access this resource'
      );
    }

    logger.info(`Admin ${user.id} retrieving faculties with proposals`);

    try {
      // Get all submitters who have created proposals
      const proposalSubmitters = await Proposal.find().distinct('submitter');
      logger.info(`Found ${proposalSubmitters.length} proposal submitters`);

      // Find users who submitted proposals and get their faculty IDs
      const facultyIds = await User.find({
        _id: { $in: proposalSubmitters },
      }).distinct('faculty');

      logger.info(`Found ${facultyIds.length} distinct faculty IDs`);

      // Find the faculty details for these IDs
      const faculties = await Faculty.find({
        _id: { $in: facultyIds },
      });

      logger.info(`Retrieved ${faculties.length} faculties with proposals`);

      res.status(200).json({
        success: true,
        data: faculties,
      });
    } catch (error) {
      logger.error(`Error retrieving faculties with proposals: ${error}`);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve faculties with proposals',
      });
    }
  }
);

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
      sort = 'submittedAt',
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
          from: 'proposals',
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
              $cond: [{ $eq: ['$status', FullProposalStatus.SUBMITTED] }, 1, 0],
            },
          },
          approved: {
            $sum: {
              $cond: [{ $eq: ['$status', FullProposalStatus.APPROVED] }, 1, 0],
            },
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ['$status', FullProposalStatus.REJECTED] }, 1, 0],
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
          from: 'proposals',
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
          'facultyDetails._id': new mongoose.Types.ObjectId(faculty as string),
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
