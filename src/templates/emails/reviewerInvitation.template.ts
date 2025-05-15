import { commonStyles, commonFooter } from './styles';

export const reviewerInvitationTemplate = (inviteUrl: string): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>Invitation to Join as a Research Proposal Reviewer</h1>
    </div>
    
    <div class="content">
        <p>You have been invited to join the University of Benin Research Portal as a proposal reviewer.</p>
        
        <p>As a reviewer, you will play a vital role in evaluating research proposals submitted by faculty members and students.</p>
        
        <p>Please click the button below to complete your profile and accept this invitation:</p>
        
        <a href="${inviteUrl}" class="button">Complete Your Profile</a>
        
        <p>This invitation link will expire in 30 days.</p>
        
        <p>If you have any questions about this invitation, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
