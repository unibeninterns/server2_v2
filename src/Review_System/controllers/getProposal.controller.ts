import { Request, Response } from 'express';
import Review, {
  IScore,
  ReviewStatus,
  ReviewType,
} from '../models/review.model';
import Proposal, {
  ProposalStatus,
} from '../../Proposal_Submission/models/proposal.model';
import Award, { AwardStatus } from '../models/award.model';
import { NotFoundError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';
import emailService from '../../services/email.service';
import mongoose from 'mongoose';

interface IReviewResponse {
  success: boolean;
  message?: string;
  data?: any;
}

interface ISubmitReviewRequest {
  scores: IScore;
  comments: string;
}

class getProposalController {
  getProposalForReview = asyncHandler(
    async (
      req: Request<{ proposalId: string }>,
      res: Response<IReviewResponse>
    ): Promise<void> => {
      const { proposalId } = req.params;
      const reviewerId = req.user.id;

      // Check if reviewer is assigned to this proposal
      const reviewAssignment = await Review.findOne({
        proposal: proposalId,
        reviewer: reviewerId,
        reviewType: { $ne: ReviewType.AI }, // Exclude AI reviews
      });

      if (!reviewAssignment) {
        throw new NotFoundError('You are not assigned to review this proposal');
      }

      // Get proposal details
      const proposal = await Proposal.findById(proposalId).populate({
        path: 'submitter',
        select: 'faculty department', // We need faculty/department for document processing, but exclude personal info
        populate: [
          { path: 'faculty', select: 'title' },
          { path: 'department', select: 'title' },
        ],
      });

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      // Process the proposal document for review (anonymize and standardize)
      const documentProcessingService =
        require('../../services/documentProcessing.service').default;
      const { anonymizedDocPath, extractedContent, error } =
        await documentProcessingService.processProposalForReview(proposalId);

      if (error) {
        logger.error(`Error processing proposal document: ${error}`);
      }

      // Get AI review if it exists
      const aiReview = await Review.findOne({
        proposal: proposalId,
        reviewType: ReviewType.AI,
      });

      // If AI review doesn't exist, generate one
      if (!aiReview) {
        try {
          // Import AI scoring controller to generate AI review
          const aiScoringController =
            require('../controllers/aiScoring.controller').default;
          await aiScoringController.generateAIScores(
            { params: { proposalId } },
            { status: () => ({ json: () => {} }) } as Response
          );

          // Fetch the newly created AI review
          const newAiReview = await Review.findOne({
            proposal: proposalId,
            reviewType: ReviewType.AI,
          });

          if (newAiReview) {
            logger.info(`AI review generated for proposal ${proposalId}`);
          }
        } catch (error) {
          logger.error(
            `Error generating AI review: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Get existing reviews to show the reviewer what others have thought
      // (excluding the current reviewer's unfinished review)
      const otherCompletedReviews = await Review.find({
        proposal: proposalId,
        status: ReviewStatus.COMPLETED,
        _id: { $ne: reviewAssignment._id },
      }).select('scores comments totalScore reviewType');

      // Determine proposal type-specific scoring criteria
      const scoringCriteria = this.getScoringCriteriaByProposalType(
        proposal.submitterType
      );

      // Create a response object that excludes personal details
      const sanitizedProposal = {
        _id: proposal._id,
        projectTitle: proposal.projectTitle,
        submitterType: proposal.submitterType,
        problemStatement: proposal.problemStatement,
        objectives: proposal.objectives,
        methodology: proposal.methodology,
        expectedOutcomes: proposal.expectedOutcomes,
        workPlan: proposal.workPlan,
        estimatedBudget: proposal.estimatedBudget,
        status: proposal.status,
        reviewStatus: proposal.reviewStatus,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
        facultyName: proposal.submitter?.faculty?.title || '',
        departmentName: proposal.submitter?.department?.title || '',
        extractedContent: extractedContent || {},
        // No personal identification information included
      };

      res.status(200).json({
        success: true,
        data: {
          proposal: sanitizedProposal,
          reviewAssignment,
          anonymizedDocPath: anonymizedDocPath
            ? `/processed_proposals/${path.basename(anonymizedDocPath)}`
            : null,
          otherCompletedReviews: otherCompletedReviews.map((review) => ({
            type: review.reviewType,
            scores: review.scores,
            totalScore: review.totalScore,
          })),
          scoringCriteria,
        },
      });
    }
  );

  // Helper method to get scoring criteria based on proposal type
  getScoringCriteriaByProposalType(submitterType?: string) {
    // Base criteria that apply to all proposals
    const baseCriteria = {
      relevanceToNationalPriorities: {
        description: 'Alignment with national research priorities',
        maxScore: 10,
      },
      originalityAndInnovation: {
        description: 'Originality of research concept and innovation potential',
        maxScore: 15,
      },
      clarityOfResearchProblem: {
        description: 'Clear definition of the research problem',
        maxScore: 10,
      },
      methodology: {
        description: 'Appropriate methodology to address research questions',
        maxScore: 15,
      },
      literatureReview: {
        description: 'Comprehensive review of relevant literature',
        maxScore: 10,
      },
    };

    if (submitterType === 'master_student') {
      // Adjust criteria for master's student proposals
      return {
        ...baseCriteria,
        // Adjusted criteria specific to master's students
        teamComposition: {
          description: 'Student qualifications and academic background',
          maxScore: 10,
        },
        feasibilityAndTimeline: {
          description: 'Feasibility of completing within one academic session',
          maxScore: 10,
        },
        budgetJustification: {
          description: 'Appropriate and justified budget allocation',
          maxScore: 10,
        },
        expectedOutcomes: {
          description: 'Clear and achievable anticipated outcomes',
          maxScore: 5,
        },
        sustainabilityAndScalability: {
          description: 'Potential for further development beyond the project',
          maxScore: 5,
        },
      };
    }

    // Staff proposal criteria
    return {
      ...baseCriteria,
      teamComposition: {
        description: 'Qualifications and composition of the research team',
        maxScore: 10,
      },
      feasibilityAndTimeline: {
        description: 'Realistic workplan and timeline',
        maxScore: 10,
      },
      budgetJustification: {
        description: 'Well-justified and appropriate budget',
        maxScore: 10,
      },
      expectedOutcomes: {
        description: 'Significance and impact of expected outcomes',
        maxScore: 5,
      },
      sustainabilityAndScalability: {
        description: 'Potential for sustainability and scalability of results',
        maxScore: 5,
      },
    };
  }
}
export default new getProposalController();
