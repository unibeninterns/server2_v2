import { commonStyles, commonFooter } from './styles';

export const reviewAssignmentTemplate = (
  proposalTitle: string,
  researcherName: string,
  reviewUrl: string,
  dueDate: Date
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>New Research Proposal Assignment</h1>
    </div>
    
    <div class="content">
        <p>You have been assigned to review a research proposal titled:</p>
        
        <div class="proposal-title">"${proposalTitle}"</div>
        
        <p>Please log in to the research portal to access the full proposal and complete your review at your earliest convenience.</p>

        <p class="deadline-notice">Please complete your review by <strong>${new Date(
          dueDate
        ).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}</strong>.</p>
        
        <a href="${reviewUrl}" class="button">Review Proposal Now</a>
        
        <p>Your expert evaluation is vital to maintaining the quality of research at our institution.</p>
        
        <p>For any questions regarding the review process, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
