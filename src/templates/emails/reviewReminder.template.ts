import { commonStyles, commonFooter } from './styles';

export const reviewReminderTemplate = (
  reviewerName: string,
  proposalTitle: string,
  reviewUrl: string,
  dueDate: Date
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
        .deadline-notice {
            color: #ff6600;
            font-weight: bold;
            padding: 10px;
            background-color: #fff5e6;
            border-left: 3px solid #ff6600;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Reminder: Research Proposal Review Due Soon</h1>
    </div>
    
    <div class="content">
        <p>Dear <strong>${reviewerName}</strong>,</p>
        
        <p>This is a friendly reminder that your review for the proposal titled:</p>
        
        <div class="proposal-title">"${proposalTitle}"</div>
        
        <p class="deadline-notice">Is due by <strong>${new Date(
          dueDate
        ).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}</strong> (in 2 days).</p>
        
        <p>Please log in to the research portal to complete your review as soon as possible.</p>
        
        <a href="${reviewUrl}" class="button">Complete Review Now</a>
        
        <p>Your expert evaluation is essential to our research quality assurance process, and we appreciate your timely attention to this assignment.</p>
        
        <p>If you have any questions or need assistance with the review platform, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
