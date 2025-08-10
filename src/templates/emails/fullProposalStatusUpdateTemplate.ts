import { commonStyles, submissionConfirmationFooter } from './styles';
import { ProposalStatus } from '../../Proposal_Submission/models/proposal.model';

export const fullProposalStatusUpdateTemplate = (
  name: string,
  projectTitle: string,
  status: ProposalStatus,
  feedbackComments?: string
): string => {
  let subjectLine = '';
  let bodyContent = '';

  if (status === ProposalStatus.APPROVED) {
    subjectLine =
      'Congratulations! Your Full Proposal Has Been Shortlisted And Approved';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We are pleased to inform you that your full proposal "<strong>${projectTitle}</strong>" has been approved.</p>
        <p>Your concept note has been shortlisted for the TETFund Institutional-Based Research (IBR) Grant.</p>
    `;
    bodyContent += `
        <p>You will recieve further information by the directorate soon, firstly login into your dashboard and click on view deatils for the approved proposal to view the next steps instructions.</p>
    `;
  } else if (status === ProposalStatus.REJECTED) {
    subjectLine = 'Update on Your Full Proposal Submission: Decision Made';
    bodyContent = `
        <p>Dear ${name},</p>
        <p>We regret to inform you that your full proposal "<strong>${projectTitle}</strong>" was not shortlisted for funding at this time.</p>
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
        <p>While it wasn't shortlisted this time, we encourage you to consider the feedback and apply again in the future.</p>
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
