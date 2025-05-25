/* eslint-disable max-lines */
import Review, { ReviewStatus, ReviewType, IReview } from '../models/review.model';
import Proposal, { IProposal } from '../../Proposal_Submission/models/proposal.model';
import User, { UserRole } from '../../model/user.model';
import Award, { AwardStatus, IAward } from '../models/award.model';
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import mongoose, { Document } from 'mongoose';
import Faculty from '../../Proposal_Submission/models/faculty.model';

class ReconciliationController {
  // Check for discrepancies between reviews and assign reconciliation if needed
  public async checkReviewDiscrepancies(proposalId: string): Promise<{
    hasDiscrepancy: boolean;
    scores: number[];
    averageScore: number;
    discrepancyThreshold: number;
    reconciliationReviewer?: { id: string; name: string };
    dueDate?: Date;
  }> {
    // Find all completed reviews for this proposal
    const reviews = await Review.find({
      proposal: proposalId,
      status: ReviewStatus.COMPLETED,
    });

    // Need at least 2 reviews (typically 2 human reviews + 1 AI) to check for discrepancies
    if (reviews.length < 2) {
      throw new BadRequestError(
        'Not enough completed reviews to check for discrepancies'
      );
    }

    // Calculate average score and check for significant discrepancies
    const totalScores = reviews.map((r) => r.totalScore);
    const avgScore =
      totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;

    // Check if any score differs from average by more than 20%
    const discrepancyThreshold = avgScore * 0.2;
    const hasDiscrepancy = totalScores.some(
      (score) => Math.abs(score - avgScore) > discrepancyThreshold
    );

    // Get submitter's faculty information to find reviewers from the same cluster
    const proposal = await Proposal.findById(proposalId).populate({
      path: 'submitter',
      select: 'faculty',
      populate: { path: 'faculty', select: 'title code' },
    });

    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    if (hasDiscrepancy) {
      // Find a reviewer who hasn't reviewed this proposal already
      const existingReviewerIds = reviews
        .filter((r) => r.reviewType === ReviewType.HUMAN)
        .map((r) => r.reviewer?.toString());

      const submitterFaculty = (proposal.submitter as any).faculty;
      if (!submitterFaculty) {
        logger.error(`Faculty information missing for proposal ${proposalId}`);
        throw new BadRequestError(
          'Cannot assign reconciliation: Faculty information is missing'
        );
      }

      const submitterFacultyTitle =
        typeof submitterFaculty === 'string'
          ? submitterFaculty
          : submitterFaculty.title;

      // Use the same cluster logic as in assignReviewers
      const clusterMap = {
        // Cluster 1
        'Faculty of Agriculture': [
          'Faculty of Life Sciences',
          'Faculty of Veterinary Medicine',
        ],
        'Faculty of Life Sciences': [
          'Faculty of Agriculture',
          'Faculty of Veterinary Medicine',
        ],
        'Faculty of Veterinary Medicine': [
          'Faculty of Agriculture',
          'Faculty of Life Sciences',
        ],

        // Cluster 2
        'Faculty of Pharmacy': [
          'Faculty of Dentistry',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
        ],
        'Faculty of Dentistry': [
          'Faculty of Pharmacy',
          'Faculty of Medicine',
          'Faculty of Basic Medical Sciences',
        ],
        'Faculty of Medicine': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Basic Medical Sciences',
        ],
        'Faculty of Basic Medical Sciences': [
          'Faculty of Pharmacy',
          'Faculty of Dentistry',
          'Faculty of Medicine',
        ],

        // Cluster 3
        'Faculty of Management Sciences': [
          'Faculty of Education',
          'Faculty of Social Sciences',
          'Faculty of Vocational Education',
        ],
        'Faculty of Education': [
          'Faculty of Management Sciences',
          'Faculty of Social Sciences',
          'Faculty of Vocational Education',
        ],
        'Faculty of Social Sciences': [
          'Faculty of Management Sciences',
          'Faculty of Education',
          'Faculty of Vocational Education',
        ],
        'Faculty of Vocational Education': [
          'Faculty of Management Sciences',
          'Faculty of Education',
          'Faculty of Social Sciences',
        ],

        // Cluster 4
        'Faculty of Law': ['Faculty of Arts', 'Institute of Education'],
        'Faculty of Arts': ['Faculty of Law', 'Institute of Education'],
        'Institute of Education': ['Faculty of Law', 'Faculty of Arts'],

        // Cluster 5
        'Faculty of Engineering': [
          'Faculty of Physical Sciences',
          'Faculty of Environmental Sciences',
        ],
        'Faculty of Physical Sciences': [
          'Faculty of Engineering',
          'Faculty of Environmental Sciences',
        ],
        'Faculty of Environmental Sciences': [
          'Faculty of Engineering',
          'Faculty of Physical Sciences',
        ],
      };

      const eligibleFaculties =
        clusterMap[submitterFacultyTitle as keyof typeof clusterMap] || [];

      if (eligibleFaculties.length === 0) {
        logger.error(`No eligible faculties found for ${submitterFacultyTitle}`);
        throw new BadRequestError(
          "Cannot assign reconciliation: No eligible faculties found for the proposal's cluster"
        );
      }

      // Find reviewers from eligible faculties with the least current assignments
      const facultyIds = await Faculty.find({
        title: { $in: eligibleFaculties },
      }).select('_id'); // Get ObjectIds instead of codes

      const facultyIdList = facultyIds.map((f) => f._id);

      // Find eligible reconciliation reviewer
      const eligibleReviewer = await User.aggregate([
        {
          $match: {
            faculty: { $in: facultyIdList },
            role: UserRole.REVIEWER, // Add role filter
            isActive: true,
            invitationStatus: { $in: ['accepted', 'added'] },
            _id: {
              $nin: existingReviewerIds.map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
          },
        },
        {
          $lookup: {
            from: 'Reviews',
            localField: '_id',
            foreignField: 'reviewer',
            as: 'activeReviews',
          },
        },
        {
          $addFields: {
            pendingReviewsCount: {
              $size: {
                $filter: {
                  input: '$activeReviews',
                  as: 'review',
                  cond: { $ne: ['$$review.status', 'completed'] },
                },
              },
            },
            discrepancyCount: {
              $size: {
                $filter: {
                  input: '$activeReviews',
                  as: 'review',
                  cond: { $eq: ['$$review.reviewType', 'reconciliation'] },
                },
              },
            },
          },
        },
        {
          $sort: {
            discrepancyCount: 1,
            pendingReviewsCount: 1,
          },
        },
        {
          $limit: 1,
        },
      ]);

      if (eligibleReviewer.length === 0) {
        logger.error(
          `No eligible reconciliation reviewer found for proposal ${proposalId}`
        );
        throw new BadRequestError(
          'Cannot assign reconciliation: No eligible reviewers available'
        );
      }

      // Create reconciliation review assignment
      const dueDate = this.calculateDueDate(5);
      const reconciliationReview = new Review({
        proposal: proposalId,
        reviewer: eligibleReviewer[0]._id,
        reviewType: ReviewType.RECONCILIATION,
        status: ReviewStatus.IN_PROGRESS,
        dueDate,
      });

      await reconciliationReview.save();

      // Notify reconciliation reviewer
      try {
        await emailService.sendReconciliationAssignmentEmail(
          eligibleReviewer[0].email,
          eligibleReviewer[0].name,
          proposal.projectTitle || 'Research Proposal',
          dueDate,
          reviews.length,
          Math.round(avgScore * 10) / 10, // Round to 1 decimal place
          totalScores
        );
      } catch (error) {
        logger.error(
          'Failed to send reconciliation assignment email:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      logger.info(
        `Assigned reconciliation review for proposal ${proposalId} to reviewer ${eligibleReviewer[0]._id}`
      );

      return {
        hasDiscrepancy: true,
        scores: totalScores,
        averageScore: avgScore,
        discrepancyThreshold,
        reconciliationReviewer: {
          id: eligibleReviewer[0]._id.toString(), // Ensure _id is string
          name: eligibleReviewer[0].name,
        },
        dueDate,
      };
    } else {
      // No significant discrepancies
      logger.info(`No significant discrepancies found for proposal ${proposalId}`);
      return {
        hasDiscrepancy: false,
        scores: totalScores,
        averageScore: avgScore,
        discrepancyThreshold,
      };
    }
  }

  // Process completed reconciliation review
  public async processReconciliationReview(reviewId: string): Promise<{
    proposal: string;
    finalScore: number;
    award: string;
  }> {
    const reconciliationReview =
      await Review.findById(reviewId).populate('proposal');

    if (
      !reconciliationReview ||
      reconciliationReview.reviewType !== ReviewType.RECONCILIATION
    ) {
      throw new NotFoundError('Reconciliation review not found');
    }

    if (reconciliationReview.status !== ReviewStatus.COMPLETED) {
      throw new BadRequestError('Reconciliation review is not yet completed');
    }

    // Get all reviews for this proposal
    const allReviews = await Review.find({
      proposal: reconciliationReview.proposal,
    });

    // Calculate final score with reconciliation review weighted higher
    const regularReviews = allReviews.filter(
      (r) => r.reviewType !== ReviewType.RECONCILIATION
    );
    const regularAvg =
      regularReviews.reduce((sum, r) => sum + r.totalScore, 0) /
      regularReviews.length;

    // Final score: 60% reconciliation review + 40% average of regular reviews
    const finalScore = reconciliationReview.totalScore * 0.6 + regularAvg * 0.4;

    // Update proposal status
    const proposal = (await Proposal.findById(reconciliationReview.proposal)) as (Document<any, any, IProposal> & IProposal & { _id: mongoose.Types.ObjectId });
    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    proposal.reviewStatus = 'reviewed';
    await proposal.save();

    // Create or update award record
    let award = (await Award.findOne({ proposal: proposal._id.toString() })) as (Document<any, any, IAward> & IAward & { _id: mongoose.Types.ObjectId });

    if (award) {
      award.finalScore = finalScore;
      award.feedbackComments =
        'Your proposal has been reviewed after reconciliation. Final decision pending.';
    } else {
      award = new Award({
        proposal: proposal._id.toString(),
        submitter: proposal.submitter,
        finalScore: finalScore,
        status: AwardStatus.PENDING,
        fundingAmount: proposal.estimatedBudget || 0,
        feedbackComments:
          'Your proposal has been reviewed after reconciliation. Final decision pending.',
      }) as (Document<any, any, IAward> & IAward & { _id: mongoose.Types.ObjectId });
    }

    await award.save();

    return {
      proposal: proposal._id.toString(),
      finalScore,
      award: award._id.toString(),
    };
  }

  // Get review discrepancy details for a specific proposal
  public async getDiscrepancyDetails(proposalId: string): Promise<{
    reviews: Array<{ id: string; reviewer: any; scores: any; totalScore: number }>;
    criteriaDiscrepancies: Array<any>;
    overallDiscrepancy: any;
  }> {
    const reviews = (await Review.find({
      proposal: proposalId,
      reviewType: { $ne: ReviewType.RECONCILIATION },
    }).populate('reviewer', 'name email faculty department')) as (Document<any, any, IReview> & IReview & { _id: mongoose.Types.ObjectId })[];

    if (reviews.length < 2) {
      throw new BadRequestError('Not enough reviews for discrepancy analysis');
    }

    // Calculate discrepancy for each criterion
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

    const discrepancyAnalysis = criteriaNames.map((criterion) => {
      const scores = reviews.map(
        (r) => r.scores[criterion as keyof typeof r.scores] as number
      );
      const max = Math.max(...scores);
      const min = Math.min(...scores);
      const avg =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;

      return {
        criterion,
        scores,
        max,
        min,
        avg,
        variance: Math.pow(max - min, 2) / avg, // Simple variance measure
        percentDifference: ((max - min) / avg) * 100,
      };
    });

    // Sort by highest discrepancy
    discrepancyAnalysis.sort(
      (a, b) => b.percentDifference - a.percentDifference
    );

    // Calculate overall score discrepancy
    const totalScores = reviews.map((r) => r.totalScore);
    const maxTotal = Math.max(...totalScores);
    const minTotal = Math.min(...totalScores);
    const avgTotal =
      totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;

    const overallDiscrepancy = {
      scores: totalScores,
      max: maxTotal,
      min: minTotal,
      avg: avgTotal,
      variance: Math.pow(maxTotal - minTotal, 2) / avgTotal,
      percentDifference: ((maxTotal - minTotal) / avgTotal) * 100,
    };

    return {
      reviews: reviews.map((r) => ({
        id: r._id.toString(), // Ensure _id is string
        reviewer: r.reviewer,
        scores: r.scores,
        totalScore: r.totalScore,
      })),
      criteriaDiscrepancies: discrepancyAnalysis,
      overallDiscrepancy,
    };
  }

  // Helper function to calculate due date (X business days from now)
  private calculateDueDate(businessDays: number): Date {
    const date = new Date();
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      date.setDate(date.getDate() + 1);
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        daysAdded++;
      }
    }

    return date;
  }
}

export default new ReconciliationController();
