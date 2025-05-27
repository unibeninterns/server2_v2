import { commonStyles, commonFooter } from './styles';
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
    subjectLine = 'Congratulations! Your Proposal Has Been Accepted';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We are pleased to inform you that your proposal "<strong>${projectTitle}</strong>" has been approved.</p>
    `;
    if (fundingAmount) {
      bodyContent += `<p>You have been awarded a funding of NGN ${fundingAmount.toLocaleString()}.</p>`;
    }
    bodyContent += `<p>Further details will be communicated shortly.</p>`;
  } else if (status === ProposalStatus.REJECTED) {
    subjectLine = 'Update on Your Proposal Submission: Decision Made';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We regret to inform you that your proposal "<strong>${projectTitle}</strong>" was not selected for funding at this time.</p>
    `;
    if (feedbackComments) {
      bodyContent += `
        <div class="feedback">
            <p><strong>Feedback:</strong></p>
            <p>${feedbackComments}</p>
        </div>
      `;
    }
    bodyContent += `<p>We encourage you to continue your research efforts.</p>`;
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
        <p>Sincerely,</p>
        <p>The University Research Grant Team</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
};
