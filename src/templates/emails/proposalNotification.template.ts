import { commonStyles, commonFooter } from './styles';

export const proposalNotificationTemplate = (
  researcher: string,
  proposalTitle: string,
  submitterTypeText: string,
  reviewUrl: string
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>New Research Proposal Submission</h1>
    </div>
    
    <div class="content">
        <p><strong>${researcher}</strong> (${submitterTypeText}) has submitted a new research proposal titled:</p>
        
        <div class="proposal-title">"${proposalTitle}"</div>
        
        <p>Please log in to the research portal to review this proposal at your earliest convenience.</p>
        
        <a href="${reviewUrl}" class="button">Review Proposal Now</a>
        
        <p>For any questions regarding the review process, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
