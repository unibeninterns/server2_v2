/* eslint-disable max-lines */
import { Request, Response, NextFunction } from 'express';
import Review, { ReviewType, ReviewStatus } from '../models/review.model';
import Proposal from '../../Proposal_Submission/models/proposal.model';
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import mongoose from 'mongoose';
import logger from '../../utils/logger';

interface IProposalReviewsResponse {
  success: boolean;
  count?: number;
  message?: string;
  data?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

interface GetProposalReviewsRequest extends AuthenticatedRequest {
  query: {
    page?: string;
    limit?: string;
    status?: 'under_review' | 'reviewed' | 'reconciliation';
    faculty?: string;
    discrepancy?: 'true' | 'false';
  };
}

interface GetProposalReviewDetailsRequest extends AuthenticatedRequest {
  params: {
    proposalId: string;
  };
}

class ProposalReviewsController {
  // Get all proposals that are under review, reviewed, or in reconciliation
  getAllProposalReviews = asyncHandler(
    async (
      req: Request,
      res: Response<IProposalReviewsResponse>,
      next: NextFunction
    ): Promise<void> => {
      const user = (req as GetProposalReviewsRequest).user;

      const page = parseInt((req.query.page || '1').toString());
      const limit = parseInt((req.query.limit || '10').toString());
      const skip = (page - 1) * limit;
      const { status, faculty, discrepancy } = req.query;

      // Build aggregation pipeline
      const pipeline: any[] = [
        // Match proposals that have at least one review
        {
          $lookup: {
            from: 'Reviews',
            localField: '_id',
            foreignField: 'proposal',
            as: 'reviews',
          },
        },
        {
          $match: {
            'reviews.0': { $exists: true }, // Has at least one review
          },
        },
        // Populate submitter details
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
        // Populate faculty details
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
        // Populate department details
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
        // Add computed fields
        {
          $addFields: {
            totalReviews: { $size: '$reviews' },
            completedReviews: {
              $size: {
                $filter: {
                  input: '$reviews',
                  as: 'review',
                  cond: { $eq: ['$$review.status', 'completed'] },
                },
              },
            },
            hasReconciliation: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$reviews',
                      as: 'review',
                      cond: { $eq: ['$$review.reviewType', 'reconciliation'] },
                    },
                  },
                },
                0,
              ],
            },
            // Calculate review status
            currentStatus: {
              $cond: {
                if: {
                  $and: [
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: '$reviews',
                              as: 'review',
                              cond: {
                                $and: [
                                  {
                                    $eq: [
                                      '$$review.reviewType',
                                      'reconciliation',
                                    ],
                                  },
                                  { $eq: ['$$review.status', 'completed'] },
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
                then: 'reviewed',
                else: {
                  $cond: {
                    if: { $eq: ['$reviewStatus', 'reviewed'] },
                    then: 'reviewed',
                    else: 'under_review',
                  },
                },
              },
            },
            // Check for discrepancy
            hasDiscrepancy: {
              $cond: {
                if: {
                  $gt: [
                    {
                      $size: {
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
                    },
                    0,
                  ],
                },
                then: false, // Only if reconciliation review is completed
                else: {
                  // ...existing discrepancy calculation logic...
                  $let: {
                    vars: {
                      completedNonReconciliation: {
                        $filter: {
                          input: '$reviews',
                          as: 'review',
                          cond: {
                            $and: [
                              { $eq: ['$$review.status', 'completed'] },
                              {
                                $ne: ['$$review.reviewType', 'reconciliation'],
                              },
                            ],
                          },
                        },
                      },
                    },
                    in: {
                      $cond: {
                        if: {
                          $gte: [{ $size: '$$completedNonReconciliation' }, 2],
                        },
                        then: {
                          $let: {
                            vars: {
                              scores: {
                                $map: {
                                  input: '$$completedNonReconciliation',
                                  as: 'review',
                                  in: '$$review.totalScore',
                                },
                              },
                            },
                            in: {
                              $let: {
                                vars: {
                                  avg: { $avg: '$$scores' },
                                  max: { $max: '$$scores' },
                                  min: { $min: '$$scores' },
                                },
                                in: {
                                  $gt: [
                                    {
                                      $max: [
                                        { $subtract: ['$$max', '$$avg'] },
                                        { $subtract: ['$$avg', '$$min'] },
                                      ],
                                    },
                                    { $multiply: ['$$avg', 0.2] },
                                  ],
                                },
                              },
                            },
                          },
                        },
                        else: false,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ];

      // Apply filters
      const matchConditions: any = {};

      if (status) {
        matchConditions.currentStatus = status;
      }

      if (faculty) {
        matchConditions['facultyDetails._id'] = new mongoose.Types.ObjectId(
          faculty.toString()
        );
      }

      if (discrepancy === 'true') {
        matchConditions.hasDiscrepancy = true;
      } else if (discrepancy === 'false') {
        matchConditions.hasDiscrepancy = false;
      }

      if (Object.keys(matchConditions).length > 0) {
        pipeline.push({ $match: matchConditions });
      }

      // Add projection to clean up the response
      pipeline.push({
        $project: {
          projectTitle: 1,
          submitterType: 1,
          status: 1,
          reviewStatus: 1,
          currentStatus: 1,
          totalReviews: 1,
          completedReviews: 1,
          hasReconciliation: 1,
          hasDiscrepancy: 1,
          createdAt: 1,
          updatedAt: 1,
          submitter: {
            name: '$submitterDetails.name',
            email: '$submitterDetails.email',
            academicTitle: '$submitterDetails.academicTitle',
          },
          faculty: {
            title: '$facultyDetails.title',
            code: '$facultyDetails.code',
          },
          department: {
            title: '$departmentDetails.title',
            code: '$departmentDetails.code',
          },
        },
      });

      // Sort by latest first
      pipeline.push({ $sort: { updatedAt: -1, createdAt: -1 } });

      // Count total documents
      const countPipeline = [...pipeline, { $count: 'total' }];
      const totalResult = await Proposal.aggregate(countPipeline);
      const total = totalResult[0]?.total || 0;

      // Add pagination
      pipeline.push({ $skip: skip }, { $limit: limit });

      // Execute aggregation
      const proposals = await Proposal.aggregate(pipeline);

      const totalPages = Math.ceil(total / limit);

      logger.info(
        `Admin ${user.id} retrieved proposal reviews with pagination: page ${page}, limit ${limit}`
      );

      res.status(200).json({
        success: true,
        count: proposals.length,
        data: proposals,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
        },
      });
    }
  );

  // Get detailed review information for a specific proposal
  getProposalReviewDetails = asyncHandler(
    async (
      req: Request,
      res: Response<IProposalReviewsResponse>
    ): Promise<void> => {
      const user = (req as GetProposalReviewDetailsRequest).user;
      const { proposalId } = req.params;

      // Validate proposalId format
      if (!mongoose.Types.ObjectId.isValid(proposalId)) {
        throw new BadRequestError('Invalid proposal ID format');
      }

      // Get proposal basic info
      const proposal = await Proposal.findById(proposalId)
        .populate({
          path: 'submitter',
          select: 'name email academicTitle',
          populate: [
            { path: 'faculty', select: 'title code' },
            { path: 'department', select: 'title code' },
          ],
        })
        .select(
          'projectTitle submitterType status reviewStatus createdAt updatedAt'
        );

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Get all reviews for this proposal
      const reviews = await Review.find({ proposal: proposalId })
        .populate({
          path: 'reviewer',
          select: 'name email academicTitle',
          populate: [
            { path: 'faculty', select: 'title code' },
            { path: 'department', select: 'title code' },
          ],
        })
        .sort({ createdAt: 1 }); // Chronological order

      // Separate reviews by type for better organization
      const aiReviews = reviews.filter((r) => r.reviewType === ReviewType.AI);
      const humanReviews = reviews.filter(
        (r) => r.reviewType === ReviewType.HUMAN
      );
      const reconciliationReviews = reviews.filter(
        (r) => r.reviewType === ReviewType.RECONCILIATION
      );

      // Calculate discrepancy information if applicable
      let discrepancyInfo = null;
      const completedNonReconciliation = reviews.filter(
        (r) =>
          r.status === ReviewStatus.COMPLETED &&
          r.reviewType !== ReviewType.RECONCILIATION
      );

      if (completedNonReconciliation.length >= 2) {
        const scores = completedNonReconciliation.map((r) => r.totalScore);
        const avg =
          scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        const threshold = avg * 0.2;
        const hasDiscrepancy = Math.max(max - avg, avg - min) > threshold;

        if (hasDiscrepancy) {
          // Calculate criterion-level discrepancies
          const criteriaNames = [
            'relevanceToNationalPriorities',
            'originalityAndInnovation',
            'clarityOfResearchProblem',
            'methodology',
            'literatureReview',
            'teamComposition',
            'feasibilityAndTimeline',
            'budgetJustification',
            'expectedOutcomes',
            'sustainabilityAndScalability',
          ];

          const criteriaDiscrepancies = criteriaNames
            .map((criterion) => {
              const criterionScores = completedNonReconciliation.map(
                (r) => r.scores[criterion as keyof typeof r.scores] as number
              );
              const criterionMax = Math.max(...criterionScores);
              const criterionMin = Math.min(...criterionScores);
              const criterionAvg =
                criterionScores.reduce((sum, score) => sum + score, 0) /
                criterionScores.length;

              return {
                criterion,
                scores: criterionScores,
                max: criterionMax,
                min: criterionMin,
                avg: Math.round(criterionAvg * 10) / 10,
                percentDifference:
                  Math.round(
                    ((criterionMax - criterionMin) / criterionAvg) * 100 * 10
                  ) / 10,
              };
            })
            .sort((a, b) => b.percentDifference - a.percentDifference);

          discrepancyInfo = {
            hasDiscrepancy: true,
            overallScores: {
              scores,
              max,
              min,
              avg: Math.round(avg * 10) / 10,
              percentDifference:
                Math.round(((max - min) / avg) * 100 * 10) / 10,
            },
            criteriaDiscrepancies: criteriaDiscrepancies.slice(0, 5), // Top 5 discrepancies
            threshold,
          };
        }
      }

      // Format response data
      const responseData = {
        proposal: {
          id: proposal._id,
          projectTitle: proposal.projectTitle,
          submitterType: proposal.submitterType,
          status: proposal.status,
          reviewStatus: proposal.reviewStatus,
          createdAt: proposal.createdAt,
          updatedAt: proposal.updatedAt,
          submitter: proposal.submitter,
        },
        reviewSummary: {
          totalReviews: reviews.length,
          completedReviews: reviews.filter(
            (r) => r.status === ReviewStatus.COMPLETED
          ).length,
          pendingReviews: reviews.filter(
            (r) => r.status === ReviewStatus.IN_PROGRESS
          ).length,
          hasAI: aiReviews.length > 0,
          hasHuman: humanReviews.length > 0,
          hasReconciliation: reconciliationReviews.length > 0,
        },
        reviews: {
          ai: aiReviews.map(this.formatReviewData),
          human: humanReviews.map(this.formatReviewData),
          reconciliation: reconciliationReviews.map(this.formatReviewData),
        },
        discrepancyInfo,
      };

      logger.info(
        `Admin ${user.id} retrieved proposal ${proposalId} review details`
      );

      res.status(200).json({
        success: true,
        data: responseData,
      });
    }
  );

  // Get only proposals flagged for discrepancy
  getDiscrepancyProposals = asyncHandler(
    async (
      req: Request,
      res: Response<IProposalReviewsResponse>,
      next: NextFunction
    ): Promise<void> => {
      const user = (req as GetProposalReviewsRequest).user;
      logger.info(`Admin ${user.id} requested discrepancy proposals`);
      // Use the same logic as getAllProposalReviews but filter for discrepancy only
      req.query.discrepancy = 'true';
      return this.getAllProposalReviews(req, res, next);
    }
  );

  // Helper method to format review data consistently
  private formatReviewData = (review: any) => {
    return {
      id: review._id,
      reviewType: review.reviewType,
      status: review.status,
      scores: review.scores,
      totalScore: review.totalScore,
      comments: review.comments,
      dueDate: review.dueDate,
      completedAt: review.completedAt,
      createdAt: review.createdAt,
      reviewer: review.reviewer
        ? {
            name: review.reviewer.name,
            email: review.reviewer.email,
            academicTitle: review.reviewer.academicTitle,
            faculty: review.reviewer.faculty,
            department: review.reviewer.department,
          }
        : null, // AI reviews don't have reviewers
    };
  };

  // Get review statistics for dashboard
  getReviewStatistics = asyncHandler(
    async (
      req: Request,
      res: Response<IProposalReviewsResponse>
    ): Promise<void> => {
      const user = (req as AuthenticatedRequest).user;
      const stats = await Promise.all([
        // Total proposals with reviews
        Proposal.aggregate([
          {
            $lookup: {
              from: 'Reviews',
              localField: '_id',
              foreignField: 'proposal',
              as: 'reviews',
            },
          },
          {
            $match: {
              'reviews.0': { $exists: true },
              isArchived: { $ne: true },
            },
          },
          { $count: 'total' },
        ]),

        // Proposals under review
        Proposal.countDocuments({
          reviewStatus: { $ne: 'reviewed' },
          isArchived: { $ne: true },
        }),

        // Completed reviews
        Proposal.countDocuments({ reviewStatus: 'reviewed' }),

        // Proposals in reconciliation
        Review.distinct('proposal', { reviewType: ReviewType.RECONCILIATION }),

        // Proposals with discrepancy
        Proposal.aggregate([
          {
            $lookup: {
              from: 'Reviews',
              localField: '_id',
              foreignField: 'proposal',
              as: 'reviews',
            },
          },
          {
            $addFields: {
              hasDiscrepancy: {
                $let: {
                  vars: {
                    completedNonReconciliation: {
                      $filter: {
                        input: '$reviews',
                        as: 'review',
                        cond: {
                          $and: [
                            { $eq: ['$$review.status', 'completed'] },
                            { $ne: ['$$review.reviewType', 'reconciliation'] },
                          ],
                        },
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: {
                        $gte: [{ $size: '$$completedNonReconciliation' }, 2],
                      },
                      then: {
                        $let: {
                          vars: {
                            scores: {
                              $map: {
                                input: '$$completedNonReconciliation',
                                as: 'review',
                                in: '$$review.totalScore',
                              },
                            },
                          },
                          in: {
                            $let: {
                              vars: {
                                avg: { $avg: '$$scores' },
                                max: { $max: '$$scores' },
                                min: { $min: '$$scores' },
                              },
                              in: {
                                $gt: [
                                  {
                                    $max: [
                                      { $subtract: ['$$max', '$$avg'] },
                                      { $subtract: ['$$avg', '$$min'] },
                                    ],
                                  },
                                  { $multiply: ['$$avg', 0.2] },
                                ],
                              },
                            },
                          },
                        },
                      },
                      else: false,
                    },
                  },
                },
              },
            },
          },
          {
            $match: { hasDiscrepancy: true },
          },
          { $count: 'total' },
        ]),
      ]);

      logger.info(`Admin ${user.id} retrieved review statistics`);

      const totalWithReviews = stats[0][0]?.total || 0;
      const underReview = stats[1] || 0;
      const reviewed = stats[2] || 0;
      const inReconciliation = stats[3]?.length || 0;
      const withDiscrepancy = stats[4][0]?.total || 0;

      res.status(200).json({
        success: true,
        data: {
          totalWithReviews,
          underReview,
          reviewed,
          inReconciliation,
          withDiscrepancy,
          completionRate:
            totalWithReviews > 0
              ? Math.round((reviewed / totalWithReviews) * 100)
              : 0,
        },
      });
    }
  );
}

export default new ProposalReviewsController();
