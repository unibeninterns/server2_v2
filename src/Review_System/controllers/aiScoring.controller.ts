import Review, {
  ReviewStatus,
  ReviewType,
  IScore,
} from '../models/review.model';
import Proposal, {
  SubmitterType,
} from '../../Proposal_Submission/models/proposal.model';
import { NotFoundError } from '../../utils/customErrors';
import logger from '../../utils/logger';
import emailService from '../../services/email.service'; // Import emailService
import { reviewProposal } from 'uniben-ai-proposal-review-cli'; // Import the reviewProposal function
import agenda from '../../config/agenda'; // Import the agenda instance

// Generate AI review for a proposal
export const generateAIReviewForProposal = async (
  proposalId: string
): Promise<{ success: boolean; message: string; data?: any }> => {
  try {
    // Check if proposal exists
    const proposal = await Proposal.findById(proposalId);
    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    // Check if AI review already exists
    const existingAIReview = await Review.findOne({
      proposal: proposalId,
      reviewType: ReviewType.AI,
    });

    if (existingAIReview) {
      return {
        success: true,
        message: 'AI review already exists for this proposal',
        data: existingAIReview,
      };
    }

    // Create a new AI review
    const aiReview = new Review({
      proposal: proposalId,
      reviewer: null, // null for AI review
      reviewType: ReviewType.AI,
      status: ReviewStatus.IN_PROGRESS,
      dueDate: new Date(), // AI review due immediately
    });

    await aiReview.save();

    // Generate AI scores and update the review
    await generateAIReviewScores(aiReview._id as string);

    // Fetch the updated review
    const completedAIReview = await Review.findById(aiReview._id);

    return {
      success: true,
      message: 'AI review generated successfully',
      data: completedAIReview,
    };
  } catch (error: any) {
    await agenda.now('generate AI review', {
          proposalId: proposalId,
        });
    logger.info(
      `Dispatched failed AI review job for proposal ${proposalId} to Agenda`
    );
    // Catch errors during the process
    logger.error(
      `Error generating AI review for proposal ${proposalId}:`,
      error
    );

    const supportEmail = process.env.SUPPORT_EMAIL;
    if (supportEmail) {
      try {
        await emailService.sendAiReviewFailureEmail(
          supportEmail,
          proposalId,
          error.message || 'No error message available'
        );
        logger.info(
          `Sent AI review failure notification email to ${supportEmail} for proposal ${proposalId}`
        );
      } catch (emailError: any) {
        logger.error(
          `Failed to send AI review failure notification email for proposal ${proposalId}:`,
          emailError
        );
      }
    } else {
      logger.warn(
        `SUPPORT_EMAIL not set. Could not send AI review failure notification for proposal ${proposalId}.`
      );
    }

    return {
      success: false,
      message: `Failed to generate AI review for proposal ${proposalId}: ${error.message || 'Unknown error'}`,
      // Removed the 'error' property as it's not in the return type
    };
  }
};

// Generate AI review scores for a specific review
const generateAIReviewScores = async (reviewId: string): Promise<void> => {
  const review = await Review.findById(reviewId).populate('proposal');
  if (!review || review.reviewType !== ReviewType.AI || !review.proposal) {
    throw new NotFoundError('AI Review or associated proposal not found');
  }

  // Explicitly type the populated proposal
  const proposal = review.proposal as typeof Proposal.prototype;

  let evaluationResult;

  // Determine input based on submitter type
  if (proposal.submitterType === SubmitterType.STAFF) {
    // For staff, construct formatted text input
    const staffTextInput = `
Proposal Title:
${proposal.title || ''}

Problem Statement:
${proposal.problemStatement || ''}

Objectives:
${proposal.objectives || ''}

Methodology:
${proposal.methodology || ''}

Expected Outcomes:
${proposal.expectedOutcomes || ''}

Work Plan:
${proposal.workPlan || ''}

Estimated Budget:
${proposal.estimatedBudget || ''}
`;
    evaluationResult = await reviewProposal(staffTextInput, '-t');
  } else if (proposal.submitterType === SubmitterType.MASTER_STUDENT) {
    // For master students, use the file path
    if (!proposal.docFile) {
      throw new Error('Proposal file path not found for master student');
    }
    // Extract file name from the URL and construct the absolute path
    const fileName = proposal.docFile.split('/').pop();
    const filePath = `${process.cwd()}/src/uploads/documents/${fileName}`; //TODO ensure the path is correct...
    evaluationResult = await reviewProposal(filePath, '-f');
  } else {
    throw new Error(`Unknown submitter type: ${proposal.submitterType}`);
  }

  // Map AI scores to the review model's IScore interface
  const mappedScores: IScore = {
    relevanceToNationalPriorities: evaluationResult.scores.relevance,
    originalityAndInnovation: evaluationResult.scores.originality,
    clarityOfResearchProblem: evaluationResult.scores.clarity,
    methodology: evaluationResult.scores.methodology,
    literatureReview: evaluationResult.scores.literature,
    teamComposition: evaluationResult.scores.team,
    feasibilityAndTimeline: evaluationResult.scores.feasibility,
    budgetJustification: evaluationResult.scores.budget,
    expectedOutcomes: evaluationResult.scores.outcomes,
    sustainabilityAndScalability: evaluationResult.scores.sustainability,
  };

  // Update review with mapped AI scores and comment
  review.scores = mappedScores;
  review.comments = evaluationResult.comment;
  review.status = ReviewStatus.COMPLETED;
  review.completedAt = new Date();

  await review.save();

  logger.info(`Generated AI review for proposal ${review.proposal._id}`);
};
