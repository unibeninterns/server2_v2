import { commonStyles, commonFooter } from './styles';

export const proposalArchiveNotificationTemplate = (
  name: string,
  projectTitle: string
): string => `
<html>
<head>
    <style type="text/css">
        ${commonStyles}
    </style>
</head>
<body>
    <div class="header">
        <h1>Your Proposal Has Been Archived</h1>
    </div>
    
    <div class="content">
        <p>Dear ${name},</p>
        <p>We wish to inform you that your proposal titled "<strong>${projectTitle}</strong>" has been archived.</p>
        <p>This means it will no longer appear in your active proposals list, but remains accessible for record-keeping.</p>
        <p>If you have any questions, please contact the administration.</p>
        <p>Sincerely,</p>
        <p>DRID</p>
    </div>
    
    ${commonFooter}
</body>
</html>
`;
