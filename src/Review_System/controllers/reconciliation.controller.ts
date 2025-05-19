// src/Review_System/controllers/reconciliation.controller.ts
import { Request, Response } from 'express';
import Review, {
  IReview,
  ReviewStatus,
  ReviewType,
} from '../models/review.model';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import User, { UserRole } from '../../model/user.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError, BadRequestError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import mongoose, { Types } from 'mongoose';

interface IReconciliationResponse {
  success: boolean;
  message?: string;
  data?: any;
}

class ReconciliationController {
  // Assign a reconciliation reviewer for a proposal with discrepancy
  assignReconciliationReviewer = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      // Check if proposal exists and needs reconciliation
      const proposal = await Proposal.findById(proposalId);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Get existing reviews to check for discrepancy
      const reviews = await Review.find({
        proposal: proposalId,
        reviewType: { $ne: ReviewType.RECONCILIATION },
      }).populate('reviewer', 'faculty department');

      if (reviews.length < 2) {
        throw new BadRequestError(
          'Proposal does not have enough reviews for reconciliation'
        );
      }

      // Calculate average score and check if there's a discrepancy
      const totalScores = reviews.map((r) => r.totalScore);
      const avgScore =
        totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;
      const discrepancyThreshold = avgScore * 0.2;
      const hasDiscrepancy = totalScores.some(
        (score) => Math.abs(score - avgScore) > discrepancyThreshold
      );

      if (!hasDiscrepancy) {
        throw new BadRequestError(
          'No significant discrepancy detected for this proposal'
        );
      }

      // Check if a reconciliation reviewer is already assigned
      const existingReconciliation = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.RECONCILIATION,
      });

      if (existingReconciliation) {
        throw new BadRequestError(
          'A reconciliation reviewer has already been assigned'
        );
      }

      // Extract faculty information from original reviewers
      const reviewerFaculties: string[] = reviews
        .filter((r) => r.reviewer && r.reviewer.faculty)
        .map((r) => r.reviewer.faculty.toString());

      // Find the appropriate reviewer from other faculties in the same cluster
      // First, determine which cluster this proposal belongs to
      const submitterFaculty = await User.findById(proposal.submitter)
        .select('faculty')
        .populate('faculty', 'title');

      if (!submitterFaculty || !submitterFaculty.faculty) {
        throw new BadRequestError('Cannot determine submitter faculty');
      }

      const facultyTitle = (
        submitterFaculty.faculty as any
      ).title.toLowerCase();

      // Determine the cluster based on faculty
      let clusterFaculties: string[] = [];

      if (
        /life sciences|agric|agriculture|vet|veterinary/i.test(facultyTitle)
      ) {
        clusterFaculties = [
          'life sciences',
          'agriculture',
          'veterinary medicine',
        ];
      } else if (
        /pharmacy|dentistry|medicine|medical|basic medical/i.test(facultyTitle)
      ) {
        clusterFaculties = [
          'pharmacy',
          'dentistry',
          'medicine',
          'basic medical sciences',
        ];
      } else if (/management|education|social|vocational/i.test(facultyTitle)) {
        clusterFaculties = [
          'management sciences',
          'education',
          'social sciences',
          'vocational education',
        ];
      } else if (/law|arts|institute of education/i.test(facultyTitle)) {
        clusterFaculties = ['law', 'arts', 'institute of education'];
      } else if (/engineering|physical|environmental/i.test(facultyTitle)) {
        clusterFaculties = [
          'engineering',
          'physical sciences',
          'environmental sciences',
        ];
      } else {
        throw new BadRequestError('Cannot determine faculty cluster');
      }

      // Find all faculties in the same cluster
      const facultiesInCluster = await mongoose.model('Faculty').find({
        title: { $regex: new RegExp(clusterFaculties.join('|'), 'i') },
      });

      const facultyIds = facultiesInCluster.map((f) => f._id.toString());

      // Find reviewers from the same cluster but different faculty
      // who haven't previously reviewed this proposal and have fewer discrepancies
      const eligibleReviewers = await User.find({
        role: UserRole.REVIEWER,
        isActive: true,
        faculty: {
          $in: facultyIds,
          $nin: reviewerFaculties, // Not from the same faculty as original reviewers
        },
        _id: { $nin: reviews.map((r) => r.reviewer?._id) }, // Exclude previous reviewers
      })
        .populate('completedReviews')
        .sort({ assignedProposals: 1 }); // Sort by workload (fewer is better)

      if (!eligibleReviewers.length) {
        throw new BadRequestError('No eligible reconciliation reviewers found');
      }

      // Prioritize reviewers with fewer discrepancies
      // This would require more complex logic to track discrepancies
      // For now, just pick the one with the least workload
      const selectedReviewer = eligibleReviewers[0];

      // Create a new reconciliation review assignment
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5); // 5 business days

      const reconciliationReview = new Review({
        proposal: proposalId,
        reviewer: selectedReviewer._id,
        reviewType: ReviewType.RECONCILIATION,
        status: ReviewStatus.IN_PROGRESS,
        dueDate,
        scores: {
          relevanceToNationalPriorities: 0,
          originalityAndInnovation: 0,
          clarityOfResearchProblem: 0,
          methodology: 0,
          literatureReview: 0,
          teamComposition: 0,
          feasibilityAndTimeline: 0,
          budgetJustification: 0,
          expectedOutcomes: 0,
          sustainabilityAndScalability: 0,
        },
      });

      await reconciliationReview.save();

      // Update reviewer's assigned proposals
      await User.findByIdAndUpdate(selectedReviewer._id, {
        $push: { assignedProposals: proposalId },
      });

      // Update proposal status
      proposal.status = ProposalStatus.UNDER_REVIEW;
      await proposal.save();

      // Send notification to the reconciliation reviewer
      try {
        await emailService.sendReconciliationReviewerEmail(
          selectedReviewer.email,
          {
            reviewerName: selectedReviewer.name,
            proposalTitle: proposal.projectTitle || 'Research Proposal',
            dueDate: dueDate.toLocaleDateString(),
            loginLink: `${process.env.FRONTEND_URL}/reviewer/login`,
          }
        );
      } catch (error) {
        logger.error('Failed to send reconciliation reviewer email:', error);
      }

      res.status(200).json({
        success: true,
        message: 'Reconciliation reviewer assigned successfully',
        data: {
          reconciliationReview,
          reviewer: {
            id: selectedReviewer._id,
            name: selectedReviewer.name,
            email: selectedReviewer.email,
          },
        },
      });
    }
  );

  // Process completed reconciliation review
  processReconciliationReview = asyncHandler(
    async (
      req: Request<{ reviewId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { reviewId } = req.params;

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
      const finalScore =
        reconciliationReview.totalScore * 0.6 + regularAvg * 0.4;

      // Update proposal status
      const proposal = await Proposal.findById(reconciliationReview.proposal);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      proposal.reviewStatus = 'reviewed';
      await proposal.save();

      // Create or update award record
      let award = await Award.findOne({ proposal: proposal._id });

      if (award) {
        award.finalScore = finalScore;
        award.feedbackComments =
          'Your proposal has been reviewed after reconciliation. Final decision pending.';
      } else {
        award = new Award({
          proposal: proposal._id,
          submitter: proposal.submitter,
          finalScore: finalScore,
          status: AwardStatus.PENDING,
          fundingAmount: proposal.estimatedBudget || 0,
          feedbackComments:
            'Your proposal has been reviewed after reconciliation. Final decision pending.',
        });
      }

      await award.save();

      res.status(200).json({
        success: true,
        message: 'Reconciliation review processed successfully',
        data: {
          proposal: proposal._id,
          finalScore,
          award: award._id,
        },
      });
    }
  );

  // Get review discrepancy details
  getDiscrepancyDetails = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReconciliationResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;

      const reviews = await Review.find({
        proposal: proposalId,
        reviewType: { $ne: ReviewType.RECONCILIATION },
      }).populate('reviewer', 'name email faculty department');

      if (reviews.length < 2) {
        throw new BadRequestError(
          'Not enough reviews for discrepancy analysis'
        );
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

      res.status(200).json({
        success: true,
        data: {
          reviews: reviews.map((r) => ({
            id: r._id,
            reviewer: r.reviewer,
            scores: r.scores,
            totalScore: r.totalScore,
          })),
          criteriaDiscrepancies: discrepancyAnalysis,
          overallDiscrepancy,
        },
      });
    }
  );
}

export default new ReconciliationController();
