import nodemailer, { Transporter } from 'nodemailer';
import logger from '../utils/logger';
import validateEnv from '../utils/validateEnv';
import { SubmitterType } from '../Proposal_Submission/models/proposal.model';
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
} from '../templates/emails';

validateEnv();

type ProposalStatus =
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'under_review';

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

  async sendProposalStatusUpdateEmail(
    email: string,
    researcher: string,
    proposalTitle: string,
    status: ProposalStatus
  ): Promise<void> {
    const statusText: Record<ProposalStatus, string> = {
      approved: 'approved',
      rejected: 'rejected',
      revision_requested: 'returned for revision',
      under_review: 'under review',
    };

    const statusMessage = statusText[status] || status;
    const proposalUrl = `${this.frontendUrl}/proposals/my-proposals`;

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: email,
        subject: `Research Proposal Status Update: ${proposalTitle}`,
        html: statusUpdateTemplate(
          researcher,
          proposalTitle,
          statusMessage,
          proposalUrl
        ),
      });
      logger.info(`Proposal status update email sent to ${email}`);
    } catch (error) {
      logger.error(
        'Failed to send proposal status update email:',
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
    const reviewUrl = `${this.frontendUrl}/reviewer/dashboard`;

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
    const reviewUrl = `${this.frontendUrl}/reviewer/dashboard`;

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
    const reviewUrl = `${this.frontendUrl}/reviewer/dashboard`;

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
    const reviewUrl = `${this.frontendUrl}/reviewer/dashboard`;

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
