// services/document.service.ts - Create this new file
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { PDFExtract } from 'pdf.js-extract';
import {
  IProposal,
  SubmitterType,
} from '../Proposal_Submission/models/proposal.model';

class DocumentService {
  private pdfExtract: any;

  constructor() {
    this.pdfExtract = new PDFExtract();
  }

  // Extract text from PDF or DOCX files
  async extractTextFromDocument(filePath: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.pdf') {
      return this.extractTextFromPDF(filePath);
    } else if (extension === '.docx') {
      return this.extractTextFromDOCX(filePath);
    } else {
      throw new Error(`Unsupported file format: ${extension}`);
    }
  }

  // Extract text from PDF
  private async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      const data = await this.pdfExtract.extract(filePath);
      return data.pages
        .map((page) => page.content.map((item) => item.str).join(' '))
        .join('\n');
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error}`);
    }
  }

  // Extract text from DOCX
  private async extractTextFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to extract text from DOCX: ${error}`);
    }
  }

  // Parse Master's Student proposal from document text
  async parseMasterStudentProposal(text: string): Promise<Partial<IProposal>> {
    const proposal: Partial<IProposal> = {
      submitterType: SubmitterType.MASTER_STUDENT,
    };

    // Define regex patterns for each field
    const patterns = {
      projectTitle: /Project Title:([^\n]*)/i,
      problemStatement:
        /Problem Statement and Justification:([^]*)(?=Objectives|$)/i,
      objectives:
        /Objectives and Anticipated Outcomes:([^]*)(?=Research-Informed|$)/i,
      methodology:
        /Research-Informed Approach and Methodology:([^]*)(?=Innovation|$)/i,
      innovationAndImpact:
        /Innovation and Impact:([^]*)(?=Interdisciplinary|$)/i,
      interdisciplinaryRelevance:
        /Interdisciplinary Relevance:([^]*)(?=Implementation|$)/i,
      workPlan:
        /Implementation Plan and Timeline:([^]*)(?=Preliminary Budget|$)/i,
      estimatedBudget:
        /Preliminary Budget Estimate[^:]*:([^]*)(?=Important Submission|$)/i,
    };

    // Extract fields using regex
    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();

        // Convert budget string to number if it's the budget field
        if (field === 'estimatedBudget') {
          // Try to extract numeric value from the budget text
          const numericMatch = value.match(/[0-9,]+(\.[0-9]+)?/);
          if (numericMatch) {
            value = numericMatch[0].replace(/,/g, '');
            proposal[field] = parseFloat(value);
          }
        } else {
          proposal[field] = value;
        }
      }
    }

    // Remove any personal information from the text
    return this.removePersonalInformation(proposal);
  }

  // Generate a document from staff proposal form data
  async generateStaffProposalDocument(proposal: IProposal): Promise<string> {
    // Create a document content string for AI review
    const documentContent = `
# Research Proposal

## Project Title
${proposal.projectTitle || 'N/A'}

## Problem Statement
${proposal.problemStatement || 'N/A'}

## Research Objectives
${proposal.objectives || 'N/A'}

## Methodology
${proposal.methodology || 'N/A'}

## Expected Outcomes
${proposal.expectedOutcomes || 'N/A'}

## Work Plan
${proposal.workPlan || 'N/A'}

## Estimated Budget
${proposal.estimatedBudget ? `$${proposal.estimatedBudget.toLocaleString()}` : 'N/A'}
`;

    const outputPath = path.join(
      __dirname,
      '../temp',
      `proposal_${proposal._id}.md`
    );

    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, '../temp'))) {
      fs.mkdirSync(path.join(__dirname, '../temp'), { recursive: true });
    }

    // Write to file
    fs.writeFileSync(outputPath, documentContent);

    return outputPath;
  }

  // Remove personal information from proposal
  private removePersonalInformation(
    proposal: Partial<IProposal>
  ): Partial<IProposal> {
    // Process all text fields to remove potential personal info
    const sensitiveFields = [
      'problemStatement',
      'objectives',
      'methodology',
      'workPlan',
    ];

    // Patterns to identify and remove personal information
    const personalInfoPatterns = [
      /(?:Full Name|Name):?\s*([^\n,;\.]+)/gi,
      /(?:Matriculation Number|Matric):?\s*([^\n,;\.]+)/gi,
      /(?:Email Address|Email):?\s*([^\n,;\.@]+@[^\n,;\.]+)/gi,
      /(?:Phone Number|Phone|Tel):?\s*([0-9+\-\s]{7,})/gi,
      /(?:Dr\.|Prof\.|Professor|Mr\.|Mrs\.|Miss|Ms\.)\s+([A-Z][a-z]+)/g,
    ];

    for (const field of sensitiveFields) {
      if (proposal[field as keyof Partial<IProposal>]) {
        let text = proposal[field as keyof Partial<IProposal>] as string;

        // Apply each pattern to remove personal information
        for (const pattern of personalInfoPatterns) {
          text = text.replace(pattern, '[REDACTED]');
        }

        proposal[field as keyof Partial<IProposal>] = text;
      }
    }

    return proposal;
  }
}

export default new DocumentService();

// Modified getProposalForReview controller
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
      reviewType: { $ne: 'ai' }, // Exclude AI reviews
    });

    if (!reviewAssignment) {
      throw new NotFoundError('You are not assigned to review this proposal');
    }

    // Get proposal details
    const proposal = await Proposal.findById(proposalId);

    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    // Process the proposal based on submitter type
    let processedProposal: any = {};

    if (proposal.submitterType === SubmitterType.STAFF) {
      // For staff proposals, we need to create a document from form data
      try {
        // Generate a document from the staff proposal form data
        const documentPath =
          await documentService.generateStaffProposalDocument(proposal);

        // Store the path to be used for AI review
        processedProposal = {
          ...proposal.toObject(),
          aiReadyDocumentPath: documentPath,
          // Remove submitter info before sending to reviewer
          submitter: undefined,
          coInvestigators: undefined,
          cvFile: undefined,
        };
      } catch (error) {
        logger.error(`Error generating document for staff proposal: ${error}`);
        throw new Error('Failed to process staff proposal for review');
      }
    } else if (proposal.submitterType === SubmitterType.MASTER_STUDENT) {
      // For master's student proposals, we need to parse the uploaded document
      try {
        if (!proposal.docFile) {
          throw new NotFoundError(
            'Document file not found for master student proposal'
          );
        }

        const filePath = path.join(
          __dirname,
          '../../uploads',
          proposal.docFile
        );

        // Extract text from the document
        const extractedText =
          await documentService.extractTextFromDocument(filePath);

        // Parse the extracted text to get structured proposal data
        const parsedProposal =
          await documentService.parseMasterStudentProposal(extractedText);

        // Merge the parsed data with the existing proposal data
        processedProposal = {
          ...proposal.toObject(),
          ...parsedProposal,
          // Remove submitter info before sending to reviewer
          submitter: undefined,
        };

        // Update the proposal in the database with the extracted fields if they're missing
        if (!proposal.projectTitle && parsedProposal.projectTitle) {
          await Proposal.findByIdAndUpdate(proposalId, {
            $set: {
              projectTitle: parsedProposal.projectTitle,
              problemStatement: parsedProposal.problemStatement,
              objectives: parsedProposal.objectives,
              methodology: parsedProposal.methodology,
              workPlan: parsedProposal.workPlan,
              estimatedBudget: parsedProposal.estimatedBudget,
            },
          });
        }
      } catch (error) {
        logger.error(`Error processing master's student proposal: ${error}`);
        throw new Error('Failed to process master student proposal for review');
      }
    } else {
      throw new BadRequestError('Unknown submitter type');
    }

    // Adapt scoring criteria based on proposal type
    // The scoring criteria are stored in the review model, but we should send appropriate guidance
    const scoringGuidance = {
      common: [
        'relevanceToNationalPriorities',
        'originalityAndInnovation',
        'clarityOfResearchProblem',
        'methodology',
        'literatureReview',
        'feasibilityAndTimeline',
        'budgetJustification',
      ],
      staff: [
        'teamComposition',
        'expectedOutcomes',
        'sustainabilityAndScalability',
      ],
      masterStudent: ['innovationAndImpact', 'interdisciplinaryRelevance'],
    };

    // Determine which scoring criteria to use based on proposal type
    const applicableCriteria = [
      ...scoringGuidance.common,
      ...(proposal.submitterType === SubmitterType.STAFF
        ? scoringGuidance.staff
        : scoringGuidance.masterStudent),
    ];

    res.status(200).json({
      success: true,
      data: {
        proposal: processedProposal,
        reviewAssignment,
        applicableCriteria,
      },
    });
  }
);

// services/aiReview.service.ts - Create this new service to handle AI review
import { IProposal } from '../Proposal_Submission/models/proposal.model';
import documentService from './document.service';
import axios from 'axios';

class AIReviewService {
  // Send proposal to AI review system
  async submitProposalForAIReview(proposal: IProposal): Promise<any> {
    try {
      let documentContent: string;

      if (proposal.submitterType === 'staff') {
        // Generate document from staff proposal form data
        const documentPath =
          await documentService.generateStaffProposalDocument(proposal);
        documentContent = fs.readFileSync(documentPath, 'utf8');
      } else {
        // For master's student proposals, we use the existing document but remove personal info
        if (!proposal.docFile) {
          throw new Error(
            'Document file not found for master student proposal'
          );
        }

        const filePath = path.join(
          __dirname,
          '../../uploads',
          proposal.docFile
        );
        const extractedText =
          await documentService.extractTextFromDocument(filePath);

        // Parse and sanitize the document
        const parsedProposal =
          await documentService.parseMasterStudentProposal(extractedText);

        // Convert the parsed proposal back to text format
        documentContent = `
# Research Proposal

## Project Title
${parsedProposal.projectTitle || 'N/A'}

## Problem Statement and Justification
${parsedProposal.problemStatement || 'N/A'}

## Objectives and Anticipated Outcomes
${parsedProposal.objectives || 'N/A'}

## Research-Informed Approach and Methodology
${parsedProposal.methodology || 'N/A'}

## Innovation and Impact
${parsedProposal.innovationAndImpact || 'N/A'}

## Interdisciplinary Relevance
${parsedProposal.interdisciplinaryRelevance || 'N/A'}

## Implementation Plan and Timeline
${parsedProposal.workPlan || 'N/A'}

## Preliminary Budget Estimate
${parsedProposal.estimatedBudget ? `$${parsedProposal.estimatedBudget.toLocaleString()}` : 'N/A'}
`;
      }

      // Send the document to the AI review system
      // This is a placeholder for the actual API call to your AI review system
      const aiResponse = await axios.post(
        process.env.AI_REVIEW_API_URL || 'http://localhost:5000/ai-review',
        {
          proposalId: proposal._id,
          documentContent,
          submitterType: proposal.submitterType,
        }
      );

      return aiResponse.data;
    } catch (error) {
      logger.error(`Error submitting proposal for AI review: ${error}`);
      throw new Error('Failed to submit proposal for AI review');
    }
  }
}

export default new AIReviewService();
