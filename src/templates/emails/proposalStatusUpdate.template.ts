import { commonStyles, submissionConfirmationFooter } from './styles';
import { ProposalStatus } from '../../Proposal_Submission/models/proposal.model';

export const proposalStatusUpdateTemplate = (
  name: string,
  projectTitle: string,
  status: ProposalStatus,
  fundingAmount?: number,
  feedbackComments?: string
): string => {
  let subjectLine = '';
  let bodyContent = '';

  if (status === ProposalStatus.APPROVED) {
    subjectLine =
      'Congratulations! Your Proposal Has Been Approved for the next stage';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We are pleased to inform you that your proposal "<strong>${projectTitle}</strong>" has been approved.</p>
        <p>Your concept note has been shortlisted for the TETFund Institutional-Based Research (IBR) Grant.</p>
    `;
    if (fundingAmount) {
      bodyContent += `<p>You have the opportunity of being awarded a funding of NGN ${fundingAmount.toLocaleString()} after the next stage</p>`;
    }
    bodyContent += `
        <p>You are hereby invited to submit a full proposal on the portal on or before 31st July 2025.</p>
        <p>Login into your researcher dashboard using the credentials sent previously to view the full proposal template and submit your full proposal.</p>
    `;
  } else if (status === ProposalStatus.REJECTED) {
    subjectLine = 'Update on Your Proposal Submission: Decision Made';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We regret to inform you that your proposal "<strong>${projectTitle}</strong>" was not selected for funding at this time.</p>
    `;
    if (feedbackComments) {
      bodyContent += `
        <div class="feedback">
            <p><strong>Feedback from the review committee:</strong></p>
            <p>${feedbackComments}</p>
        </div>
      `;
    }
    bodyContent += `
        <p>We appreciate the time and effort you put into your proposal.</p>
        <p>While it wasn't selected this time, we encourage you to consider the feedback and apply again in the future.</p>
      `;
  } else {
    subjectLine = 'Update on your Proposal Submission';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>This is an update regarding your proposal "<strong>${projectTitle}</strong>". Its current status is: <strong>${status}</strong>.</p>
    `;
  }

  return `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
        .feedback {
            background-color: #f0f0f0;
            border-left: 4px solid #ccc;
            margin: 10px 0;
            padding: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${subjectLine}</h1>
    </div>
    
    <div class="content">
        ${bodyContent}
    </div>
    
    ${submissionConfirmationFooter}
</body>
</html>
`;
};
