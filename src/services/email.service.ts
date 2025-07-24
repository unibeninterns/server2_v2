import nodemailer, { Transporter } from 'nodemailer';
import logger from '../utils/logger';
import validateEnv from '../utils/validateEnv';
import {
  SubmitterType,
  ProposalStatus,
} from '../Proposal_Submission/models/proposal.model';
import { FullProposalStatus } from '../researchers/models/fullProposal.model';
import {
  reviewReminderTemplate,
  overdueReviewTemplate,
  reconciliationAssignmentTemplate,
  reviewAssignmentTemplate,
  proposalNotificationTemplate,
  submissionConfirmationTemplate,
  statusUpdateTemplate,
  reviewerInvitationTemplate,
  reviewerCredentialsTemplate,
  invitationTemplate,
  credentialsTemplate,
  aiReviewFailureTemplate,
  proposalStatusUpdateTemplate,
  proposalArchiveNotificationTemplate,
} from '../templates/emails';
import { fullProposalStatusUpdateTemplate } from '../templates/emails/fullProposalStatusUpdateTemplate';

validateEnv();

class EmailService {
  private transporter: Transporter;
  private frontendUrl: string;
  private emailFrom: string;

  constructor() {
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS
    ) {
      throw new Error(
        'SMTP configuration must be defined in environment variables'
      );
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    this.frontendUrl = process.env.FRONTEND_URL || '';
    this.emailFrom = process.env.EMAIL_FROM || '';

    if (!this.frontendUrl || !this.emailFrom) {
      throw new Error(
        'FRONTEND_URL and EMAIL_FROM must be defined in environment variables'
      );
    }
  }

  private getSubmitterTypeText(submitterType: SubmitterType): string {
    return submitterType === 'staff' ? 'Staff Member' : "Master's Student";
  }

  private getProposalStatusUpdateSubject(
    status: ProposalStatus,
    proposalTitle: string
  ): string {
    if (status === ProposalStatus.APPROVED) {
      return `Congratulations! Your Proposal "${proposalTitle}" Has Been Accepted`;
    } else if (status === ProposalStatus.REJECTED) {
      return `Update on Your Proposal Submission: Decision Made for "${proposalTitle}"`;
    } else {
      return `Update on your Proposal Submission: ${proposalTitle}`;
    }
  }

  private getFullProposalStatusUpdateSubject(
    status: ProposalStatus,
    proposalTitle: string
  ): string {
    if (status === FullProposalStatus.APPROVED) {
      return `Congratulations! Your Full Proposal "${proposalTitle}" Has Been Shortlisted and Approved`;
    } else if (status === FullProposalStatus.REJECTED) {
      return `Update on Your Proposal Submission: Decision Made for "${proposalTitle}"`;
    } else {
      return `Update on your Proposal Submission: ${proposalTitle}`;
    }
  }

  async sendAiReviewFailureEmail(
    to: string,
    proposalId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: to,
        subject: `AI Review Generation Failed for Proposal ${proposalId}`,
        html: aiReviewFailureTemplate(proposalId, errorMessage),
      });
      logger.info(
        `AI review failure email sent to: ${to} for proposal ${proposalId}`
      );
    } catch (error) {
      logger.error(
        `Failed to send AI review failure email to ${to} for proposal ${proposalId}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async sendProposalStatusUpdateEmail(
    to: string,
    name: string,
    projectTitle: string,
    status: ProposalStatus,
    fundingAmount?: number,
    feedbackComments?: string
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: to,
        subject: this.getProposalStatusUpdateSubject(status, projectTitle),
        html: proposalStatusUpdateTemplate(
          name,
          projectTitle,
          status,
          fundingAmount,
          feedbackComments
        ),
      });
      logger.info(
        `Proposal status update email sent to: ${to} for proposal ${projectTitle}`
      );
    } catch (error) {
      logger.error(
        `Failed to send proposal status update email to ${to} for proposal ${projectTitle}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async sendFullProposalStatusUpdateEmail(
    to: string,
    name: string,
    projectTitle: string,
    status: ProposalStatus,
    feedbackComments?: string
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: to,
        subject: this.getFullProposalStatusUpdateSubject(status, projectTitle),
        html: fullProposalStatusUpdateTemplate(
          name,
          projectTitle,
          status,
          feedbackComments
        ),
      });
      logger.info(
        `Full proposal status update email sent to: ${to} for proposal ${projectTitle}`
      );
    } catch (error) {
      logger.error(
        `Failed to send full proposal status update email to ${to} for proposal ${projectTitle}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async sendProposalArchiveNotificationEmail(
    to: string,
    name: string,
    projectTitle: string,
    isArchived: boolean,
    comment?: string
  ): Promise<void> {
    const subject = isArchived
      ? `Your Proposal "${projectTitle}" Has Been Archived`
      : `Your Proposal "${projectTitle}" Has Been Unarchived`;
    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: to,
        subject: subject,
        html: proposalArchiveNotificationTemplate(
          name,
          projectTitle,
          isArchived,
          comment
        ),
      });
      logger.info(
        `${isArchived ? 'Archive' : 'Unarchive'} notification email sent to: ${to} for proposal ${projectTitle}`
      );
    } catch (error) {
      logger.error(
        `Failed to send ${isArchived ? 'archive' : 'unarchive'} notification email to ${to} for proposal ${projectTitle}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async sendProposalNotificationEmail(
    reviewerEmails: string | string[],
    researcher: string,
    proposalTitle: string,
    submitterType: SubmitterType
  ): Promise<void> {
    const submitterTypeText = this.getSubmitterTypeText(submitterType);
    const reviewUrl = `${this.frontendUrl}/admin/proposals`;

    // Handle comma-separated emails or single email
    const recipients = Array.isArray(reviewerEmails)
      ? reviewerEmails
      : reviewerEmails.split(',').map((email) => email.trim());

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: recipients.join(','),
        subject: `New Research Proposal Submission by ${researcher}`,
        html: proposalNotificationTemplate(
          researcher,
          proposalTitle,
          submitterTypeText,
          reviewUrl
        ),
      });
      logger.info(
        `Proposal notification email sent to reviewers: ${recipients.join(', ')}`
      );
    } catch (error) {
      logger.error(
        'Failed to send proposal notification email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendSubmissionConfirmationEmail(
    email: string,
    name: string,
    proposalTitle: string,
    submitterType: SubmitterType
  ): Promise<void> {
    const submitterTypeText = this.getSubmitterTypeText(submitterType);

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: `Research Proposal Submission Confirmation`,
        html: submissionConfirmationTemplate(
          name,
          proposalTitle,
          submitterType,
          submitterTypeText
        ),
      });
      logger.info(`Submission confirmation email sent to ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send submission confirmation email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendReviewerInvitationEmail(
    email: string,
    token: string
  ): Promise<void> {
    const inviteUrl = `${this.frontendUrl}/accept-invitation/${token}`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Invitation to join as a Research Proposal Reviewer',
        html: reviewerInvitationTemplate(inviteUrl),
      });
      logger.info(`Reviewer invitation email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send reviewer invitation email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendReviewerCredentialsEmail(
    email: string,
    password: string
  ): Promise<void> {
    const loginUrl = `${this.frontendUrl}/reviewers/login`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Your Research Portal Reviewer Account Credentials',
        html: reviewerCredentialsTemplate(email, password, loginUrl),
      });
      logger.info(`Reviewer credentials email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send reviewer credentials email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendReviewAssignmentEmail(
    email: string,
    proposalTitle: string,
    researcherName: string,
    dueDate: Date
  ): Promise<void> {
    const reviewUrl = `${this.frontendUrl}/reviewers/assignments`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'New Research Proposal Assignment',
        html: reviewAssignmentTemplate(
          proposalTitle,
          researcherName,
          reviewUrl,
          dueDate
        ),
      });
      logger.info(`Review assignment email sent to reviewer: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send review assignment email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendInvitationEmail(email: string, token: string): Promise<void> {
    const inviteUrl = `${this.frontendUrl}/researcher-register/${token}`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Invitation to join the Research Portal',
        html: invitationTemplate(inviteUrl),
      });
      logger.info(`Invitation email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send invitation email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendCredentialsEmail(email: string, password: string): Promise<void> {
    const loginUrl = `${this.frontendUrl}/researchers/login`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Your Research Portal Account Credentials',
        html: credentialsTemplate(email, password, loginUrl),
      });
      logger.info(`Credentials email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send credentials email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendReviewReminderEmail(
    email: string,
    reviewerName: string,
    proposalTitle: string,
    dueDate: Date
  ): Promise<void> {
    const reviewUrl = `${this.frontendUrl}/reviewers/dashboard`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Reminder: Research Proposal Review Due Soon',
        html: reviewReminderTemplate(
          reviewerName,
          proposalTitle,
          reviewUrl,
          dueDate
        ),
      });
      logger.info(`Review reminder email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send review reminder email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendOverdueReviewNotification(
    email: string,
    reviewerName: string,
    proposalTitle: string
  ): Promise<void> {
    const reviewUrl = `${this.frontendUrl}/reviewers/dashboard`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'OVERDUE: Research Proposal Review',
        html: overdueReviewTemplate(reviewerName, proposalTitle, reviewUrl),
      });
      logger.info(`Overdue review notification sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send overdue review notification:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async sendReconciliationAssignmentEmail(
    email: string,
    reviewerName: string,
    proposalTitle: string,
    dueDate: Date,
    reviewCount: number,
    averageScore: number,
    scores: number[]
  ): Promise<void> {
    const reviewUrl = `${this.frontendUrl}/reviewers/dashboard`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: 'Reconciliation Review Assignment',
        html: reconciliationAssignmentTemplate(
          reviewerName,
          proposalTitle,
          reviewUrl,
          dueDate,
          reviewCount,
          averageScore,
          scores
        ),
      });
      logger.info(`Reconciliation assignment email sent to: ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send reconciliation assignment email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export default new EmailService();
