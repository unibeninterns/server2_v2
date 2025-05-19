// src/services/documentProcessing.service.ts
import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { PDFExtract } from 'pdf.js-extract';
import logger from '../utils/logger';
import Proposal, {
  IProposal,
  SubmitterType,
} from '../Proposal_Submission/models/proposal.model';
import User from '../model/user.model';

class DocumentProcessingService {
  private pdfExtract = new PDFExtract();

  /**
   * Process a proposal document for review - removing personal information
   * and standardizing the format for both staff and master's student proposals
   */
  async processProposalForReview(proposalId: string): Promise<{
    anonymizedDocPath?: string;
    extractedContent?: Record<string, any>;
    error?: string;
  }> {
    try {
      const proposal =
        await Proposal.findById(proposalId).populate('submitter');

      if (!proposal) {
        return { error: 'Proposal not found' };
      }

      // Create output directory if it doesn't exist
      const outputDir = path.join(__dirname, '../uploads/processed_proposals');
      await fs.mkdir(outputDir, { recursive: true });

      // Define output file path
      const outputFilePath = path.join(
        outputDir,
        `proposal_${proposalId}_anonymized.pdf`
      );

      if (proposal.submitterType === SubmitterType.MASTER_STUDENT) {
        // For master's students, we need to process the uploaded document
        if (!proposal.docFile) {
          return {
            error: 'No document file found for master student proposal',
          };
        }

        const docPath = path.join(__dirname, '..', proposal.docFile);
        const fileExt = path.extname(docPath).toLowerCase();

        // Extract content from document first
        const extractedContent = await this.extractContentFromDocument(
          docPath,
          fileExt
        );

        // Generate anonymized PDF (removing personal details)
        const anonymizedDocPath = await this.anonymizeMasterStudentDocument(
          docPath,
          outputFilePath,
          fileExt,
          proposal.submitter as any
        );

        return {
          anonymizedDocPath,
          extractedContent,
        };
      } else {
        // For staff proposals, we generate a document from the form fields
        const anonymizedDocPath = await this.generateStaffProposalDocument(
          proposal,
          outputFilePath
        );

        return {
          anonymizedDocPath,
          extractedContent: this.mapProposalToExtractedContent(proposal),
        };
      }
    } catch (error) {
      logger.error('Error processing proposal document:', error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error processing document',
      };
    }
  }

  /**
   * Extract content from uploaded document (PDF or DOCX)
   */
  private async extractContentFromDocument(
    filePath: string,
    fileExt: string
  ): Promise<Record<string, any>> {
    try {
      if (fileExt === '.pdf') {
        return await this.extractFromPDF(filePath);
      } else if (fileExt === '.docx') {
        return await this.extractFromDOCX(filePath);
      } else {
        throw new Error(`Unsupported file format: ${fileExt}`);
      }
    } catch (error) {
      logger.error('Error extracting content from document:', error);
      throw error;
    }
  }

  /**
   * Extract content from PDF using heuristics to match master's proposal template
   */
  private async extractFromPDF(pdfPath: string): Promise<Record<string, any>> {
    const data = await this.pdfExtract.extract(pdfPath);
    const fullText = data.pages
      .map((page) => page.content.map((item) => item.str).join(' '))
      .join('\n');

    return this.parseContentByTemplate(fullText);
  }

  /**
   * Extract content from DOCX file
   */
  private async extractFromDOCX(
    docxPath: string
  ): Promise<Record<string, any>> {
    const result = await mammoth.extractRawText({ path: docxPath });
    return this.parseContentByTemplate(result.value);
  }

  /**
   * Parse content using master's student template structure
   * Uses heuristics to identify different sections of the proposal
   */
  private parseContentByTemplate(content: string): Record<string, any> {
    // Expected sections based on the master's student template
    const sections = {
      projectTitle: '',
      leadResearcher: {
        fullName: '',
        matricNumber: '',
        programme: '',
        department: '',
        faculty: '',
        email: '',
        phone: '',
      },
      problemStatement: '',
      objectives: '',
      methodology: '',
      innovation: '',
      interdisciplinary: '',
      implementation: '',
      budget: '',
    };

    // Extract project title (usually first line or after "Project Title:")
    const titleMatch = content.match(/Project Title:?\s*([^\n]+)/i);
    if (titleMatch) sections.projectTitle = titleMatch[1].trim();

    // Extract lead researcher info
    const nameMatch = content.match(/Full Name:?\s*([^\n]+)/i);
    if (nameMatch) sections.leadResearcher.fullName = nameMatch[1].trim();

    const matricMatch = content.match(/Matriculation Number:?\s*([^\n]+)/i);
    if (matricMatch)
      sections.leadResearcher.matricNumber = matricMatch[1].trim();

    const programmeMatch = content.match(/Programme:?\s*([^\n]+)/i);
    if (programmeMatch)
      sections.leadResearcher.programme = programmeMatch[1].trim();

    // Extract primary sections
    const problemMatch = content.match(
      /Problem Statement and Justification:?\s*([^]*?)(?=Objectives|$)/i
    );
    if (problemMatch) sections.problemStatement = problemMatch[1].trim();

    const objectivesMatch = content.match(
      /Objectives and Anticipated Outcomes:?\s*([^]*?)(?=Research-Informed|$)/i
    );
    if (objectivesMatch) sections.objectives = objectivesMatch[1].trim();

    const methodologyMatch = content.match(
      /Research-Informed Approach and Methodology:?\s*([^]*?)(?=Innovation|$)/i
    );
    if (methodologyMatch) sections.methodology = methodologyMatch[1].trim();

    const innovationMatch = content.match(
      /Innovation and Impact:?\s*([^]*?)(?=Interdisciplinary|$)/i
    );
    if (innovationMatch) sections.innovation = innovationMatch[1].trim();

    const interdisciplinaryMatch = content.match(
      /Interdisciplinary Relevance:?\s*([^]*?)(?=Implementation|$)/i
    );
    if (interdisciplinaryMatch)
      sections.interdisciplinary = interdisciplinaryMatch[1].trim();

    const implementationMatch = content.match(
      /Implementation Plan and Timeline:?\s*([^]*?)(?=Preliminary Budget|$)/i
    );
    if (implementationMatch)
      sections.implementation = implementationMatch[1].trim();

    const budgetMatch = content.match(
      /Preliminary Budget Estimate:?\s*([^]*?)(?=Important Submission|$)/i
    );
    if (budgetMatch) sections.budget = budgetMatch[1].trim();

    return sections;
  }

  /**
   * Anonymize a master's student document by removing personal information
   */
  private async anonymizeMasterStudentDocument(
    sourceDoc: string,
    outputPath: string,
    fileExt: string,
    submitter: any
  ): Promise<string> {
    // This is a placeholder for the actual anonymization logic
    // In a real implementation, you would:
    // 1. Use PDF manipulation libraries (like pdf-lib) or docx libraries for docx files
    // 2. Remove/redact the personal information sections
    // 3. Save the modified document

    // For this example, we'll simulate the operation by copying the file
    await fs.copyFile(sourceDoc, outputPath);

    logger.info(`Anonymized document saved to ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate a document for staff proposals based on the form fields
   */
  private async generateStaffProposalDocument(
    proposal: IProposal,
    outputPath: string
  ): Promise<string> {
    // This is a placeholder for actual document generation logic
    // In a real implementation, you would use PDF generation libraries
    // like PDFKit, jsPDF or document templating libraries

    // For this example, we'll just create a simple text file as a placeholder
    const proposalContent = `
      Project Title: ${proposal.projectTitle}
      
      Problem Statement:
      ${proposal.problemStatement}
      
      Research Objectives:
      ${proposal.objectives}
      
      Methodology:
      ${proposal.methodology}
      
      Expected Outcomes:
      ${proposal.expectedOutcomes}
      
      Work Plan:
      ${proposal.workPlan}
      
      Estimated Budget: ${proposal.estimatedBudget}
    `;

    await fs.writeFile(outputPath, proposalContent);

    logger.info(`Staff proposal document generated at ${outputPath}`);
    return outputPath;
  }

  /**
   * Map proposal fields to structured extracted content format
   */
  private mapProposalToExtractedContent(
    proposal: IProposal
  ): Record<string, any> {
    return {
      projectTitle: proposal.projectTitle || '',
      problemStatement: proposal.problemStatement || '',
      objectives: proposal.objectives || '',
      methodology: proposal.methodology || '',
      expectedOutcomes: proposal.expectedOutcomes || '',
      workPlan: proposal.workPlan || '',
      budget: proposal.estimatedBudget?.toString() || '',
      // Add other relevant fields
    };
  }
}

export default new DocumentProcessingService();
