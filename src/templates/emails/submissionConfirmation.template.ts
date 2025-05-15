import {
  submissionConfirmationStyles,
  submissionConfirmationFooter,
} from './styles';

export const submissionConfirmationTemplate = (
  name: string,
  proposalTitle: string,
  submitterType: string,
  submitterTypeText: string
): string => `
<html>
<head>
    <style type="text/css">
        ${submissionConfirmationStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>Proposal Submission Confirmation</h1>
    </div>
    
    <div class="content">
        <p>Dear ${name},</p>
        
        <p>Thank you for submitting your ${submitterTypeText} research proposal${submitterType === 'staff' && proposalTitle ? ` titled <strong class="highlight">"${proposalTitle}"</strong>` : ''}.</p>
        
        <p>Your proposal has been received and is now under review by our committee.</p>
        
        <p>We appreciate your contribution to the research community at the University of Benin. You will receive further communication regarding the status of your proposal as soon as possible</p>
    </div>
    
    ${submissionConfirmationFooter}
</body>
</html>
`;
