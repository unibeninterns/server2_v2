import { statusUpdateStyles } from './styles';

export const statusUpdateTemplate = (
  researcher: string,
  proposalTitle: string,
  statusMessage: string,
  proposalUrl: string
): string => `
<html>
<head>
    <style type="text/css">
        ${statusUpdateStyles}
    </style>
</head>
<body>
    <h1>Research Proposal Status Update</h1>
    <p>Dear ${researcher},</p>
    <p>Your research proposal titled <strong>"${proposalTitle}"</strong> has been <strong>${statusMessage}</strong>.</p>
    <p>Please log in to the research portal to view more details.</p>
    <a href="${proposalUrl}">View Your Proposals</a>
</body>
</html>
`;
