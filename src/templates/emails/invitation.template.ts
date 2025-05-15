import { commonStyles, commonFooter } from './styles';

export const invitationTemplate = (inviteUrl: string): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>Research Portal Invitation</h1>
    </div>
    
    <div class="content">
        <p>You have been invited to join the University of Benin Research Portal as a researcher.</p>
        
        <p>Our portal allows you to submit research proposals, track their progress, and collaborate with other researchers.</p>
        
        <p>Please click the button below to complete your profile:</p>
        
        <a href="${inviteUrl}" class="button">Complete Your Profile</a>
        
        <p>This invitation link will expire in 30 days.</p>
        
        <p>If you have any questions about this invitation, please contact the Research Directorate.</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
