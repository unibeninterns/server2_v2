import { commonStyles, commonFooter } from './styles';

export const overdueReviewTemplate = (
  reviewerName: string,
  proposalTitle: string,
  reviewUrl: string
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
        .overdue-notice {
            color: #cc0000;
            font-weight: bold;
            padding: 10px;
            background-color: #ffecec;
            border-left: 3px solid #cc0000;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>OVERDUE: Research Proposal Review</h1>
    </div>
    
    <div class="content">
        <p>Dear <strong>${reviewerName}</strong>,</p>
        
        <p>Our records indicate that your review for the following proposal is now <strong>overdue</strong>:</p>
        
        <div class="proposal-title">"${proposalTitle}"</div>
        
        <p class="overdue-notice">This review is past its due date. Please complete it as soon as possible.</p>
        
        <p>Your expert evaluation is critical to our research quality assurance process, and the decision on this proposal cannot be finalized without your input.</p>
        
        <a href="${reviewUrl}" class="button">Complete Review Now</a>
        
        <p>If you are experiencing difficulties completing the review or need an extension, please inform the Research Directorate immediately.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
